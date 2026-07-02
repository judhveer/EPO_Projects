// Determines whether a user can be safely hard-deleted. A user is only
// deletable when they have zero rows across every table that references
// User.id — this is what makes hard delete safe: it's structurally
// impossible to delete anyone who has done real work in the system.
//
// NOTE: JobCard.assigned_designer / order_handled_by / order_received_by /
// delivery_persons_name are plain text snapshots of a username, not real
// FKs to User.id — they're intentionally NOT checked here, since deleting
// the user doesn't break them (the historical text stays valid forever).
//
// PushSubscription is also intentionally not checked — it's just a browser
// push token with no historical value, safe to leave behind either way.

import { Op } from "sequelize";
import db from "../../models/index.js";

/**
 * @returns {string|null} A human-readable blocker message, or null if the
 *                         user is safe to delete.
 */

export async function getDeletionBlockers(userId, transaction){
    const [activityCount, stageWorkCount, deliveryCount, billsCount, designAssignCount] = 
        await Promise.all([
            db.ActivityLog.count({ where: { performed_by_id: userId }, transaction }),
            db.JobProductionStageWorker.count({ where: { worker_id: userId }, transaction }),
            db.DeliveryAssignment.count({ where: { worker_id: userId }, transaction }),
            db.JobCard.count({ where: { bill_created_by_id: userId }, transaction }),
            db.JobAssignment.count({
                where: { [Op.or]: [{ designer_id: userId }, { assigned_by_id: userId }] },
                transaction,
            }),
        ]);

    const blockers = [];
    if (activityCount > 0) {
        blockers.push(`${activityCount} activity log entr${activityCount === 1 ? "y" : "ies"}`);
    }
    if (stageWorkCount > 0) {
        blockers.push(`${stageWorkCount} production stage assignment${stageWorkCount === 1 ? "" : "s"}`);
    }
    if (deliveryCount > 0) {
        blockers.push(`${deliveryCount} delivery assignment${deliveryCount === 1 ? "" : "s"}`);
    }
    if (billsCount > 0) {
        blockers.push(`${billsCount} bill${billsCount === 1 ? "" : "s"} created`);
    }
    if (designAssignCount > 0) {
        blockers.push(`${designAssignCount} design assignment${designAssignCount === 1 ? "" : "s"}`);
    }

    if (blockers.length === 0) return null;

    return `Cannot delete: this user has ${blockers.join(", ")}. Deactivate the account instead.`;
}