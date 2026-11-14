import fs from 'node:fs/promises';
import path from 'node:path';

export async function applyAllMigrations(pool) {
  const dir = path.resolve('migrations');
  const files = (await fs.readdir(dir)).filter(name => name.endsWith('.sql')).sort();
  for (const filename of files) await pool.query(await fs.readFile(path.join(dir, filename), 'utf8'));
}

export function identityVerifier(identities) {
  return {
    configured: true,
    async verify(token) {
      const identity = identities[token];
      if (!identity) { const error = new Error('IDENTITY_TOKEN_INVALID'); error.statusCode = 401; throw error; }
      if (!['phone','google','gmail'].includes(identity.provider)) { const error = new Error('AUTH_PROVIDER_NOT_ALLOWED'); error.statusCode = 403; throw error; }
      return identity;
    }
  };
}

export function cookieFrom(response) {
  const raw = response.headers['set-cookie'];
  if (!raw) return '';
  return (Array.isArray(raw) ? raw[0] : raw).split(';')[0];
}

export async function exchange(app, token, native = false) {
  const response = await app.inject({
    method: 'POST', url: '/api/auth/exchange',
    headers: { 'content-type': 'application/json', ...(native ? {'x-youface-client':'native','x-youface-platform':'android'} : {}) },
    payload: JSON.stringify({ idToken: token })
  });
  return { response, body: response.json(), cookie: cookieFrom(response) };
}

export async function mutate(app, client, url, body = {}, extraHeaders = {}) {
  return app.inject({
    method: 'POST', url,
    headers: { cookie: client.cookie, 'content-type': 'application/json', 'x-csrf-token': client.body.csrfToken, ...extraHeaders },
    payload: JSON.stringify(body)
  });
}
