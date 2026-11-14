import { writeAudit } from '../lib/audit.js';

export async function profileRoutes(app, ctx) {
  const { pool, auth } = ctx;

  app.get('/api/profiles/:username', {
    preHandler: auth.optionalAuth,
    schema: { params: { type: 'object', required: ['username'], properties: { username: { type: 'string', minLength: 3, maxLength: 32 } } } }
  }, async (request, reply) => {
    const result = await pool.query(
      `SELECT u.id,u.role,p.username,p.display_name,p.bio,p.country,p.language,p.account_type,
        (SELECT COUNT(*)::int FROM follows WHERE following_id=u.id) AS followers,
        (SELECT COUNT(*)::int FROM follows WHERE follower_id=u.id) AS following,
        EXISTS(SELECT 1 FROM follows WHERE follower_id=$2 AND following_id=u.id) AS followed_by_me
       FROM users u JOIN profiles p ON p.user_id=u.id WHERE p.username=$1 AND u.status='active'`,
      [request.params.username.toLowerCase(), request.auth?.id || null]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'PROFILE_NOT_FOUND' });
    const row = result.rows[0];
    return {
      id: row.id, role: row.role, username: row.username, displayName: row.display_name, bio: row.bio,
      country: row.country, language: row.language, accountType: row.account_type,
      followers: row.followers, following: row.following, followedByMe: row.followed_by_me
    };
  });

  app.patch('/api/profiles/me', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { body: {
      type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        displayName: { type: 'string', minLength: 2, maxLength: 80 },
        bio: { type: 'string', maxLength: 500 },
        country: { type: 'string', maxLength: 80 },
        language: { type: 'string', minLength: 2, maxLength: 16 },
        accountType: { type: 'string', enum: ['user','creator','business'] }
      }
    }}
  }, async request => {
    const b = request.body;
    const result = await pool.query(
      `UPDATE profiles SET
        display_name=COALESCE($2,display_name), bio=COALESCE($3,bio), country=COALESCE($4,country),
        language=COALESCE($5,language), account_type=COALESCE($6,account_type), updated_at=CURRENT_TIMESTAMP
       WHERE user_id=$1
       RETURNING username,display_name,bio,country,language,account_type`,
      [request.auth.id,b.displayName ?? null,b.bio ?? null,b.country ?? null,b.language ?? null,b.accountType ?? null]
    );
    await writeAudit(pool, request, 'profile.update', 'user', request.auth.id);
    const row = result.rows[0];
    return { username: row.username, displayName: row.display_name, bio: row.bio, country: row.country, language: row.language, accountType: row.account_type };
  });

  app.post('/api/profiles/:userId/follow', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { params: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } } }
  }, async (request, reply) => {
    const target = request.params.userId;
    if (target === request.auth.id) return reply.code(400).send({ error: 'CANNOT_FOLLOW_SELF' });
    const exists = await pool.query('SELECT 1 FROM users WHERE id=$1 AND status=\'active\'', [target]);
    if (!exists.rowCount) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const inserted = await pool.query(
      `INSERT INTO follows(follower_id,following_id) VALUES($1,$2)
       ON CONFLICT DO NOTHING RETURNING follower_id`, [request.auth.id,target]
    );
    if (!inserted.rowCount) {
      await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [request.auth.id,target]);
      return { following: false };
    }
    await ctx.notifications.create({ userId: target, actorId: request.auth.id, type: 'follow' });
    return { following: true };
  });
}
