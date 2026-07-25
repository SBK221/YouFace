import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import rawBody from 'fastify-raw-body';
import Redis from 'ioredis';
import Stripe from 'stripe';
import { createAuth } from './lib/auth.js';
import { createNotificationService } from './lib/notifications.js';
import { createFirebaseIdentityVerifier } from './lib/firebase-identity.js';
import { authRoutes } from './routes/auth.js';
import { profileRoutes } from './routes/profiles.js';
import { contentRoutes } from './routes/content.js';
import { messagingRoutes } from './routes/messaging.js';
import { notificationRoutes } from './routes/notifications.js';
import { mediaRoutes } from './routes/media.js';
import { moderationRoutes } from './routes/moderation.js';
import { analyticsRoutes } from './routes/analytics.js';
import { billingRoutes } from './routes/billing.js';

export async function buildApp({ config, pool, storage, eventBus, identityVerifier: injectedIdentityVerifier = null, logger = true }) {
  const app = Fastify({
    logger,
    trustProxy: config.env === 'production',
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 30_000,
    keepAliveTimeout: 72_000
  });

  let rateRedis = null;
  if (config.redisUrl) {
    rateRedis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try { await rateRedis.connect(); }
    catch (error) {
      app.log.warn({ err: error }, 'Redis unavailable for distributed rate limiting; using local limiter');
      await rateRedis.quit().catch(() => {});
      rateRedis = null;
    }
  }

  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    origin(origin, cb) {
      if (!origin || config.origins.includes(origin)) return cb(null, true);
      cb(new Error('CORS_ORIGIN_DENIED'), false);
    }
  });
  let developmentStorageOrigin = null;
  if (config.env !== 'production' && config.storageDriver === 's3' && config.s3.endpoint) {
    try { developmentStorageOrigin = new URL(config.s3.endpoint).origin; }
    catch { app.log.warn('Invalid S3 endpoint; not added to development CSP'); }
  }
  const connectSources = ["'self'", 'https:'];
  if (developmentStorageOrigin) connectSources.push(developmentStorageOrigin);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com', 'https://apis.google.com'],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        connectSrc: connectSources,
        frameSrc: ["'self'", 'https://www.google.com', 'https://accounts.google.com', 'https://*.firebaseapp.com'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.env === 'production' ? [] : null
      }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: config.env === 'production' ? undefined : false
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    redis: rateRedis || undefined,
    keyGenerator: request => request.auth?.id || request.ip
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.uploadMaxBytes, fields: 10, parts: 20 }
  });
  await app.register(rawBody, { global: false, encoding: false, runFirst: true });

  const auth = createAuth(config, pool);
  const notifications = createNotificationService(pool, eventBus);
  const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey, { maxNetworkRetries: 2 }) : null;
  const identityVerifier = injectedIdentityVerifier || createFirebaseIdentityVerifier(config);
  const ctx = { config, pool, storage, eventBus, notifications, auth, stripe, identityVerifier };

  app.get('/runtime-config.js', async (_request, reply) => {
    const publicConfig = {
      apiBaseUrl: '',
      firebase: config.firebasePublic,
      iosGoogleAuthEnabled: config.iosGoogleAuthEnabled,
      revenueCatAppleApiKey: config.revenueCatAppleApiKey,
      revenueCatGoogleApiKey: config.revenueCatGoogleApiKey,
      creditProductIds: Object.keys(config.revenueCatCreditProducts)
    };
    return reply.type('application/javascript; charset=utf-8').send(
      `window.YOUFACE_CONFIG = Object.freeze(${JSON.stringify(publicConfig)});`
    );
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready', storage: storage.driver, billing: Boolean(stripe), identity: identityVerifier.configured };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  await authRoutes(app, ctx);
  await profileRoutes(app, ctx);
  await contentRoutes(app, ctx);
  await messagingRoutes(app, ctx);
  await notificationRoutes(app, ctx);
  await mediaRoutes(app, ctx);
  await moderationRoutes(app, ctx);
  await analyticsRoutes(app, ctx);
  await billingRoutes(app, ctx);

  await app.register(fastifyStatic, {
    root: config.publicDir,
    prefix: '/',
    index: ['index.html'],
    cacheControl: config.env === 'production',
    maxAge: config.env === 'production' ? '1h' : 0,
    immutable: false
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/health/')) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return reply.sendFile('index.html');
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.validation });
    if (error.message === 'CORS_ORIGIN_DENIED') return reply.code(403).send({ error: 'CORS_ORIGIN_DENIED' });
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'FILE_TOO_LARGE' });
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    const publicCode = statusCode < 500 && /^[A-Z0-9_]+$/.test(String(error.message || ''))
      ? error.message
      : statusCode < 500 ? 'REQUEST_FAILED' : 'INTERNAL_ERROR';
    request.log.error({ err: error }, 'request failed');
    return reply.code(statusCode).send({ error: publicCode });
  });

  app.addHook('onClose', async () => {
    await rateRedis?.quit().catch(() => {});
  });

  return app;
}
