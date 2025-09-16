import db from '../../models/index.js';
import { Op } from 'sequelize';
// const { DateTime } = require('luxon');



// function getDateStringFromDate(dt) {
//     // dt is a Luxon DateTime
//     return dt.toFormat('yyyy-LL-dd'); // for Sequelize DATEONLY
// }


export async function listTask(req, res) {
    try {
        const {
            q = '',
            status = '',
            urgency = '',
            dueFrom = '',
            dueTo = '',
            page = '1',
            limit = '50',
            sort = 'dueDate',
            dir = 'asc'
        } = req.query;


        const where = {};
        // Search (case-insensitive LIKE for MySQL)
        if (q) {
            const like = `%${q}%`;
            where[Op.or] = [
                { task: { [Op.like]: like } },
                { doer: { [Op.like]: like } },
                { department: { [Op.like]: like } },
            ];
        }


        // Status list
        if (status) {
            const arr = String(status)
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            if (arr.length) where.status = { [Op.in]: arr };
        }
        // Urgency
        if (urgency) where.urgency = urgency;


        // Due date range
        if (dueFrom || dueTo) {
            where.dueDate = {};
            if (dueFrom) where.dueDate[Op.gte] = new Date(`${dueFrom}T00:00:00.000Z`);
            if (dueTo) where.dueDate[Op.lte] = new Date(`${dueTo}T23:59:59.999Z`);
        }


        // Pagination
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * limitNum;


        // Sorting
        const allowedSort = new Set(['dueDate', 'createdAt', 'urgency', 'status']);
        const sortKey = allowedSort.has(String(sort)) ? String(sort) : 'dueDate';
        const sortDir = String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';


        const { rows, count } = await db.Task.findAndCountAll({
            where,
            order: [[sortKey, sortDir]],
            limit: limitNum,
            offset,
        });

        return res.json({
            rows,
            count,
            page: pageNum,
            totalPages: Math.ceil(count / limitNum)
        });
    } catch (err) {
        console.error('GET /api/tasks failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

