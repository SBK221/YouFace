import { newId, randomToken, safeEqual, sha256 } from './security.js';

export function createAuth(config, pool) {
  const cookieName = 'yf_session';

  async function createSession(request, reply, userId) {
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const sessionId = newId();
    const expires = new Date(Date.now() + config.sessionTtlDays * 86_400_000);
    await pool.query(
      `INSERT INTO sessions(id,user_id,token_hash,csrf_token,user_agent,ip_address,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [sessionId, userId, sha256(token), csrfToken, String(request.headers['user-agent'] || '').slice(0, 500), request.ip, expires]
    );
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      expires
    });
    return { token, csrfToken, expiresAt: expires.toISOString() };
  }

  async function loadSession(request) {
    const authorization = String(request.headers.authorization || '');
    const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const token = bearerToken || request.cookies?.[cookieName];
    if (!token) return null;
    const result = await pool.query(
      `SELECT s.id AS session_id,s.csrf_token,s.expires_at,u.id,u.email,u.role,u.status,u.primary_auth_provider,
              p.username,p.display_name,p.bio,p.country,p.language,p.account_type,
              u.stripe_customer_id,u.stripe_account_id,ia.phone_e164
       FROM sessions s
       JOIN users u ON u.id=s.user_id
       JOIN profiles p ON p.user_id=u.id
       LEFT JOIN identity_accounts ia ON ia.user_id=u.id AND ia.provider='phone'
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND u.status='active'`,
      [sha256(token), new Date()]
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    pool.query('UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1', [row.session_id]).catch(() => {});
    return row;
  }

  async function optionalAuth(request) {
    request.auth = await loadSession(request);
  }

  async function requireAuth(request, reply) {
    request.auth = await loadSession(request);
    if (!request.auth) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
  }

  async function requireCsrf(request, reply) {
    if (!request.auth) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
    const token = request.headers['x-csrf-token'];
    if (!token || !safeEqual(token, request.auth.csrf_token)) {
      return reply.code(403).send({ error: 'CSRF_INVALID' });
    }
    const origin = request.headers.origin;
    if (origin && !config.origins.includes(origin)) {
      return reply.code(403).send({ error: 'ORIGIN_DENIED' });
    }
  }

  const requireRole = (...roles) => async (request, reply) => {
    if (!request.auth) request.auth = await loadSession(request);
    if (!request.auth) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
    if (!roles.includes(request.auth.role)) return reply.code(403).send({ error: 'ROLE_DENIED' });
  };

  async function revokeCurrent(request, reply) {
    if (request.auth?.session_id) {
      await pool.query('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1', [request.auth.session_id]);
    }
    reply.clearCookie(cookieName, { path: '/' });
  }

  return { createSession, loadSession, optionalAuth, requireAuth, requireCsrf, requireRole, revokeCurrent, cookieName };
}
