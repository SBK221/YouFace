import { Router } from 'express';
import schedule from 'node-schedule';
import { readPosts, writePosts } from '../config/database.js';

const router = Router();
const jobs = new Map();

router.post('/schedule/:postId', async (req, res) => {
  try {
    const { scheduledTime } = req.body;
    if (!scheduledTime) return res.status(400).json({ error: 'scheduledTime requis' });

    const date = new Date(scheduledTime);
    if (date <= new Date()) return res.status(400).json({ error: 'La date doit être dans le futur' });

    const posts = await readPosts();
    const idx = posts.findIndex(p => p.id === req.params.postId);
    if (idx === -1) return res.status(404).json({ error: 'Post non trouvé' });

    if (jobs.has(req.params.postId)) jobs.get(req.params.postId).cancel();

    const job = schedule.scheduleJob(date, async () => {
      const all = await readPosts();
      const i = all.findIndex(p => p.id === req.params.postId);
      if (i !== -1) {
        all[i].status = 'published';
        all[i].publishedAt = new Date().toISOString();
        await writePosts(all);
      }
      jobs.delete(req.params.postId);
    });

    jobs.set(req.params.postId, job);
    posts[idx] = { ...posts[idx], status: 'scheduled', scheduledTime };
    await writePosts(posts);

    res.json({ message: 'Publication planifiée', scheduledTime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cancel/:postId', async (req, res) => {
  try {
    if (jobs.has(req.params.postId)) {
      jobs.get(req.params.postId).cancel();
      jobs.delete(req.params.postId);
    }

    const posts = await readPosts();
    const idx = posts.findIndex(p => p.id === req.params.postId);
    if (idx !== -1) {
      posts[idx].status = 'draft';
      delete posts[idx].scheduledTime;
      await writePosts(posts);
    }

    res.json({ message: 'Planification annulée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const posts = await readPosts();
    res.json(posts.filter(p => p.status === 'scheduled'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
