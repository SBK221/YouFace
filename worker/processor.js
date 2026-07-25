import fsp from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../server/lib/security.js';
import { probeVideo, transcodeVideo } from '../server/lib/media.js';

export async function claimNextJob(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT j.id,j.media_asset_id
       FROM media_jobs j
       WHERE j.status='queued' AND j.available_at<=CURRENT_TIMESTAMP
       ORDER BY j.created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1`
    );
    if (!result.rowCount) {
      await client.query('COMMIT');
      return null;
    }
    const job = result.rows[0];
    await client.query(
      `UPDATE media_jobs SET status='processing',attempts=attempts+1,started_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=$1`, [job.id]
    );
    await client.query('COMMIT');
    return job;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function processJob({ pool,storage,config,job }) {
  const assetResult = await pool.query('SELECT * FROM media_assets WHERE id=$1', [job.media_asset_id]);
  if (!assetResult.rowCount) throw new Error('MEDIA_ASSET_NOT_FOUND');
  const asset = assetResult.rows[0];
  const token = newId();
  const input = path.join(config.tmpDir,`${token}.input`);
  const output = path.join(config.tmpDir,`${token}.mp4`);
  const thumbnail = path.join(config.tmpDir,`${token}.jpg`);
  try {
    await storage.copyToFile(asset.original_key,input);
    await transcodeVideo(config,input,output,thumbnail);
    const metadata = await probeVideo(config,output);
    const processedKey = `processed/${asset.owner_id}/${asset.id}.mp4`;
    const thumbnailKey = `thumbnails/${asset.owner_id}/${asset.id}.jpg`;
    await storage.putFile(processedKey,output,'video/mp4');
    await storage.putFile(thumbnailKey,thumbnail,'image/jpeg');
    await pool.query(
      `UPDATE media_assets SET processed_key=$2,thumbnail_key=$3,mime_type='video/mp4',duration_seconds=$4,width=$5,height=$6,status='ready',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [asset.id,processedKey,thumbnailKey,metadata.durationSeconds,metadata.width,metadata.height]
    );
    await pool.query("UPDATE media_jobs SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=$1", [job.id]);
    return { assetId:asset.id,status:'ready' };
  } catch (error) {
    const jobs = await pool.query('SELECT attempts FROM media_jobs WHERE id=$1', [job.id]);
    const attempts = Number(jobs.rows[0]?.attempts || 1);
    if (attempts < 3) {
      await pool.query(
        `UPDATE media_jobs SET status='queued',available_at=CURRENT_TIMESTAMP + INTERVAL '30 seconds',last_error=$2 WHERE id=$1`,
        [job.id,String(error.message).slice(0,2000)]
      );
    } else {
      await pool.query("UPDATE media_jobs SET status='failed',completed_at=CURRENT_TIMESTAMP,last_error=$2 WHERE id=$1", [job.id,String(error.message).slice(0,2000)]);
      await pool.query("UPDATE media_assets SET status='failed',error_message=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [asset.id,String(error.message).slice(0,2000)]);
    }
    throw error;
  } finally {
    await Promise.all([input,output,thumbnail].map(file => fsp.rm(file,{force:true}).catch(() => {})));
  }
}
