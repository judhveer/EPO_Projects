import models from '../../models/index.js';
const { AuditLog } = models;

// Every write here MUST pass the caller's own transaction through when
// one exists — an audit entry recorded for a change that then rolls
// back would be actively misleading (a record of something that never
// actually happened). No fire-and-forget default.
export async function writeAuditLog({ entityType, entityId, action, performedBy = null, oldValue = null, newValue = null, reason = null, transaction = null }) {
  return AuditLog.create({
    entity_type: entityType,
    entity_id: entityId,
    action,
    performed_by: performedBy,
    old_value: oldValue,
    new_value: newValue,
    reason,
  }, { transaction });
}

export async function getAuditHistory(entityType, entityId) {
  return AuditLog.findAll({
    where: { entity_type: entityType, entity_id: entityId },
    order: [['createdAt', 'DESC']],
  });
}