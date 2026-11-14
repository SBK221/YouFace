import 'dotenv/config';
import fs from 'node:fs/promises';
const bool = value => String(value || '').toLowerCase() === 'true';
const creditProducts = (() => {
  try { return Object.keys(JSON.parse(process.env.REVENUECAT_CREDIT_PRODUCTS_JSON || '{"youface_credits_100":100,"youface_credits_550":550,"youface_credits_1200":1200}')); }
  catch { return []; }
})();
const config = {
  apiBaseUrl: process.env.PUBLIC_API_BASE_URL || '',
  firebase: {
    apiKey: process.env.FIREBASE_PUBLIC_API_KEY || '',
    authDomain: process.env.FIREBASE_PUBLIC_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    appId: process.env.FIREBASE_PUBLIC_APP_ID || '',
    messagingSenderId: process.env.FIREBASE_PUBLIC_MESSAGING_SENDER_ID || ''
  },
  iosGoogleAuthEnabled: bool(process.env.IOS_GOOGLE_AUTH_ENABLED),
  revenueCatAppleApiKey: process.env.REVENUECAT_APPLE_API_KEY || '',
  revenueCatGoogleApiKey: process.env.REVENUECAT_GOOGLE_API_KEY || '',
  creditProductIds: creditProducts
};
await fs.writeFile('public/runtime-config.js', `window.YOUFACE_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`);
console.log('runtime config written (public values only)');
