import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function productionProblems(env, payments = false) {
  const problems = [];
  const required = ['DATABASE_URL', 'REDIS_URL', 'APP_ORIGINS', 'FIREBASE_PROJECT_ID',
    'FIREBASE_PUBLIC_API_KEY', 'FIREBASE_PUBLIC_AUTH_DOMAIN', 'FIREBASE_PUBLIC_APP_ID',
    'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_CORS_ORIGINS'];
  for (const name of required) if (!env[name]?.trim()) problems.push(`${name}: requis`);
  if (env.NODE_ENV !== 'production') problems.push('NODE_ENV: production requis');
  if (env.COOKIE_SECURE !== 'true') problems.push('COOKIE_SECURE: true requis');
  if (env.STORAGE_DRIVER !== 's3') problems.push('STORAGE_DRIVER: s3 requis');
  const https = value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname) && !u.username && !u.password; }
    catch { return false; }
  };
  for (const name of ['APP_ORIGINS', 'S3_CORS_ORIGINS']) {
    if (env[name] && env[name].split(',').some(v => !https(v.trim()))) problems.push(`${name}: origines HTTPS publiques requises`);
  }
  if (env.S3_ENDPOINT && !https(env.S3_ENDPOINT)) problems.push('S3_ENDPOINT: HTTPS public requis');
  if ((env.DATABASE_URL || '').includes('youface_dev_password')) problems.push('DATABASE_URL: mot de passe de développement interdit');
  try {
    const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON || (env.FIREBASE_SERVICE_ACCOUNT_FILE ? readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8') : '');
    const account = JSON.parse(raw);
    if (account.project_id !== env.FIREBASE_PROJECT_ID || !account.client_email || !account.private_key) throw new Error();
  } catch { problems.push('FIREBASE_SERVICE_ACCOUNT: compte de service requis et projet cohérent'); }
  if (payments) {
    if (!(env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')) problems.push('STRIPE_SECRET_KEY: clé live requise pour encaisser');
    if (!(env.STRIPE_WEBHOOK_SECRET || '').startsWith('whsec_')) problems.push('STRIPE_WEBHOOK_SECRET: requis');
    if (!(env.STRIPE_CREATOR_PRICE_ID || '').startsWith('price_')) problems.push('STRIPE_CREATOR_PRICE_ID: tarif récurrent requis');
    const fee = Number(env.STRIPE_APPLICATION_FEE_PERCENT);
    if (!env.STRIPE_APPLICATION_FEE_PERCENT || !Number.isFinite(fee) || fee < 0 || fee > 100) problems.push('STRIPE_APPLICATION_FEE_PERCENT: pourcentage entre 0 et 100 requis');
    for (const name of ['BILLING_SUCCESS_URL', 'BILLING_CANCEL_URL', 'CONNECT_RETURN_URL', 'CONNECT_REFRESH_URL']) {
      if (!https(env[name])) problems.push(`${name}: HTTPS public requis`);
    }
  }
  return problems;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = productionProblems(process.env, process.argv.includes('--payments'));
  if (problems.length) {
    console.error('Configuration de production incomplète :\n' + problems.map(v => `- ${v}`).join('\n'));
    process.exitCode = 1;
  } else console.log('Configuration de production cohérente. Tester les services réels avant ouverture.');
}
