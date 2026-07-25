import { decodeCursor, encodeCursor, newId } from '../lib/security.js';

export async function messagingRoutes(app, ctx) {
  const { pool, auth } = ctx;

  app.get('/api/conversations', { preHandler: auth.requireAuth }, async request => {
    const result = await pool.query(
      `SELECT c.id,c.kind,c.title,c.updated_at,
              m.body AS last_message,m.created_at AS last_message_at,
              COALESCE((SELECT json_agg(json_build_object('id',u.id,'username',p.username,'displayName',p.display_name))
                        FROM conversation_members cm2 JOIN users u ON u.id=cm2.user_id JOIN profiles p ON p.user_id=u.id
                        WHERE cm2.conversation_id=c.id AND cm2.user_id<>$1),'[]'::json) AS participants
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1
       LEFT JOIN LATERAL (
         SELECT body,created_at FROM messages WHERE conversation_id=c.id AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1
       ) m ON TRUE
       ORDER BY COALESCE(m.created_at,c.updated_at) DESC LIMIT 100`, [request.auth.id]
    );
    return { items: result.rows.map(r => ({ id:r.id,kind:r.kind,title:r.title,updatedAt:r.updated_at,lastMessage:r.last_message,lastMessageAt:r.last_message_at,participants:r.participants })) };
  });

  app.post('/api/conversations/direct', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { body: { type: 'object', additionalProperties: false, required: ['username'], properties: { username: { type: 'string', minLength: 3, maxLength: 32 } } } }
  }, async (request, reply) => {
    const target = await pool.query("SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE p.username=$1 AND u.status='active'", [request.body.username.toLowerCase()]);
    if (!target.rowCount) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const targetId = target.rows[0].id;
    if (targetId === request.auth.id) return reply.code(400).send({ error: 'CANNOT_MESSAGE_SELF' });
    const directKey = [request.auth.id,targetId].sort().join(':');
    let conversation = await pool.query("SELECT id FROM conversations WHERE direct_key=$1", [directKey]);
    if (!conversation.rowCount) {
      const id = newId();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO conversations(id,kind,direct_key) VALUES($1,'direct',$2)
           ON CONFLICT(direct_key) DO UPDATE SET direct_key=EXCLUDED.direct_key RETURNING id`, [id,directKey]
        );
        const conversationId = inserted.rows[0].id;
        await client.query('INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING', [conversationId,request.auth.id,targetId]);
        await client.query('COMMIT');
        conversation = { rows: [{ id: conversationId }], rowCount: 1 };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    return reply.code(201).send({ id: conversation.rows[0].id });
  });

  app.get('/api/conversations/:id/messages', {
    preHandler: auth.requireAuth,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      querystring: { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } } }
    }
  }, async (request, reply) => {
    const member = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [request.params.id,request.auth.id]);
    if (!member.rowCount) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
    const cursor = decodeCursor(request.query.cursor);
    const params = [request.params.id];
    let cursorWhere = '';
    if (cursor) {
      params.push(cursor.createdAt,cursor.id);
      cursorWhere = ' AND (m.created_at,m.id) < ($2::timestamptz,$3::uuid)';
    }
    params.push(request.query.limit + 1);
    const result = await pool.query(
      `SELECT m.id,m.body,m.created_at,m.sender_id,p.username,p.display_name
       FROM messages m JOIN profiles p ON p.user_id=m.sender_id
       WHERE m.conversation_id=$1 AND m.deleted_at IS NULL ${cursorWhere}
       ORDER BY m.created_at DESC,m.id DESC LIMIT $${params.length}`, params
    );
    const hasMore = result.rows.length > request.query.limit;
    const rows = hasMore ? result.rows.slice(0,request.query.limit) : result.rows;
    const last = rows.at(-1);
    await pool.query('UPDATE conversation_members SET last_read_at=CURRENT_TIMESTAMP WHERE conversation_id=$1 AND user_id=$2', [request.params.id,request.auth.id]);
    return {
      items: rows.reverse().map(r => ({ id:r.id,body:r.body,createdAt:r.created_at,sender:{id:r.sender_id,username:r.username,displayName:r.display_name} })),
      nextCursor: hasMore && last ? encodeCursor(last.created_at,last.id) : null
    };
  });

  app.post('/api/conversations/:id/messages', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', additionalProperties: false, required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 4000 } } }
    }
  }, async (request, reply) => {
    const members = await pool.query('SELECT user_id FROM conversation_members WHERE conversation_id=$1', [request.params.id]);
    if (!members.rows.some(r => r.user_id === request.auth.id)) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
    const id = newId();
    const result = await pool.query(
      `INSERT INTO messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4)
       RETURNING id,conversation_id,sender_id,body,created_at`,
      [id,request.params.id,request.auth.id,request.body.body.trim()]
    );
    await pool.query('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=$1', [request.params.id]);
    for (const member of members.rows) {
      await ctx.notifications.create({ userId: member.user_id, actorId: request.auth.id, type: 'message', messageId: id, payload: { conversationId: request.params.id } });
      await ctx.eventBus.publish({ userId:member.user_id,type:'message',message:result.rows[0],conversationId:request.params.id });
    }
    return reply.code(201).send({ id });
  });
}
