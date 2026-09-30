import models from '../../models/index.js';
const { AuditLog, User } = models;

export async function listAuditLog(req, res) {
  try {
    const { entity_type, entity_id, page = 1, limit = 50 } = req.query;
    const where = {};
    if (entity_type) where.entity_type = entity_type;
    if (entity_id) where.entity_id = entity_id;

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'performedByUser', attributes: ['id', 'username'] }],
      order: [['createdAt', 'DESC']],
      offset: (Number(page) - 1) * Number(limit),
      limit: Number(limit),
    });

    res.json({ data: rows, total: count, totalPages: Math.ceil(count / limit) });
  } catch (err) {
    console.error('[auditLog.controller]', err);
    res.status(500).json({ error: 'Failed to load audit log.' });
  }
}