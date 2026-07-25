import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';

const bool = (value, fallback = false) => value == null ? fallback : String(value).toLowerCase() === 'true';
const int = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function loadConfig(overrides = {}) {
  const root = path.resolve(process.cwd());
  const env = process.env;
  const config = {
    env: env.NODE_ENV || 'development',
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 4173),
    root,
    publicDir: path.join(root, 'public'),
    tmpDir: path.join(root, 'data', 'tmp'),
    localStorageDir: path.join(root, 'data', 'storage'),
    origins: (env.APP_ORIGINS || 'http://localhost:4173,capacitor://localhost').split(',').map(v => v.trim()).filter(Boolean),
    cookieSecure: bool(env.COOKIE_SECURE, false),
    sessionTtlDays: int(env.SESSION_TTL_DAYS, 30),
    bootstrapAdminFirebaseUid: (env.BOOTSTRAP_ADMIN_FIREBASE_UID || '').trim(),
    firebaseProjectId: (env.FIREBASE_PROJECT_ID || '').trim(),
    firebaseServiceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    firebaseServiceAccountFile: env.FIREBASE_SERVICE_ACCOUNT_FILE || '',
    firebaseCheckRevoked: bool(env.FIREBASE_CHECK_REVOKED, true),
    firebasePublic: {
      apiKey: env.FIREBASE_PUBLIC_API_KEY || '',
      authDomain: env.FIREBASE_PUBLIC_AUTH_DOMAIN || '',
      projectId: env.FIREBASE_PROJECT_ID || '',
      appId: env.FIREBASE_PUBLIC_APP_ID || '',
      messagingSenderId: env.FIREBASE_PUBLIC_MESSAGING_SENDER_ID || ''
    },
    iosGoogleAuthEnabled: bool(env.IOS_GOOGLE_AUTH_ENABLED, false),
    databaseUrl: env.DATABASE_URL || 'postgres://youface:youface_dev_password@localhost:5432/youface',
    redisUrl: env.REDIS_URL || '',
    storageDriver: env.STORAGE_DRIVER || 'local',
    s3: {
      endpoint: env.S3_ENDPOINT || '',
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || 'youface-media',
      accessKeyId: env.S3_ACCESS_KEY || '',
      secretAccessKey: env.S3_SECRET_KEY || '',
      forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, true),
      autoCreateBucket: bool(env.S3_AUTO_CREATE_BUCKET, false),
      corsOrigins: (env.S3_CORS_ORIGINS || 'http://localhost:4173,http://127.0.0.1:4173').split(',').map(v => v.trim()).filter(Boolean)
    },
    signedUrlTtlSeconds: int(env.SIGNED_URL_TTL_SECONDS, 900),
    uploadMaxBytes: int(env.UPLOAD_MAX_BYTES, 500 * 1024 * 1024),
    ffmpegBin: env.FFMPEG_BIN || 'ffmpeg',
    ffprobeBin: env.FFPROBE_BIN || 'ffprobe',
    workerPollMs: int(env.WORKER_POLL_MS, 1000),
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    stripeCreatorPriceId: env.STRIPE_CREATOR_PRICE_ID || '',
    stripeConnectCountryDefault: env.STRIPE_CONNECT_COUNTRY_DEFAULT || 'FR',
    stripeApplicationFeePercent: int(env.STRIPE_APPLICATION_FEE_PERCENT, 10),
    revenueCatAppleApiKey: env.REVENUECAT_APPLE_API_KEY || '',
    revenueCatGoogleApiKey: env.REVENUECAT_GOOGLE_API_KEY || '',
    revenueCatWebhookAuthorization: env.REVENUECAT_WEBHOOK_AUTHORIZATION || '',
    revenueCatWebhookHmacSecret: env.REVENUECAT_WEBHOOK_HMAC_SECRET || '',
    revenueCatWebhookToleranceSeconds: int(env.REVENUECAT_WEBHOOK_TOLERANCE_SECONDS, 300),
    revenueCatPremiumEntitlement: env.REVENUECAT_PREMIUM_ENTITLEMENT || 'youface_premium',
    revenueCatCreditProducts: (() => {
      try { return JSON.parse(env.REVENUECAT_CREDIT_PRODUCTS_JSON || '{"youface_credits_100":100,"youface_credits_550":550,"youface_credits_1200":1200}'); }
      catch { return {}; }
    })(),
    tipPlatformFeePercent: int(env.TIP_PLATFORM_FEE_PERCENT, 10),
    billingSuccessUrl: env.BILLING_SUCCESS_URL || 'http://localhost:4173/#creator',
    billingCancelUrl: env.BILLING_CANCEL_URL || 'http://localhost:4173/#creator',
    connectReturnUrl: env.CONNECT_RETURN_URL || 'http://localhost:4173/#creator',
    connectRefreshUrl: env.CONNECT_REFRESH_URL || 'http://localhost:4173/#creator'
  };
  return Object.freeze({ ...config, ...overrides });
}
