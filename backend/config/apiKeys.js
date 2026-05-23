export const config = {
  instagram: {
    token: process.env.INSTAGRAM_TOKEN,
    businessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  },
  tiktok: {
    apiKey: process.env.TIKTOK_API_KEY,
    apiSecret: process.env.TIKTOK_API_SECRET,
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    channelId: process.env.YOUTUBE_CHANNEL_ID,
  },
  facebook: {
    token: process.env.FACEBOOK_TOKEN,
    pageId: process.env.FACEBOOK_PAGE_ID,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
  },
  gmail: {
    user: process.env.GMAIL_USER,
    appPassword: process.env.GMAIL_APP_PASSWORD,
  },
};
