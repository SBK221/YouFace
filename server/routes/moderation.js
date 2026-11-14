import { writeAudit } from '../lib/audit.js';
import { newId } from '../lib/security.js';

export async function moderationRoutes(app, ctx) {
  const { pool, auth } = ctx;

  app.post('/api/reports', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    schema: { body: { type: 'object', additionalProperties: false, required: ['targetType','targetId','reason'], properties: {
      targetType: { type: 'string', enum: ['content','comment','user','message'] },
      targetId: { type: 'string', format: 'uuid' },
      reason: { type: 'string', minLength: 3, maxLength: 80 },
      details: { type: 'string', maxLength: 1000, default: '' }
    } } }
  }, async (request, reply) => {
    const targetChecks={content:'content',comment:'comments',user:'users',message:'messages'};
    const table=targetChecks[request.body.targetType];
    const target=await pool.query(`SELECT 1 FROM ${table} WHERE id=$1`,[request.body.targetId]);
    if (!target.rowCount) return reply.code(404).send({ error:'REPORT_TARGET_NOT_FOUND' });
    const id = newId();
    await pool.query(
      `INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details) VALUES($1,$2,$3,$4,$5,$6)`,
      [id,request.auth.id,request.body.targetType,request.body.targetId,request.body.reason,request.body.details || '']
    );
    await writeAudit(pool,request,'report.create',request.body.targetType,request.body.targetId,{ reportId:id });
    return reply.code(201).send({ id });
  });

  app.get('/api/moderation/reports', {
    preHandler: auth.requireRole('moderator','admin'),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', enum: ['open','reviewing','resolved','dismissed'], default: 'open' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } } } }
  }, async request => {
    const result = await pool.query(
      `SELECT r.*,p.username AS reporter_username FROM reports r JOIN profiles p ON p.user_id=r.reporter_id
       WHERE r.status=$1 ORDER BY r.created_at ASC LIMIT $2`, [request.query.status,request.query.limit]
    );
    return { items: result.rows };
  });

  app.post('/api/moderation/reports/:id/action', {
    preHandler: [auth.requireRole('moderator','admin'), auth.requireCsrf],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', additionalProperties: false, required: ['action','reason'], properties: {
        action: { type: 'string', enum: ['hide_content','remove_content','dismiss','suspend_user','resolve'] },
        reason: { type: 'string', minLength: 3, maxLength: 500 }
      } }
    }
  }, async (request, reply) => {
    const report = await pool.query('SELECT * FROM reports WHERE id=$1', [request.params.id]);
    if (!report.rowCount) return reply.code(404).send({ error: 'REPORT_NOT_FOUND' });
    const r = report.rows[0];
    const action = request.body.action;
    if (action === 'hide_content' && r.target_type === 'content') await pool.query("UPDATE content SET status='hidden',updated_at=CURRENT_TIMESTAMP WHERE id=$1", [r.target_id]);
    if (action === 'remove_content' && r.target_type === 'content') await pool.query("UPDATE content SET status='removed',updated_at=CURRENT_TIMESTAMP WHERE id=$1", [r.target_id]);
    if (action === 'suspend_user' && r.target_type === 'user') await pool.query("UPDATE users SET status='suspended',updated_at=CURRENT_TIMESTAMP WHERE id=$1", [r.target_id]);
    const status = action === 'dismiss' ? 'dismissed' : 'resolved';
    await pool.query('UPDATE reports SET status=$2,assigned_to=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [r.id,status,request.auth.id]);
    await pool.query(
      `INSERT INTO moderation_actions(id,moderator_id,report_id,target_type,target_id,action,reason) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [newId(),request.auth.id,r.id,r.target_type,r.target_id,action,request.body.reason]
    );
    await writeAudit(pool,request,`moderation.${action}`,r.target_type,r.target_id,{ reportId:r.id, reason:request.body.reason });
    return { ok: true };
  });
}
