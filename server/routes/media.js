import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileTypeFromFile } from 'file-type';
import { newId } from '../lib/security.js';
import { probeVideo } from '../lib/media.js';

const filenameExt = name => String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] || 'bin';

export async function mediaRoutes(app, ctx) {
  const { pool, auth, config, storage } = ctx;

  // Production path: the client uploads directly to S3-compatible object storage.
  app.post('/api/media/uploads', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    schema: { body: { type:'object',additionalProperties:false,required:['filename','mimeType','sizeBytes'],properties:{
      filename:{type:'string',minLength:1,maxLength:255},mimeType:{type:'string',minLength:5,maxLength:120},sizeBytes:{type:'integer',minimum:1}
    } } }
  }, async (request, reply) => {
    if (!request.body.mimeType.startsWith('video/')) return reply.code(415).send({ error:'VIDEO_REQUIRED' });
    if (request.body.sizeBytes > config.uploadMaxBytes) return reply.code(413).send({ error:'FILE_TOO_LARGE' });
    if (storage.driver !== 's3') return { direct:false };
    const id = newId();
    const ext = filenameExt(request.body.filename);
    const originalKey = `original/${request.auth.id}/${id}.${ext}`;
    const signed = await storage.createUploadUrl(originalKey,request.body.mimeType);
    await pool.query(
      `INSERT INTO media_assets(id,owner_id,original_key,mime_type,size_bytes,status) VALUES($1,$2,$3,$4,$5,'uploading')`,
      [id,request.auth.id,originalKey,request.body.mimeType,request.body.sizeBytes]
    );
    return reply.code(201).send({ direct:true,id,uploadUrl:signed.uploadUrl,headers:signed.headers,expiresInSeconds:900 });
  });

  app.post('/api/media/:id/complete', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}} }
  }, async (request, reply) => {
    const result = await pool.query("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND status='uploading'",[request.params.id,request.auth.id]);
    if (!result.rowCount) return reply.code(404).send({ error:'UPLOAD_NOT_FOUND' });
    const asset = result.rows[0];
    let object;
    try { object = await storage.stat(asset.original_key); }
    catch { return reply.code(409).send({ error:'UPLOAD_NOT_FOUND_IN_STORAGE' }); }
    if (!object.sizeBytes || object.sizeBytes > config.uploadMaxBytes || object.sizeBytes !== Number(asset.size_bytes)) {
      await storage.delete(asset.original_key).catch(() => {});
      await pool.query("UPDATE media_assets SET status='failed',error_message='INVALID_OBJECT_SIZE',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[asset.id]);
      return reply.code(413).send({ error:'INVALID_OBJECT_SIZE' });
    }
    const jobId = newId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE media_assets SET size_bytes=$2,status='processing',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[asset.id,object.sizeBytes]);
      await client.query("INSERT INTO media_jobs(id,media_asset_id,job_type,status) VALUES($1,$2,'transcode','queued')",[jobId,asset.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return reply.code(202).send({ id:asset.id,status:'processing' });
  });

  // Development/local fallback. S3 deployments are forced through direct upload.
  app.post('/api/media/upload', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    config: { rateLimit: { max:20,timeWindow:'1 hour' } }
  }, async (request, reply) => {
    if (storage.driver === 's3') return reply.code(410).send({ error:'USE_DIRECT_UPLOAD' });
    const part = await request.file({ limits:{fileSize:config.uploadMaxBytes,files:1,fields:5} });
    if (!part) return reply.code(400).send({ error:'FILE_REQUIRED' });
    const assetId = newId();
    const tempPath = path.join(config.tmpDir,`${assetId}.upload`);
    await fsp.mkdir(config.tmpDir,{recursive:true});
    try {
      await pipeline(part.file,fs.createWriteStream(tempPath,{flags:'wx'}));
      if (part.file.truncated) return reply.code(413).send({ error:'FILE_TOO_LARGE' });
      const stat = await fsp.stat(tempPath);
      const detected = await fileTypeFromFile(tempPath);
      if (!detected?.mime?.startsWith('video/')) return reply.code(415).send({ error:'VIDEO_REQUIRED' });
      let metadata;
      try { metadata = await probeVideo(config,tempPath); }
      catch { return reply.code(415).send({ error:'INVALID_VIDEO' }); }
      const originalKey = `original/${request.auth.id}/${assetId}.${detected.ext}`;
      await storage.putFile(originalKey,tempPath,detected.mime);
      const jobId = newId();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO media_assets(id,owner_id,original_key,mime_type,size_bytes,duration_seconds,width,height,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,'processing')`,
          [assetId,request.auth.id,originalKey,detected.mime,stat.size,metadata.durationSeconds,metadata.width,metadata.height]
        );
        await client.query("INSERT INTO media_jobs(id,media_asset_id,job_type,status) VALUES($1,$2,'transcode','queued')",[jobId,assetId]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        await storage.delete(originalKey).catch(() => {});
        throw error;
      } finally { client.release(); }
      return reply.code(202).send({ id:assetId,status:'processing',metadata,direct:false });
    } finally { await fsp.rm(tempPath,{force:true}).catch(()=>{}); }
  });

  app.get('/api/media', { preHandler:auth.requireAuth }, async request => {
    const result = await pool.query(
      `SELECT id,mime_type,size_bytes,duration_seconds,width,height,status,error_message,processed_key,thumbnail_key,created_at
       FROM media_assets WHERE owner_id=$1 AND status<>'deleted' ORDER BY created_at DESC LIMIT 100`,[request.auth.id]
    );
    const items = await Promise.all(result.rows.map(async r => ({
      id:r.id,mimeType:r.mime_type,sizeBytes:Number(r.size_bytes),durationSeconds:Number(r.duration_seconds||0),width:r.width,height:r.height,status:r.status,error:r.error_message,createdAt:r.created_at,
      url:r.processed_key?await storage.getUrl(r.processed_key):null,thumbnailUrl:r.thumbnail_key?await storage.getUrl(r.thumbnail_key):null
    })));
    return { items };
  });

  app.get('/api/media/:id', {
    preHandler:auth.requireAuth,
    schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}}
  }, async (request, reply) => {
    const result = await pool.query(
      `SELECT id,owner_id,mime_type,size_bytes,duration_seconds,width,height,status,error_message,processed_key,thumbnail_key,created_at
       FROM media_assets WHERE id=$1`,[request.params.id]
    );
    if (!result.rowCount || result.rows[0].owner_id!==request.auth.id) return reply.code(404).send({ error:'MEDIA_NOT_FOUND' });
    const r=result.rows[0];
    return { id:r.id,status:r.status,error:r.error_message,mimeType:r.mime_type,sizeBytes:Number(r.size_bytes),durationSeconds:Number(r.duration_seconds||0),width:r.width,height:r.height,createdAt:r.created_at,url:r.processed_key?await storage.getUrl(r.processed_key):null,thumbnailUrl:r.thumbnail_key?await storage.getUrl(r.thumbnail_key):null };
  });

  if (storage.driver === 'local') {
    app.get('/media-files/*', { preHandler:auth.optionalAuth }, async (request, reply) => {
      const key = request.params['*'];
      if (!key || key.includes('..')) return reply.code(400).send({ error:'INVALID_KEY' });
      const asset = await pool.query(
        `SELECT m.owner_id,c.status AS content_status,c.visibility
         FROM media_assets m LEFT JOIN content c ON c.media_asset_id=m.id
         WHERE m.processed_key=$1 OR m.thumbnail_key=$1 LIMIT 1`,[key]
      );
      if (!asset.rowCount) return reply.code(404).send({ error:'MEDIA_NOT_FOUND' });
      const row=asset.rows[0];
      const owner=request.auth?.id===row.owner_id;
      const publicContent=row.content_status==='published'&&row.visibility==='public';
      if (!owner&&!publicContent) return reply.code(403).send({ error:'MEDIA_FORBIDDEN' });
      const filePath=path.join(storage.root,key);
      try { await fsp.access(filePath);return reply.send(fs.createReadStream(filePath)); }
      catch { return reply.code(404).send({ error:'MEDIA_NOT_FOUND' }); }
    });
  }
}
