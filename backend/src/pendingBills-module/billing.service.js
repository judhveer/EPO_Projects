import { getBillingSheetData } from "./googleAuth.js";

export async function getPendingBillingJobs() {
  const rows = await getBillingSheetData();

  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(h => h.toLowerCase());

  const jobNoIndex = headers.indexOf("job no");
  const clientIndex = headers.indexOf("client name");
  const createdIndex = headers.indexOf("job card created on");
  const deliveryIndex = headers.indexOf("delivery date");
  const billIndex = headers.indexOf("bill made");
  const paymentIndex = headers.indexOf("payment status");

  const pendingJobs = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const bill = (row[billIndex] || "").toLowerCase();
    const payment = (row[paymentIndex] || "").toLowerCase();

    const isPaid =
      bill.includes("yes") ||
      payment.includes("paid");

    if (!isPaid) {
      pendingJobs.push({
        job_no: row[jobNoIndex],
        job_created_on: row[createdIndex],
        client_name: row[clientIndex],
        delivery_date: row[deliveryIndex],
      });
    }
  }

  return pendingJobs;
}
