import { decodeCursor, encodeCursor, newId } from '../lib/security.js';

async function decorateContent(ctx, rows, viewerId) {
  const { storage } = ctx;
  return Promise.all(rows.map(async row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.created_at,
    author: { id: row.author_id, username: row.username, displayName: row.display_name },
    likes: Number(row.likes || 0),
    comments: Number(row.comments || 0),
    views: Number(row.views || 0),
    likedByMe: Boolean(row.liked_by_me),
    media: row.media_asset_id ? {
      id: row.media_asset_id,
      status: row.media_status,
      url: row.processed_key ? await storage.getUrl(row.processed_key) : null,
      thumbnailUrl: row.thumbnail_key ? await storage.getUrl(row.thumbnail_key) : null,
      width: row.width,
      height: row.height,
      durationSeconds: row.duration_seconds
    } : null
  })));
}

const baseSelect = `
  SELECT c.id,c.author_id,c.type,c.title,c.body,c.visibility,c.created_at,
         p.username,p.display_name,c.media_asset_id,m.status AS media_status,m.processed_key,m.thumbnail_key,m.width,m.height,m.duration_seconds,
         COALESCE(cs.like_count,0) AS likes,COALESCE(cs.comment_count,0) AS comments,COALESCE(cs.view_count,0) AS views,
         CASE WHEN my.user_id IS NULL THEN FALSE ELSE TRUE END AS liked_by_me
  FROM content c
  JOIN profiles p ON p.user_id=c.author_id
  LEFT JOIN media_assets m ON m.id=c.media_asset_id
  LEFT JOIN content_stats cs ON cs.content_id=c.id
  LEFT JOIN reactions my ON my.content_id=c.id AND my.user_id=$1 AND my.reaction_type='like'`;

