import { getPendingBillingJobs } from "./billing.service.js";

export async function fetchPendingBilling(req, res) {
  try {
    const jobs = await getPendingBillingJobs();

    return res.json({
      success: true,
      count: jobs.length,
      data: jobs,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch billing data"
    });
  }
}