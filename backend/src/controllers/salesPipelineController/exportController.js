import db from '../../models/index.js';
import { Op } from 'sequelize';

export async function exportLeads(req, res){
    try{
        const { from, to } = req.query;
        if(!from || !to ){
            return res.status(400).send('from and to required');
        }

        console.log("from: ", from);
        console.log("to: ", to);

        const fromDate = new Date(from);
        const toDate = new Date(to);

        const leads = await db.Lead.findAll({
            where: {
                createdAt: {
                    [Op.between]: [fromDate, toDate],
                },
            },
            order: [['createdAt', 'DESC']],
        });

        return res.status(200).json(leads);
    }
    catch(err){
        console.error(err);
        return res.status(500).send('Server error');
    }
};