import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { newDb } from 'pg-mem';
import Stripe from 'stripe';
import { loadConfig } from '../server/config.js';
import { createStorage } from '../server/lib/storage.js';
import { createEventBus } from '../server/lib/event-bus.js';
import { buildApp } from '../server/app.js';
import { applyAllMigrations, exchange, mutate } from './helpers.mjs';

function rcSignature(payload, secret, timestamp=Math.floor(Date.now()/1000)) {
  return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.${payload}`).digest('hex')}`;
}

test('Stripe webhooks + RevenueCat credits + creator tips are signed and idempotent', async t => {
  const db=newDb({autoCreateForeignKeyIndices:true}); const {Pool}=db.adapters.createPg(); const pool=new Pool(); await applyAllMigrations(pool);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'youface-billing-'));
  const webhookSecret='whsec_youface_test_webhook_key'; const rcAuth='Bearer youface-revenuecat-test'; const rcSecret='rc_hmac_youface_test_secret_123456789';
  const identities={'firebase-id-token-subscriber-0001':{provider:'phone',subject:'sub-phone',email:null,phoneE164:'+221770000001',displayName:'Subscriber'},'firebase-id-token-creator-0002':{provider:'google',subject:'creator-google',email:'creator@youface.test',phoneE164:null,displayName:'Creator Pay'}};
  const verifier={configured:true,async verify(token){const i=identities[token];if(!i){const e=new Error('IDENTITY_TOKEN_INVALID');e.statusCode=401;throw e;}return i;}};
  const config=loadConfig({env:'test',redisUrl:'',storageDriver:'local',localStorageDir:path.join(root,'storage'),tmpDir:path.join(root,'tmp'),publicDir:path.resolve('public'),origins:['http://localhost:4173'],stripeSecretKey:'sk_test_youface_offline_signature_test',stripeWebhookSecret:webhookSecret,revenueCatWebhookAuthorization:rcAuth,revenueCatWebhookHmacSecret:rcSecret,revenueCatCreditProducts:{youface_credits_100:100},tipPlatformFeePercent:10});
  await fs.mkdir(config.tmpDir,{recursive:true}); const storage=await createStorage(config); const eventBus=await createEventBus(''); const app=await buildApp({config,pool,storage,eventBus,identityVerifier:verifier,logger:false}); await app.ready();
  t.after(async()=>{await app.close();await eventBus.close();await pool.end();await fs.rm(root,{recursive:true,force:true});});
  const subscriber=await exchange(app,'firebase-id-token-subscriber-0001'); const creator=await exchange(app,'firebase-id-token-creator-0002'); assert.equal(subscriber.response.statusCode,200); assert.equal(creator.response.statusCode,200);

  const stripeEvent={id:'evt_youface_subscription_001',object:'event',type:'customer.subscription.created',data:{object:{id:'sub_youface_001',status:'active',metadata:{youface_subscriber_id:subscriber.body.user.id,youface_creator_id:creator.body.user.id},items:{data:[{current_period_end:Math.floor(Date.now()/1000)+86400}]}}}};
  const stripePayload=JSON.stringify(stripeEvent); const stripeSignature=Stripe.webhooks.generateTestHeaderString({payload:stripePayload,secret:webhookSecret});
  let response=await app.inject({method:'POST',url:'/api/billing/webhook',headers:{'content-type':'application/json','stripe-signature':stripeSignature},payload:stripePayload}); assert.equal(response.statusCode,200,response.body);
  response=await app.inject({method:'POST',url:'/api/billing/webhook',headers:{'content-type':'application/json','stripe-signature':stripeSignature},payload:stripePayload}); assert.equal(response.json().duplicate,true);

  const rcEvent={api_version:'1.0',event:{id:'rc_evt_001',type:'NON_RENEWING_PURCHASE',app_user_id:subscriber.body.user.id,product_id:'youface_credits_100',environment:'SANDBOX',entitlement_ids:[]}};
  const rcPayload=JSON.stringify(rcEvent); const signature=rcSignature(rcPayload,rcSecret);
  response=await app.inject({method:'POST',url:'/api/billing/revenuecat/webhook',headers:{'content-type':'application/json','authorization':rcAuth,'x-revenuecat-webhook-signature':signature},payload:rcPayload}); assert.equal(response.statusCode,200,response.body);
  response=await app.inject({method:'POST',url:'/api/billing/revenuecat/webhook',headers:{'content-type':'application/json','authorization':rcAuth,'x-revenuecat-webhook-signature':signature},payload:rcPayload}); assert.equal(response.json().duplicate,true);
  let wallet=await app.inject({method:'GET',url:'/api/billing/wallet',headers:{cookie:subscriber.cookie}}); assert.equal(wallet.json().credits,100);

  response=await mutate(app,subscriber,`/api/billing/creators/${creator.body.user.id}/tip`,{credits:40}); assert.equal(response.statusCode,201,response.body); assert.equal(response.json().creatorCredits,36);
  wallet=await app.inject({method:'GET',url:'/api/billing/wallet',headers:{cookie:subscriber.cookie}}); assert.equal(wallet.json().credits,60);
  response=await mutate(app,subscriber,`/api/billing/creators/${creator.body.user.id}/tip`,{credits:1000}); assert.equal(response.statusCode,409,response.body); assert.equal(response.json().error,'INSUFFICIENT_CREDITS');

  const nativeSub=await exchange(app,'firebase-id-token-subscriber-0001',true);
  response=await app.inject({method:'POST',url:`/api/billing/creators/${creator.body.user.id}/subscribe`,headers:{authorization:`Bearer ${nativeSub.body.sessionToken}`,'x-youface-client':'native','x-youface-platform':'android','x-csrf-token':nativeSub.body.csrfToken,'content-type':'application/json'},payload:'{}'}); assert.equal(response.statusCode,409,response.body); assert.equal(response.json().error,'NATIVE_STORE_BILLING_REQUIRED');
  const bad=await app.inject({method:'POST',url:'/api/billing/revenuecat/webhook',headers:{'content-type':'application/json','authorization':rcAuth,'x-revenuecat-webhook-signature':'t=1,v1=bad'},payload:rcPayload}); assert.equal(bad.statusCode,400);
});
