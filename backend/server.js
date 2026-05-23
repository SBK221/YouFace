import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import postsRouter from './routes/posts.js';
import schedulerRouter from './routes/scheduler.js';
import socialRouter from './routes/social-platforms.js';
import aiRouter from './routes/ai.js';
import publishRouter from './routes/publish.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, '../frontend')));

app.use('/api/posts', postsRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/social', socialRouter);
app.use('/api/ai', aiRouter);
app.use('/api/publish', publishRouter);

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré: http://localhost:${PORT}`);
  console.log(`   Interface IA:       http://localhost:${PORT}/ai.html`);
  console.log(`   Interface classique: http://localhost:${PORT}/index.html`);
});
