import { newId } from './security.js';

export function createNotificationService(pool, eventBus) {
  async function create(input) {
    if (!input.userId || input.userId === input.actorId) return null;
    const id = newId();
    const result = await pool.query(
      `INSERT INTO notifications(id,user_id,actor_id,type,content_id,message_id,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id,user_id,actor_id,type,content_id,message_id,payload,read_at,created_at`,
      [id, input.userId, input.actorId || null, input.type, input.contentId || null, input.messageId || null, JSON.stringify(input.payload || {})]
    );
    const notification = result.rows[0];
    await eventBus.publish({ userId: input.userId, type: 'notification', notification });
    return notification;
  }
  return { create };
}
