import models from "../../models/index.js"
import { Op } from "sequelize";
const { StageTracking } = models;

/**
 * Advances a job to the next stage and closes the previous one.
 * @param {object} options
 * @param {number} options.job_no - The job number.
 * @param {string} options.new_stage - The new stage name.
 * @param {string} options.performed_by_id - The user performing the action.
 * @param {string} [options.remarks] - Optional remarks.
 * @param {object} [options.transaction] - Optional Sequelize transaction.
 */
export const advanceStage = async ({
  job_no,
  new_stage,
  performed_by_id,
  remarks = "",
  transaction,
}) => {
  try {
    // 1️⃣ Close the previous active stage (if exists)
    const prevStage = await StageTracking.findOne({
      where: {
        job_no,
        ended_at: { [Op.is]: null }, // find stage not yet ended
      },
      order: [["started_at", "DESC"]],
      transaction,
    });

    if (prevStage) {
      const ended_at = new Date();
      const duration_minutes = Math.floor(
        (ended_at - prevStage.started_at) / 60000
      );

      await prevStage.update(
        {
          ended_at,
          duration_minutes,
        },
        { transaction }
      );
    }

    // 2️⃣ Create a new stage entry
    await StageTracking.create(
      {
        job_no,
        stage_name: new_stage,
        performed_by_id,
        started_at: new Date(),
        remarks: remarks || `Moved to stage: ${new_stage}`,
      },
      { transaction }
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error in advanceStage:", error);
    return { success: false, error: error.message };
  }
};
