import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from '../server/config.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const config = loadConfig();
if (config.storageDriver !== 's3') {
  console.log('Storage driver is not S3; initialization skipped.');
  process.exit(0);
}

const client = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint || undefined,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: config.s3.accessKeyId ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey } : undefined
});

let ready = false;
let lastError;
for (let attempt = 1; attempt <= 30 && !ready; attempt += 1) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    ready = true;
  } catch (headError) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
      ready = true;
    } catch (createError) {
      lastError = createError;
      console.log(`S3 not ready (${attempt}/30); retrying...`);
      await sleep(2000);
    }
  }
}
if (!ready) throw lastError || new Error('S3_NOT_READY');

await client.send(new PutBucketCorsCommand({
  Bucket: config.s3.bucket,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: config.s3.corsOrigins,
      AllowedMethods: ['GET', 'HEAD', 'PUT'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600
    }]
  }
}));
console.log(`S3 initialized: bucket=${config.s3.bucket}, CORS origins=${config.s3.corsOrigins.join(',')}`);
