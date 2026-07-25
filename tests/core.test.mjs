import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { newDb } from 'pg-mem';
import FormData from 'form-data';
import { loadConfig } from '../server/config.js';
import { createStorage } from '../server/lib/storage.js';
import { createEventBus } from '../server/lib/event-bus.js';
import { buildApp } from '../server/app.js';
import { processJob } from '../worker/processor.js';
import { applyAllMigrations, exchange } from './helpers.mjs';

function run(bin,args){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{stdio:'ignore'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`${bin} exited ${code}`)));});}
async function makeClient(app, token, native=false) {
  const auth = await exchange(app, token, native);
  assert.equal(auth.response.statusCode,200,auth.response.body);
  let cookie=auth.cookie, csrf=auth.body.csrfToken, sessionToken=auth.body.sessionToken || '';
  return {
    body:auth.body, cookie, csrf, sessionToken,
    async request(method,url,body,extraHeaders={}) {
      const headers={...extraHeaders};
      if(cookie) headers.cookie=cookie;
      if(native){headers['x-youface-client']='native';headers['x-youface-platform']='android';if(sessionToken)headers.authorization=`Bearer ${sessionToken}`;}
      if(!['GET','HEAD'].includes(method)&&csrf) headers['x-csrf-token']=csrf;
      const payload=body===undefined?undefined:JSON.stringify(body); if(payload!==undefined) headers['content-type']='application/json';
      const res=await app.inject({method,url,headers,payload}); const data=res.json(); if(data?.csrfToken)csrf=data.csrfToken; return {res,data};
    }
  };
}

