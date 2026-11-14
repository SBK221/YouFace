import { newId } from './security.js';

export async function writeAudit(pool, request, action, targetType = null, targetId = null, metadata = {}) {
  await pool.query(
    `INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,ip_address,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [newId(), request.auth?.id || null, action, targetType, targetId, request.ip, JSON.stringify(metadata)]
  );
}
