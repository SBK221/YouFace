import test from 'node:test';
import assert from 'node:assert/strict';
import { productionProblems } from '../scripts/production-preflight.mjs';

const valid = () => ({
  NODE_ENV: 'production', COOKIE_SECURE: 'true', STORAGE_DRIVER: 's3',
  DATABASE_URL: 'postgres://account:random-password@postgres/database', REDIS_URL: 'redis://redis:6379',
  APP_ORIGINS: 'https://community.example', S3_CORS_ORIGINS: 'https://community.example',
  FIREBASE_PROJECT_ID: 'example-project', FIREBASE_PUBLIC_API_KEY: 'public-key',
  FIREBASE_PUBLIC_AUTH_DOMAIN: 'example-project.firebaseapp.com', FIREBASE_PUBLIC_APP_ID: 'public-app',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({project_id:'example-project',client_email:'service@example.test',private_key:'fixture'}),
  S3_ENDPOINT: 'https://storage.example', S3_REGION: 'region', S3_BUCKET: 'private-media', S3_ACCESS_KEY: 'fixture', S3_SECRET_KEY: 'fixture'
});
test('production validation rejects development defaults and mismatched identity without exposing secrets', () => {
  assert.deepEqual(productionProblems(valid()), []);
  const env = {...valid(), COOKIE_SECURE:'false', S3_ENDPOINT:'http://localhost:9000', FIREBASE_PROJECT_ID:'different'};
  const problems = productionProblems(env);
  assert.ok(problems.some(p=>p.startsWith('COOKIE_SECURE:')));
  assert.ok(problems.some(p=>p.startsWith('S3_ENDPOINT:')));
  assert.ok(problems.some(p=>p.startsWith('FIREBASE_SERVICE_ACCOUNT:')));
  assert.equal(problems.join().includes('private_key'),false);
});
test('live payments require a live key, price, signed webhook and valid return URLs', () => {
  const env = {...valid(),STRIPE_SECRET_KEY:'sk_test_fixture'};
  assert.ok(productionProblems(env,true).some(p=>p.startsWith('STRIPE_SECRET_KEY:')));
  Object.assign(env,{STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_CREATOR_PRICE_ID:'price_fixture',STRIPE_APPLICATION_FEE_PERCENT:'10',BILLING_SUCCESS_URL:'https://community.example/#creator',BILLING_CANCEL_URL:'https://community.example/#creator',CONNECT_RETURN_URL:'https://community.example/#creator',CONNECT_REFRESH_URL:'https://community.example/#creator'});
  assert.deepEqual(productionProblems(env,true),[]);
  env.STRIPE_APPLICATION_FEE_PERCENT='101';
  assert.ok(productionProblems(env,true).some(p=>p.startsWith('STRIPE_APPLICATION_FEE_PERCENT:')));
});
