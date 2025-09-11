const Task = require('../models/Task');
// const { DateTime } = require('luxon');



// function getDateStringFromDate(dt) {
//     // dt is a Luxon DateTime
//     return dt.toFormat('yyyy-LL-dd'); // for Sequelize DATEONLY
// }




// exports.listTask = async (req, res) => {
//     try {
//         let { date, name, page = 1, limit = 50, } = req.query;
//         page = parseInt(page);
//         limit = parseInt(limit);

//         const where = {};
//         if (date) {
//             where.date = date;
//         }
//         else {
//             where.status = 'pending'
//         }

//         if (name) {
//             where.name = { [Op.like]: `%${name.trim().toUpperCase()}%` };
//         }

//         const { rows, count } = await Task.findAndCountAll({
//             where,
//             offset: (page - 1) * limit,
//             limit,
//             order: [['urgency', 'DESC'], ['doer', 'ASC']]
//         });

//         res.json({
//             data: rows,
//             total: count,
//             totalPages: Math.ceil(count / limit)
//         });
//     }
//     catch (error) {
//         console.error('Task error:', error);
//         res.status(500).json({ error: 'Failed to fetch Task records' });
//     }
// }



