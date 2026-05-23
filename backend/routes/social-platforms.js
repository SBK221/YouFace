import { Router } from 'express';
import axios from 'axios';
import { config } from '../config/apiKeys.js';

const router = Router();

router.post('/instagram/post', async (req, res) => {
  try {
    const { caption, imageUrl } = req.body;
    if (!config.instagram.token || config.instagram.token === 'your_instagram_token') {
      return res.status(400).json({ error: 'Token Instagram non configuré dans .env' });
    }

    const { data: container } = await axios.post(
      `https://graph.facebook.com/v18.0/${config.instagram.businessAccountId}/media`,
      { image_url: imageUrl, caption, access_token: config.instagram.token }
    );

    await axios.post(
      `https://graph.facebook.com/v18.0/${config.instagram.businessAccountId}/media_publish`,
      { creation_id: container.id, access_token: config.instagram.token }
    );

    res.json({ success: true, message: 'Post Instagram publié' });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

router.post('/facebook/post', async (req, res) => {
  try {
    const { message, link } = req.body;
    if (!config.facebook.token || config.facebook.token === 'your_facebook_token') {
      return res.status(400).json({ error: 'Token Facebook non configuré dans .env' });
    }

    const { data } = await axios.post(
      `https://graph.facebook.com/v18.0/${config.facebook.pageId}/feed`,
      { message, link, access_token: config.facebook.token }
    );

    res.json({ success: true, postId: data.id });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

router.get('/status', (req, res) => {
  res.json({
    instagram: !!config.instagram.token && config.instagram.token !== 'your_instagram_token',
    tiktok: !!config.tiktok.apiKey && config.tiktok.apiKey !== 'your_tiktok_api_key',
    youtube: !!config.youtube.apiKey && config.youtube.apiKey !== 'your_youtube_api_key',
    facebook: !!config.facebook.token && config.facebook.token !== 'your_facebook_token',
    claude: !!config.claude.apiKey && config.claude.apiKey !== 'your_claude_api_key',
    gmail: !!config.gmail.user && config.gmail.user !== 'your_email@gmail.com',
  });
});

export default router;
