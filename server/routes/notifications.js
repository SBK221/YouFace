export async function notificationRoutes(app, ctx) {
  const { pool, auth, eventBus } = ctx;

  app.get('/api/notifications', {
    preHandler: auth.requireAuth,
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } } } }
  }, async request => {
    const result = await pool.query(
      `SELECT n.id,n.type,n.content_id,n.message_id,n.payload,n.read_at,n.created_at,
              p.username AS actor_username,p.display_name AS actor_display_name
       FROM notifications n LEFT JOIN profiles p ON p.user_id=n.actor_id
       WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT $2`, [request.auth.id,request.query.limit]
    );
    return { items: result.rows.map(r => ({ id:r.id,type:r.type,contentId:r.content_id,messageId:r.message_id,payload:r.payload,readAt:r.read_at,createdAt:r.created_at,actor:r.actor_username ? {username:r.actor_username,displayName:r.actor_display_name} : null })) };
  });

  app.post('/api/notifications/:id/read', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } }
  }, async (request, reply) => {
    const result = await pool.query('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 RETURNING id', [request.params.id,request.auth.id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'NOTIFICATION_NOT_FOUND' });
    return { ok: true };
  });

  app.get('/api/events', { preHandler: auth.requireAuth }, async (request, reply) => {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    raw.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const unsubscribe = eventBus.subscribe(request.auth.id, event => {
      raw.write(`event: ${event.type || 'message'}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const keepAlive = setInterval(() => raw.write(': ping\n\n'), 20_000);
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      raw.end();
    });
  });
}
