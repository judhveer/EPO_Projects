import { createHoliday, listHolidays, deactivateHoliday } from '../../services/attendance/holidayService.js';

function isApprover(user) {
  return user.role === 'BOSS' || user.role === 'ADMIN' || user.department === 'HR';
}
function sendError(res, err) {
  console.error('[holiday.controller]', err);
  res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Something went wrong.' });
}

export async function getHolidays(req, res) {
  try {
    const { year, all } = req.query;
    const holidays = await listHolidays({ activeOnly: all !== 'true', year: year ? Number(year) : null });
    res.json(holidays);
  } catch (err) { sendError(res, err); }
}

export async function postHoliday(req, res) {
  try {
    if (!isApprover(req.user)) {
      return res.status(403).json({ error: 'Only BOSS, ADMIN, or HR may create holidays.' });
    }
    const { name, date, holiday_type, notes, applicability } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'name and date are required.' });

    const result = await createHoliday({
      name, date, holidayType: holiday_type, notes, applicability, createdBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) { sendError(res, err); }
}

export async function patchDeactivateHoliday(req, res) {
  try {
    if (!isApprover(req.user)) {
      return res.status(403).json({
        error: 'Only BOSS, ADMIN, or HR may deactivate holidays.'
      });
    }
    const holiday = await deactivateHoliday(req.params.id, req.user.id); 
    res.json(holiday);
  } catch (err) { sendError(res, err); }
}