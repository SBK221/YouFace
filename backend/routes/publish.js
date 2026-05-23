import { Router } from 'express';
import { uploadToYouTube, getVideoStatus, setVideoPublic } from '../utils/youtubeUploader.js';
import { sendPostByEmail, sendBulkByEmail } from '../utils/emailSender.js';
import { readPosts, writePosts } from '../config/database.js';

const router = Router();

router.post('/youtube/upload', async (req, res) => {
  try {
    const result = await uploadToYouTube(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/youtube/status/:videoId', async (req, res) => {
  try {
    res.json(await getVideoStatus(req.params.videoId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/publish/:videoId', async (req, res) => {
  try {
    const { makePublic = true } = req.body;
    res.json(await setVideoPublic(req.params.videoId, makePublic));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/send-post', async (req, res) => {
  try {
    const { postId, toEmail } = req.body;
    if (!postId || !toEmail) return res.status(400).json({ error: 'postId et toEmail sont requis' });

    const posts = await readPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post non trouvé' });

    await sendPostByEmail(post, toEmail);

    const idx = posts.indexOf(post);
    posts[idx].emailSentAt = new Date().toISOString();
    await writePosts(posts);

    res.json({ success: true, message: 'Email envoyé avec succès' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/send-bulk', async (req, res) => {
  try {
    const { postIds, toEmail } = req.body;
    if (!postIds?.length || !toEmail) return res.status(400).json({ error: 'postIds et toEmail sont requis' });

    const posts = await readPosts();
    const selected = posts.filter(p => postIds.includes(p.id));
    if (!selected.length) return res.status(404).json({ error: 'Aucun post trouvé' });

    await sendBulkByEmail(selected, toEmail);
    res.json({ success: true, message: `${selected.length} posts envoyés par email` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
