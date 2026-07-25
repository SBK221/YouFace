import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from '../server/config.js';
import { createPool } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { createStorage } from '../server/lib/storage.js';
import { createEventBus } from '../server/lib/event-bus.js';
import { buildApp } from '../server/app.js';
import { processJob } from '../worker/processor.js';
import { exchange } from './helpers.mjs';
const databaseUrl=process.env.TEST_DATABASE_URL, s3Endpoint=process.env.TEST_S3_ENDPOINT, enabled=Boolean(databaseUrl&&s3Endpoint);
function run(bin,args){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{stdio:'ignore'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`${bin} exited ${code}`)));});}

test('S3-compatible direct upload and FFmpeg worker', {skip:!enabled}, async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'youface-s3-')); const nonce=Date.now().toString(36);
  const config=loadConfig({env:'test',databaseUrl,redisUrl:'',storageDriver:'s3',tmpDir:path.join(root,'tmp'),publicDir:path.resolve('public'),origins:['http://localhost:4173'],s3:{endpoint:s3Endpoint,region:process.env.TEST_S3_REGION||'us-east-1',bucket:process.env.TEST_S3_BUCKET||'youface-media',accessKeyId:process.env.TEST_S3_ACCESS_KEY||'youface',secretAccessKey:process.env.TEST_S3_SECRET_KEY||'youface_minio_password',forcePathStyle:true,autoCreateBucket:true}});
  await fs.mkdir(config.tmpDir,{recursive:true}); const pool=createPool(config); await runMigrations(pool); const storage=await createStorage(config); const eventBus=await createEventBus('');
  const verifier={configured:true,async verify(){return{provider:'google',subject:`s3-${nonce}`,email:`s3-${nonce}@youface.test`,phoneE164:null,displayName:'S3 Creator'};}};
  const app=await buildApp({config,pool,storage,eventBus,identityVerifier:verifier,logger:false}); await app.ready();
  t.after(async()=>{await app.close();await eventBus.close();await pool.end();await fs.rm(root,{recursive:true,force:true});});
  const auth=await exchange(app,'s3'); assert.equal(auth.response.statusCode,200,auth.response.body);
  const sample=path.join(root,'direct.mp4'); await run('ffmpeg',['-y','-f','lavfi','-i','color=c=purple:s=360x640:d=2','-f','lavfi','-i','sine=frequency=880:duration=2','-c:v','libx264','-c:a','aac','-shortest',sample]); const video=await fs.readFile(sample);
  const init=await app.inject({method:'POST',url:'/api/media/uploads',headers:{cookie:auth.cookie,'content-type':'application/json','x-csrf-token':auth.body.csrfToken},payload:JSON.stringify({filename:'direct.mp4',mimeType:'video/mp4',sizeBytes:video.byteLength})}); assert.equal(init.statusCode,201,init.body); const upload=init.json(); assert.equal(upload.direct,true);
  const put=await fetch(upload.uploadUrl,{method:'PUT',headers:upload.headers,body:video}); assert.equal(put.ok,true,await put.text());
  const complete=await app.inject({method:'POST',url:`/api/media/${upload.id}/complete`,headers:{cookie:auth.cookie,'content-type':'application/json','x-csrf-token':auth.body.csrfToken},payload:'{}'}); assert.equal(complete.statusCode,202,complete.body);
  const jobs=await pool.query("SELECT id,media_asset_id FROM media_jobs WHERE media_asset_id=$1 AND status='queued'",[upload.id]); await pool.query("UPDATE media_jobs SET status='processing',attempts=1,started_at=CURRENT_TIMESTAMP WHERE id=$1",[jobs.rows[0].id]);
  const processed=await processJob({pool,storage,config,job:jobs.rows[0]}); assert.equal(processed.status,'ready');
  const media=await app.inject({method:'GET',url:`/api/media/${upload.id}`,headers:{cookie:auth.cookie}}); assert.equal(media.json().status,'ready'); assert.ok(media.json().url); assert.ok(media.json().thumbnailUrl);
});
