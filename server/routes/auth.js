import { newId, sha256 } from '../lib/security.js';

const isNativeClient = request => request.headers['x-youface-client'] === 'native';
const allowedProviders = new Set(['phone', 'google', 'gmail']);

function publicUser(row) {
  return {
    id: row.id,
    email: row.email || null,
    phoneNumber: row.phone_e164 || null,
    authProvider: row.primary_auth_provider || null,
    role: row.role,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    country: row.country,
    language: row.language,
    accountType: row.account_type
  };
}

function usernameBase(identity) {
  const raw = identity.displayName || identity.email?.split('@')[0] || identity.phoneE164?.slice(-8) || 'youface';
  const clean = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.-]+/g, '').slice(0, 22);
  return clean.length >= 3 ? clean : 'youface';
}

async function uniqueUsername(client, identity) {
  const base = usernameBase(identity);
  const stable = sha256(`${identity.provider}:${identity.subject}`).slice(0, 6);
  for (const candidate of [base, `${base}.${stable}`]) {
    const found = await client.query('SELECT 1 FROM profiles WHERE username=$1', [candidate]);
    if (!found.rowCount) return candidate;
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base.slice(0, 22)}.${stable}${attempt}`.slice(0, 32);
    const found = await client.query('SELECT 1 FROM profiles WHERE username=$1', [candidate]);
    if (!found.rowCount) return candidate;
  }
  throw new Error('USERNAME_ALLOCATION_FAILED');
}

function defaultDisplayName(identity) {
  if (identity.displayName?.trim()) return identity.displayName.trim().slice(0, 80);
  if (identity.phoneE164) return `Membre ${identity.phoneE164.slice(-4)}`;
  return 'Membre YouFace';
}

export async function authRoutes(app, ctx) {
  const { pool, auth, config, identityVerifier } = ctx;

  app.post('/api/auth/exchange', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: { body: {
      type: 'object', additionalProperties: false, required: ['idToken'],
      properties: { idToken: { type: 'string', minLength: 20, maxLength: 16384 } }
    }}
  }, async (request, reply) => {
    const identity = await identityVerifier.verify(request.body.idToken);
    if (!allowedProviders.has(identity.provider)) return reply.code(403).send({ error: 'AUTH_PROVIDER_NOT_ALLOWED' });

    const client = await pool.connect();
    let userId;
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT user_id FROM identity_accounts WHERE provider=$1 AND provider_subject=$2',
        [identity.provider, identity.subject]
      );
      if (existing.rowCount) {
        userId = existing.rows[0].user_id;
        await client.query(
          `UPDATE identity_accounts SET email=$3,phone_e164=$4,updated_at=CURRENT_TIMESTAMP
           WHERE provider=$1 AND provider_subject=$2`,
          [identity.provider, identity.subject, identity.email, identity.phoneE164]
        );
        await client.query(
          'UPDATE users SET email=COALESCE($2,email),primary_auth_provider=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',
          [userId, identity.email, identity.provider]
        );
      } else if (identity.email && (await client.query('SELECT user_id FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.email=$1', [identity.email])).rowCount) {
        // Cross-provider linking: a user with this address already exists (e.g. signed in with
        // Google, now signing in with Gmail+password). Both providers deliver a verified email
        // (enforced in firebase-identity), so linking to the same account is safe and avoids a
        // unique-email violation surfacing as a 500.
        const linked = await client.query('SELECT id FROM users WHERE email=$1', [identity.email]);
        userId = linked.rows[0].id;
        await client.query(
          'UPDATE users SET primary_auth_provider=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',
          [userId, identity.provider]
        );
        await client.query(
          `INSERT INTO identity_accounts(id,user_id,provider,provider_subject,email,phone_e164)
           VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT(provider,provider_subject) DO UPDATE SET email=EXCLUDED.email,phone_e164=EXCLUDED.phone_e164,updated_at=CURRENT_TIMESTAMP`,
          [newId(), userId, identity.provider, identity.subject, identity.email, identity.phoneE164]
        );
      } else {
        userId = newId();
        const role = config.bootstrapAdminFirebaseUid && identity.subject === config.bootstrapAdminFirebaseUid ? 'admin' : 'user';
        const username = await uniqueUsername(client, identity);
        await client.query(
          'INSERT INTO users(id,email,password_hash,role,primary_auth_provider) VALUES($1,$2,NULL,$3,$4)',
          [userId, identity.email, role, identity.provider]
        );
        await client.query(
          `INSERT INTO profiles(user_id,username,display_name,country,language,account_type)
           VALUES($1,$2,$3,'','fr',$4)`,
          [userId, username, defaultDisplayName(identity), role === 'admin' ? 'creator' : 'user']
        );
        await client.query(
          `INSERT INTO identity_accounts(id,user_id,provider,provider_subject,email,phone_e164)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [newId(), userId, identity.provider, identity.subject, identity.email, identity.phoneE164]
        );
        await client.query('INSERT INTO wallet_balances(user_id,credits) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING', [userId]);
      }
      await client.query(
        `INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,ip_address,metadata)
         VALUES($1,$2,'auth.exchange','user',$2,$3,$4::jsonb)`,
        [newId(), userId, request.ip, JSON.stringify({ provider: identity.provider })]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }

    const result = await pool.query(
      `SELECT u.id,u.email,u.role,u.status,u.primary_auth_provider,
              p.username,p.display_name,p.bio,p.country,p.language,p.account_type,
              ia.phone_e164
       FROM users u
       JOIN profiles p ON p.user_id=u.id
       LEFT JOIN identity_accounts ia ON ia.user_id=u.id AND ia.provider='phone'
       WHERE u.id=$1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active') return reply.code(403).send({ error: 'ACCOUNT_NOT_ACTIVE' });
    const session = await auth.createSession(request, reply, userId);
    return {
      user: publicUser(row), csrfToken: session.csrfToken,
      ...(isNativeClient(request) ? { sessionToken: session.token } : {})
    };
  });

  const removed = async (_request, reply) => reply.code(410).send({
    error: 'AUTH_METHOD_REMOVED', allowedMethods: ['phone', 'google', 'gmail_password']
  });
  app.post('/api/auth/register', removed);
  app.post('/api/auth/login', removed);

  app.get('/api/auth/session', { preHandler: auth.optionalAuth }, async request => {
    if (!request.auth) return { user: null, csrfToken: null };
    return { user: publicUser(request.auth), csrfToken: request.auth.csrf_token };
  });

  app.post('/api/auth/logout', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    await auth.revokeCurrent(request, reply);
    return { ok: true };
  });
}
