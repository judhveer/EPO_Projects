import { getAttendanceSettings, updateAttendanceSettings } from '../../services/attendance/attendanceSettingsService.js';
import { runLeaveAllocationJob } from '../../services/attendance/leaveAllocationJob.js';
import { runAttendanceResolutionJob } from '../../services/attendance/attendanceResolutionJob.js';

function isAdmin(user) {
  return user.role === 'BOSS' || user.role === 'ADMIN';
}


export async function getSettings(req, res) {
  try {
    res.json(await getAttendanceSettings());
  } catch (err) {
    console.error('[attendanceSettings.controller]', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
}

export async function patchSettings(req, res) {
  try {
    const isApprover = req.user.role === 'BOSS' || req.user.role === 'ADMIN' || req.user.department === 'HR';
    if (!isApprover) {
      return res.status(403).json({ 
        error: 'Only BOSS, ADMIN, or HR may change attendance settings.' 
      });
    }
    const settings = await updateAttendanceSettings(req.body, req.user.id);
    res.json(settings);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message || 'Failed to update settings.' });
  }
}

export async function postRunLeaveAllocation(req, res) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only BOSS or ADMIN may manually trigger this job.' });
  }
  try {
    const results = await runLeaveAllocationJob();
    return res.json(results);
  } catch (err) {
    console.error('[postRunLeaveAllocation]', err);
    return res.status(500).json({ error: 'Job run failed — check server logs.' });
  }
}

export async function postRunAttendanceResolution(req, res) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only BOSS or ADMIN may manually trigger this job.' });
  }
  try {
    const results = await runAttendanceResolutionJob();
    return res.json(results);
  } catch (err) {
    console.error('[postRunAttendanceResolution]', err);
    return res.status(500).json({ error: 'Job run failed — check server logs.' });
  }
}