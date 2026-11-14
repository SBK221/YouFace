import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { billingRoutes } from '../server/routes/billing.js';

async function fixture(t, {customer='cus_owner',account='acct_creator',payouts=true}={}) {
  const app=Fastify();
  const calls=[];
  const stripe={
    billingPortal:{sessions:{async create(data){calls.push(data);return{url:'https://billing.stripe.com/session/example'};}}},
    accounts:{async retrieve(id){assert.equal(id,account);return{payouts_enabled:payouts,capabilities:{transfers:payouts?'active':'pending'}};}}
  };
  const auth={requireAuth:async request=>{request.auth={id:'viewer',stripe_customer_id:customer,stripe_account_id:account};},requireCsrf:async()=>{}};
  await billingRoutes(app,{pool:{},auth,stripe,config:{stripeWebhookSecret:'whsec_fixture',stripeCreatorPriceId:'price_fixture',billingCancelUrl:'https://community.example/#settings'}});
  t.after(()=>app.close());
  return{app,calls};
}
test('portal uses the authenticated customer and server return URL',async t=>{
  const {app,calls}=await fixture(t);
  const response=await app.inject({method:'POST',url:'/api/billing/portal',payload:{customer:'cus_other',return_url:'https://other.example'}});
  assert.equal(response.statusCode,200);
  assert.deepEqual(calls,[{customer:'cus_owner',return_url:'https://community.example/#settings'}]);
  assert.equal(response.json().url,'https://billing.stripe.com/session/example');
});
test('portal rejects missing customers and native store purchases',async t=>{
  const {app,calls}=await fixture(t,{customer:null});
  assert.equal((await app.inject({method:'POST',url:'/api/billing/portal'})).statusCode,409);
  const native=await app.inject({method:'POST',url:'/api/billing/portal',headers:{'x-youface-client':'native'}});
  assert.equal(native.json().error,'NATIVE_STORE_BILLING_REQUIRED');
  assert.equal(calls.length,0);
});
test('a Connect account identifier alone does not mean payouts are enabled',async t=>{
  const {app}=await fixture(t,{payouts:false});
  const response=await app.inject({method:'GET',url:'/api/billing/readiness'});
  assert.equal(response.json().payoutReady,false);
  assert.deepEqual(response.json().blockingReasons,[]);
});
