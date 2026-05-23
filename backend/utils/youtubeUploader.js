import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';

function getYouTubeClient() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || apiKey === 'your_youtube_api_key') {
    throw new Error('YOUTUBE_API_KEY non configuré dans .env');
  }
  return google.youtube({ version: 'v3', auth: apiKey });
}

export async function uploadToYouTube({ videoPath, title, description = '', tags = [] }) {
  if (!videoPath || !existsSync(videoPath)) {
    throw new Error(`Fichier vidéo introuvable: ${videoPath}`);
  }

  const youtube = getYouTubeClient();

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, tags, categoryId: '22' },
      status: { privacyStatus: 'private' },
    },
    media: {
      body: createReadStream(videoPath),
    },
  });

  return { videoId: response.data.id, status: response.data.status };
}

export async function getVideoStatus(videoId) {
  const youtube = getYouTubeClient();

  const response = await youtube.videos.list({
    part: ['status', 'snippet', 'processingDetails'],
    id: [videoId],
  });

  const item = response.data.items?.[0];
  if (!item) throw new Error(`Vidéo introuvable: ${videoId}`);
  return item;
}

export async function setVideoPublic(videoId, makePublic = true) {
  const youtube = getYouTubeClient();

  const response = await youtube.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status: { privacyStatus: makePublic ? 'public' : 'private' },
    },
  });

  return { videoId, privacyStatus: response.data.status.privacyStatus };
}