export async function contentRoutes(app, ctx) {
  const { pool, auth } = ctx;

  app.get('/api/feed', {
    preHandler: auth.optionalAuth,
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } } } }
  }, async request => {
    const cursor = decodeCursor(request.query.cursor);
    const params = [request.auth?.id || null];
    let cursorWhere = '';
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      cursorWhere = ` AND (c.created_at,c.id) < ($2::timestamptz,$3::uuid)`;
    }
    params.push(request.query.limit + 1);
    const limitIndex = params.length;
    const result = await pool.query(
      `${baseSelect}
       WHERE c.status='published' AND c.visibility='public' ${cursorWhere}
       ORDER BY c.created_at DESC,c.id DESC LIMIT $${limitIndex}`, params
    );
    const hasMore = result.rows.length > request.query.limit;
    const rows = hasMore ? result.rows.slice(0, request.query.limit) : result.rows;
    const items = await decorateContent(ctx, rows, request.auth?.id);
    const last = rows.at(-1);
    return { items, nextCursor: hasMore && last ? encodeCursor(last.created_at,last.id) : null };
  });

  app.post('/api/content/posts', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { body: { type: 'object', additionalProperties: false, required: ['body'], properties: {
      body: { type: 'string', minLength: 1, maxLength: 5000 },
      visibility: { type: 'string', enum: ['public','followers','private'], default: 'public' }
    } } }
  }, async (request, reply) => {
    const id = newId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO content(id,author_id,type,body,visibility,status) VALUES($1,$2,'post',$3,$4,'published')`,
        [id,request.auth.id,request.body.body.trim(),request.body.visibility]
      );
      await client.query('INSERT INTO content_stats(content_id) VALUES($1)',[id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return reply.code(201).send({ id });
  });

  app.post('/api/content/videos', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { body: { type: 'object', additionalProperties: false, required: ['mediaAssetId','title','type'], properties: {
      mediaAssetId: { type: 'string', format: 'uuid' },
      title: { type: 'string', minLength: 1, maxLength: 180 },
      body: { type: 'string', maxLength: 5000, default: '' },
      type: { type: 'string', enum: ['video','short'] },
      visibility: { type: 'string', enum: ['public','followers','private'], default: 'public' }
    } } }
  }, async (request, reply) => {
    const media = await pool.query('SELECT id,status,owner_id,width,height FROM media_assets WHERE id=$1', [request.body.mediaAssetId]);
    if (!media.rowCount || media.rows[0].owner_id !== request.auth.id) return reply.code(404).send({ error: 'MEDIA_NOT_FOUND' });
    if (media.rows[0].status !== 'ready') return reply.code(409).send({ error: 'MEDIA_NOT_READY' });
    if (request.body.type === 'short' && media.rows[0].height <= media.rows[0].width) return reply.code(400).send({ error: 'SHORT_MUST_BE_VERTICAL' });
    const id = newId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO content(id,author_id,type,title,body,visibility,status,media_asset_id)
         VALUES($1,$2,$3,$4,$5,$6,'published',$7)`,
        [id,request.auth.id,request.body.type,request.body.title.trim(),request.body.body || '',request.body.visibility,request.body.mediaAssetId]
      );
      await client.query('INSERT INTO content_stats(content_id) VALUES($1)',[id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return reply.code(201).send({ id });
  });

  app.get('/api/content/:id/comments', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } }
  }, async (request, reply) => {
    const exists = await pool.query("SELECT 1 FROM content WHERE id=$1 AND status='published'", [request.params.id]);
    if (!exists.rowCount) return reply.code(404).send({ error: 'CONTENT_NOT_FOUND' });
    const result = await pool.query(
      `SELECT cm.id,cm.body,cm.created_at,p.username,p.display_name
       FROM comments cm JOIN profiles p ON p.user_id=cm.author_id
       WHERE cm.content_id=$1 AND cm.status='published' ORDER BY cm.created_at ASC,cm.id ASC LIMIT 200`, [request.params.id]
    );
    return { items: result.rows.map(r => ({ id:r.id,body:r.body,createdAt:r.created_at,author:{username:r.username,displayName:r.display_name} })) };
  });

  app.post('/api/content/:id/comments', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, body: { type: 'object', additionalProperties: false, required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 2000 } } } }
  }, async (request, reply) => {
    const content = await pool.query("SELECT id,author_id FROM content WHERE id=$1 AND status='published'", [request.params.id]);
    if (!content.rowCount) return reply.code(404).send({ error: 'CONTENT_NOT_FOUND' });
    const id = newId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO comments(id,content_id,author_id,body) VALUES($1,$2,$3,$4)',[id,request.params.id,request.auth.id,request.body.body.trim()]);
      await client.query('UPDATE content_stats SET comment_count=comment_count+1,updated_at=CURRENT_TIMESTAMP WHERE content_id=$1',[request.params.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    await ctx.notifications.create({ userId: content.rows[0].author_id, actorId: request.auth.id, type: 'comment', contentId: request.params.id, payload: { commentId: id } });
    return reply.code(201).send({ id });
  });

  app.post('/api/content/:id/like', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } }
  }, async (request, reply) => {
    const content = await pool.query("SELECT id,author_id FROM content WHERE id=$1 AND status='published'", [request.params.id]);
    if (!content.rowCount) return reply.code(404).send({ error: 'CONTENT_NOT_FOUND' });
    const client = await pool.connect();
    let liked = false;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO reactions(content_id,user_id,reaction_type) VALUES($1,$2,'like') ON CONFLICT DO NOTHING RETURNING content_id`,
        [request.params.id,request.auth.id]
      );
      liked = Boolean(inserted.rowCount);
      if (liked) {
        await client.query('UPDATE content_stats SET like_count=like_count+1,updated_at=CURRENT_TIMESTAMP WHERE content_id=$1',[request.params.id]);
      } else {
        const removed = await client.query("DELETE FROM reactions WHERE content_id=$1 AND user_id=$2 AND reaction_type='like' RETURNING content_id",[request.params.id,request.auth.id]);
        if (removed.rowCount) await client.query('UPDATE content_stats SET like_count=GREATEST(like_count-1,0),updated_at=CURRENT_TIMESTAMP WHERE content_id=$1',[request.params.id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (liked) await ctx.notifications.create({ userId: content.rows[0].author_id, actorId: request.auth.id, type: 'like', contentId: request.params.id });
    return { liked };
  });

  app.post('/api/content/:id/view', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, body: { type: 'object', additionalProperties: false, properties: { watchedSeconds: { type: 'number', minimum: 0, maximum: 86400, default: 0 } } } }
  }, async (request, reply) => {
    const exists = await pool.query("SELECT 1 FROM content WHERE id=$1 AND status='published'", [request.params.id]);
    if (!exists.rowCount) return reply.code(404).send({ error: 'CONTENT_NOT_FOUND' });
    const watchedSeconds = request.body.watchedSeconds || 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT watched_seconds FROM content_views WHERE content_id=$1 AND viewer_id=$2 AND view_date=CURRENT_DATE FOR UPDATE',[request.params.id,request.auth.id]);
      const previous = Number(existing.rows[0]?.watched_seconds || 0);
      if (existing.rowCount) {
        await client.query('UPDATE content_views SET watched_seconds=GREATEST(watched_seconds,$3),updated_at=CURRENT_TIMESTAMP WHERE content_id=$1 AND viewer_id=$2 AND view_date=CURRENT_DATE',[request.params.id,request.auth.id,watchedSeconds]);
      } else {
        await client.query('INSERT INTO content_views(content_id,viewer_id,view_date,watched_seconds) VALUES($1,$2,CURRENT_DATE,$3)',[request.params.id,request.auth.id,watchedSeconds]);
      }
      const delta = Math.max(watchedSeconds-previous,0);
      await client.query('UPDATE content_stats SET view_count=view_count+$2,watched_seconds=watched_seconds+$3,updated_at=CURRENT_TIMESTAMP WHERE content_id=$1',[request.params.id,existing.rowCount?0:1,delta]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return { ok: true };
  });
}