test('YouFace phone/Google/Gmail identity, core flows and media worker', async t => {
  const db=newDb({autoCreateForeignKeyIndices:true}); const {Pool}=db.adapters.createPg(); const pool=new Pool(); await applyAllMigrations(pool);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'youface-test-'));
  const identities={
    'firebase-id-token-admin-google-0001':{provider:'google',subject:'firebase-admin',email:'admin@youface.test',phoneE164:null,displayName:'Admin YouFace'},
    'firebase-id-token-user-phone-0002':{provider:'phone',subject:'firebase-phone-user',email:null,phoneE164:'+221771234567',displayName:null},
    'firebase-id-token-native-google-0003':{provider:'google',subject:'firebase-native',email:'native@youface.test',phoneE164:null,displayName:'Native YouFace'},
    'firebase-id-token-gmail-password-0004':{provider:'gmail',subject:'firebase-gmail-user',email:'member.youface@gmail.com',phoneE164:null,displayName:'Gmail YouFace'}
  };
  const config=loadConfig({env:'test',redisUrl:'',storageDriver:'local',localStorageDir:path.join(root,'storage'),tmpDir:path.join(root,'tmp'),publicDir:path.resolve('public'),bootstrapAdminFirebaseUid:'firebase-admin',origins:['http://localhost:4173']});
  await fs.mkdir(config.tmpDir,{recursive:true}); const storage=await createStorage(config); const eventBus=await createEventBus('');
  const app=await buildApp({config,pool,storage,eventBus,identityVerifier:{configured:true,async verify(token){const item=identities[token];if(!item){const e=new Error('IDENTITY_TOKEN_INVALID');e.statusCode=401;throw e;}return item;}},logger:false}); await app.ready();
  t.after(async()=>{await app.close();await eventBus.close();await pool.end();await fs.rm(root,{recursive:true,force:true});});

  const removed=await app.inject({method:'POST',url:'/api/auth/register',headers:{'content-type':'application/json'},payload:'{}'}); assert.equal(removed.statusCode,410); assert.deepEqual(removed.json().allowedMethods,['phone','google','gmail_password']);
  const admin=await makeClient(app,'firebase-id-token-admin-google-0001'); assert.equal(admin.body.user.role,'admin'); assert.equal(admin.body.user.authProvider,'google');
  const user=await makeClient(app,'firebase-id-token-user-phone-0002'); assert.equal(user.body.user.phoneNumber,'+221771234567'); assert.equal(user.body.user.authProvider,'phone');
  const gmail=await makeClient(app,'firebase-id-token-gmail-password-0004'); assert.equal(gmail.body.user.authProvider,'gmail'); assert.equal(gmail.body.user.email,'member.youface@gmail.com');
  const native=await makeClient(app,'firebase-id-token-native-google-0003',true); assert.ok(native.sessionToken);
  const nativeSession=await native.request('GET','/api/auth/session'); assert.equal(nativeSession.data.user.authProvider,'google');

  let r=await admin.request('POST','/api/content/posts',{body:'Première publication réelle YouFace',visibility:'public'}); assert.equal(r.res.statusCode,201); const contentId=r.data.id;
  r=await user.request('GET','/api/feed?limit=20'); assert.equal(r.data.items.length,1);
  r=await user.request('POST',`/api/content/${contentId}/like`,{}); assert.equal(r.data.liked,true);
  r=await user.request('POST',`/api/content/${contentId}/comments`,{body:'Commentaire réel'}); assert.equal(r.res.statusCode,201);
  r=await user.request('POST',`/api/content/${contentId}/view`,{watchedSeconds:12}); assert.equal(r.res.statusCode,200);
  r=await user.request('POST',`/api/profiles/${admin.body.user.id}/follow`,{}); assert.equal(r.data.following,true);
  r=await user.request('POST','/api/conversations/direct',{username:admin.body.user.username}); assert.equal(r.res.statusCode,201); const conversationId=r.data.id;
  r=await user.request('POST',`/api/conversations/${conversationId}/messages`,{body:'Message réel vers Admin'}); assert.equal(r.res.statusCode,201);
  r=await admin.request('GET','/api/notifications?limit=100'); assert.ok(r.data.items.length>=4);
  r=await admin.request('GET','/api/creator/analytics'); assert.equal(r.data.summary.views,1); assert.equal(r.data.summary.followers,1); assert.equal(r.data.summary.likes,1);

  r=await user.request('POST','/api/reports',{targetType:'content',targetId:contentId,reason:'test_report',details:'Test modération'}); assert.equal(r.res.statusCode,201); const reportId=r.data.id;
  r=await admin.request('GET','/api/moderation/reports?status=open&limit=20'); assert.equal(r.data.items.length,1);
  r=await admin.request('POST',`/api/moderation/reports/${reportId}/action`,{action:'hide_content',reason:'Contrôle test'}); assert.equal(r.res.statusCode,200);

  const sample=path.join(root,'sample.mp4'); await run('ffmpeg',['-y','-f','lavfi','-i','color=c=purple:s=360x640:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-shortest',sample]);
  const form=new FormData(); form.append('video',await fs.readFile(sample),{filename:'sample.mp4',contentType:'video/mp4'});
  const upload=await app.inject({method:'POST',url:'/api/media/upload',headers:{...form.getHeaders(),cookie:admin.cookie,'x-csrf-token':admin.csrf},payload:form.getBuffer()}); assert.equal(upload.statusCode,202,upload.body);
  const assetId=upload.json().id; const queued=await pool.query("SELECT id,media_asset_id FROM media_jobs WHERE media_asset_id=$1 AND status='queued'",[assetId]); assert.equal(queued.rowCount,1);
  await pool.query("UPDATE media_jobs SET status='processing',attempts=1,started_at=CURRENT_TIMESTAMP WHERE id=$1",[queued.rows[0].id]);
  const processed=await processJob({pool,storage,config,job:{id:queued.rows[0].id,media_asset_id:assetId}}); assert.equal(processed.status,'ready');
  r=await admin.request('POST','/api/content/videos',{mediaAssetId:assetId,title:'Short réel transcodé',body:'Pipeline FFmpeg',type:'short',visibility:'public'}); assert.equal(r.res.statusCode,201);
});
