// Checks both FK columns that reference a WideFormatMaterial row.
// Unlike PaperMaster, WideFormatMaterial has no JSON column references —
// only real FK columns — so standard COUNT queries are sufficient.

import db from "../../models/index.js";
/**
 * @returns {string|null} A blocker message, or null if safe to delete.
 */

export async function getWideFormatDeletionBlockers(materialId, transaction){
    const id = Number(materialId);

    const [jobItemCount, costingCount] = await Promise.all([
        db.JobItem.count({
            where:{
                selected_wide_material_id: id
            },
            transaction,
        }),
        db.JobItemCosting.count({
            where: {
                wf_material_id: id,
            },
            transaction,
        }),
    ]);

    const total = jobItemCount + costingCount;
    if(total === 0) return null;

    const blocker = [];
    if(jobItemCount > 0){
        blockers.push(`${jobItemCount} job item reference${jobItemCount === 1 ? "" : "s"}`);
    }
    if(costingCount > 0){
        blockers.push(`${costingCount} job costing reference${costingCount === 1 ? "" : "s"}`);
    }

    return `Cannot delete: this material is linked to ${blockers.join(" and ")}. Historical jobs depend on it.`;
}