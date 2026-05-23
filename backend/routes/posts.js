import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readPosts, writePosts } from '../config/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json(await readPosts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const posts = await readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post non trouvé' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const posts = await readPosts();
    const newPost = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'draft',
      ...req.body,
    };
    posts.push(newPost);
    await writePosts(posts);
    res.status(201).json(newPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const posts = await readPosts();
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post non trouvé' });
    posts[idx] = { ...posts[idx], ...req.body, updatedAt: new Date().toISOString() };
    await writePosts(posts);
    res.json(posts[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const posts = await readPosts();
    const filtered = posts.filter(p => p.id !== req.params.id);
    if (filtered.length === posts.length) return res.status(404).json({ error: 'Post non trouvé' });
    await writePosts(filtered);
    res.json({ message: 'Post supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
