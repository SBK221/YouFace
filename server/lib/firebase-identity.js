import fs from 'node:fs';
import path from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROVIDERS = new Map([['phone', 'phone'], ['google.com', 'google'], ['password', 'gmail']]);

function configurationError() {
  const error = new Error('IDENTITY_NOT_CONFIGURED');
  error.statusCode = 503;
  return error;
}

function parseServiceAccount(config) {
  let raw = config.firebaseServiceAccountJson || '';
  if (!raw && config.firebaseServiceAccountFile) {
    const filePath = path.resolve(config.root, config.firebaseServiceAccountFile);
    try { raw = fs.readFileSync(filePath, 'utf8'); }
    catch (cause) {
      const error = new Error('FIREBASE_SERVICE_ACCOUNT_FILE_UNREADABLE');
      error.statusCode = 500;
      error.cause = cause;
      throw error;
    }
  }
  if (!raw) return null;
  try {
    const account = JSON.parse(raw);
    if (account.type !== 'service_account' || !account.project_id || !account.client_email || !account.private_key) {
      throw new Error('SERVICE_ACCOUNT_FIELDS_MISSING');
    }
    if (config.firebaseProjectId && account.project_id !== config.firebaseProjectId) {
      throw new Error('SERVICE_ACCOUNT_PROJECT_MISMATCH');
    }
    return account;
  } catch (cause) {
    const error = new Error('FIREBASE_SERVICE_ACCOUNT_JSON_INVALID');
    error.statusCode = 500;
    error.cause = cause;
    throw error;
  }
}

export function createFirebaseIdentityVerifier(config) {
  if (!config.firebaseProjectId) {
    return { configured: false, async verify() { throw configurationError(); } };
  }
  const name = 'youface-identity';
  let app = getApps().find(candidate => candidate.name === name);
  if (!app) {
    const serviceAccount = parseServiceAccount(config);
    app = initializeApp({
      projectId: config.firebaseProjectId,
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault()
    }, name);
  }
  const adminAuth = getAuth(app);
  return {
    configured: true,
    async verify(idToken) {
      let decoded;
      try { decoded = await adminAuth.verifyIdToken(idToken, config.firebaseCheckRevoked); }
      catch (cause) {
        const error = new Error('IDENTITY_TOKEN_INVALID');
        error.statusCode = 401;
        error.cause = cause;
        throw error;
      }
      const provider = PROVIDERS.get(decoded.firebase?.sign_in_provider || '');
      if (!provider) {
        const error = new Error('AUTH_PROVIDER_NOT_ALLOWED');
        error.statusCode = 403;
        throw error;
      }
      if (provider === 'gmail' && !String(decoded.email || '').toLowerCase().endsWith('@gmail.com')) {
        const error = new Error('GMAIL_ADDRESS_REQUIRED');
        error.statusCode = 403;
        throw error;
      }
      if (provider === 'gmail' && decoded.email_verified !== true) {
        const error = new Error('EMAIL_VERIFICATION_REQUIRED');
        error.statusCode = 403;
        throw error;
      }
      return {
        provider,
        subject: decoded.uid,
        email: decoded.email || null,
        phoneE164: decoded.phone_number || null,
        displayName: decoded.name || decoded.email?.split('@')[0] || null
      };
    }
  };
}
