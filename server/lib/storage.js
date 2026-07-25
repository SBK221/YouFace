import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, CreateBucketCommand, HeadBucketCommand, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const cleanKey = key => {
  const normalized = path.posix.normalize(String(key)).replace(/^\/+/, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('STORAGE_KEY_INVALID');
  }
  return normalized;
};

export async function createStorage(config) {
  if (config.storageDriver === 's3') {
    const client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint || undefined,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: config.s3.accessKeyId ? { accessKeyId:config.s3.accessKeyId,secretAccessKey:config.s3.secretAccessKey } : undefined
    });
    try {
      await client.send(new HeadBucketCommand({ Bucket:config.s3.bucket }));
    } catch (error) {
      if (!config.s3.autoCreateBucket) throw error;
      await client.send(new CreateBucketCommand({ Bucket:config.s3.bucket }));
    }
    return {
      driver:'s3',
      async putFile(key,filePath,contentType) {
        const upload=new Upload({client,params:{Bucket:config.s3.bucket,Key:cleanKey(key),Body:fs.createReadStream(filePath),ContentType:contentType}});
        await upload.done();
      },
      async getStream(key) {
        const result=await client.send(new GetObjectCommand({Bucket:config.s3.bucket,Key:cleanKey(key)}));
        return result.Body;
      },
      async getUrl(key) {
        return getSignedUrl(client,new GetObjectCommand({Bucket:config.s3.bucket,Key:cleanKey(key)}),{expiresIn:config.signedUrlTtlSeconds});
      },
      async createUploadUrl(key,contentType) {
        const uploadUrl=await getSignedUrl(client,new PutObjectCommand({Bucket:config.s3.bucket,Key:cleanKey(key),ContentType:contentType}),{expiresIn:900});
        return { uploadUrl,headers:{'Content-Type':contentType} };
      },
      async stat(key) {
        const result=await client.send(new HeadObjectCommand({Bucket:config.s3.bucket,Key:cleanKey(key)}));
        return { sizeBytes:Number(result.ContentLength||0),contentType:result.ContentType||'' };
      },
      async delete(key) { await client.send(new DeleteObjectCommand({Bucket:config.s3.bucket,Key:cleanKey(key)})); },
      async copyToFile(key,filePath) { const stream=await this.getStream(key);await pipeline(stream,fs.createWriteStream(filePath)); }
    };
  }

  await fsp.mkdir(config.localStorageDir,{recursive:true});
  return {
    driver:'local',root:config.localStorageDir,
    async putFile(key,filePath) { const target=path.join(config.localStorageDir,cleanKey(key));await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.copyFile(filePath,target); },
    async getStream(key) { return fs.createReadStream(path.join(config.localStorageDir,cleanKey(key))); },
    async getUrl(key) { return `/media-files/${cleanKey(key).split('/').map(encodeURIComponent).join('/')}`; },
    async createUploadUrl() { return null; },
    async stat(key) { const stat=await fsp.stat(path.join(config.localStorageDir,cleanKey(key)));return {sizeBytes:stat.size,contentType:''}; },
    async delete(key) { await fsp.rm(path.join(config.localStorageDir,cleanKey(key)),{force:true}); },
    async copyToFile(key,filePath) { await fsp.copyFile(path.join(config.localStorageDir,cleanKey(key)),filePath); }
  };
}
