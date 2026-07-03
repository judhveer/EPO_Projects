// Checks all six FK columns across JobItem and JobItemCosting that
// reference a PaperMaster row. If any reference exists, the row cannot
// be hard-deleted — historical job items must keep their FK.
//
// NOTE: inside_papers (JobItem) and ms_inside_costing (JobItemCosting)
// are JSON columns — they store paper_id values but are NOT FK-constrained.
// We check them with a JSON_CONTAINS query so a paper used only in
// Multiple Sheet inside papers is still treated as referenced.

import db from "../../models/index.js";

export async function getPaperDeletionBlockers(paperId, transaction) {
    const id = Number(paperId);

    // FK-constrained columns — standard COUNT
    const [jobItemSS, jobItemCover, costingSS, costingCover] = await Promise.all([
        db.JobItem.count({ where: { selected_paper_id: id }, transaction }),
        db.JobItem.count({ where: { selected_cover_paper_id: id }, transaction }),
        db.JobItemCosting.count({ where: { ss_paper_id: id }, transaction }),
        db.JobItemCosting.count({ where: { ms_cover_paper_id: id }, transaction }),
    ]);

    // JSON columns — need raw SQL since Sequelize can't do JSON_CONTAINS natively
    const [jobItemInsideResult] = await db.sequelize.query(
        `SELECT COUNT(*) AS cnt
        FROM jobfms_job_items
        WHERE JSON_CONTAINS(inside_papers, JSON_OBJECT('selected_paper_id', :id))`,
        { replacements: { id }, transaction, type: db.sequelize.QueryTypes.SELECT }
    );

    const [costingInsideResult] = await db.sequelize.query(
        `SELECT COUNT(*) AS cnt
        FROM jobfms_job_item_costings
        WHERE JSON_CONTAINS(ms_inside_costing, JSON_OBJECT('paper_id', :id))`,
        { replacements: { id }, transaction, type: db.sequelize.QueryTypes.SELECT }
    );

    const jobItemInside  = Number(jobItemInsideResult?.cnt  || 0);
    const costingInside  = Number(costingInsideResult?.cnt  || 0);

    const total = jobItemSS + jobItemCover + costingSS + costingCover + jobItemInside + costingInside;

    if (total === 0) return null;

    const blockers = [];
    if (jobItemSS + jobItemInside + jobItemCover > 0)
        blockers.push(`${jobItemSS + jobItemInside + jobItemCover} job item reference(s)`);
    if (costingSS + costingCover + costingInside > 0)
        blockers.push(`${costingSS + costingCover + costingInside} job costing reference(s)`);

    return `Cannot delete: this paper is linked to ${blockers.join(" and ")}. It cannot be removed because historical jobs depend on it.`;
    
}