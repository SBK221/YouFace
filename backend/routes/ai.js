import { Router } from 'express';
import { generatePost, generateIdeas } from '../utils/contentGenerator.js';

const router = Router();

router.post('/generate-post', async (req, res) => {
  try {
    const { topic, style = 'engaging', length = 'medium' } = req.body;
    if (!topic) return res.status(400).json({ error: 'Le champ "topic" est requis' });
    res.json(await generatePost(topic, style, length));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-ideas', async (req, res) => {
  try {
    const { topic, count = 5 } = req.body;
    if (!topic) return res.status(400).json({ error: 'Le champ "topic" est requis' });
    const ideas = await generateIdeas(topic, Number(count));
    res.json({ ideas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
