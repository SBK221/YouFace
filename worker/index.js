import fsp from 'node:fs/promises';
import { loadConfig } from '../server/config.js';
import { createPool } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { createStorage } from '../server/lib/storage.js';
import { claimNextJob, processJob } from './processor.js';

const config = loadConfig();
await fsp.mkdir(config.tmpDir,{recursive:true});
const pool = createPool(config);
await runMigrations(pool);
const storage = await createStorage(config);
let stopping = false;
process.once('SIGINT', () => { stopping=true; });
process.once('SIGTERM', () => { stopping=true; });
console.log('[worker] YouFace media worker started');
while (!stopping) {
  try {
    const job = await claimNextJob(pool);
    if (!job) {
      await new Promise(resolve => setTimeout(resolve,config.workerPollMs));
      continue;
    }
    console.log('[worker] processing',job.id,job.media_asset_id);
    await processJob({ pool,storage,config,job });
    console.log('[worker] completed',job.id);
  } catch (error) {
    console.error('[worker]',error.message);
    await new Promise(resolve => setTimeout(resolve,1000));
  }
}
await pool.end();
console.log('[worker] stopped');
