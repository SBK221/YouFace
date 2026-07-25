import fsp from 'node:fs/promises';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';
import { createStorage } from './lib/storage.js';
import { createEventBus } from './lib/event-bus.js';
import { buildApp } from './app.js';

const config = loadConfig();
await Promise.all([fsp.mkdir(config.tmpDir,{recursive:true}),fsp.mkdir(config.localStorageDir,{recursive:true})]);
const pool = createPool(config);
const eventBus = await createEventBus(config.redisUrl);

try {
  await runMigrations(pool);
  const storage = await createStorage(config);
  const app = await buildApp({ config,pool,storage,eventBus });
  const shutdown = async signal => {
    app.log.info({ signal }, 'shutdown');
    await app.close();
    await eventBus.close();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ host:config.host,port:config.port });
} catch (error) {
  console.error(error);
  await eventBus.close().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
}
