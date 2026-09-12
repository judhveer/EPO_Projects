import models from "../../models/index.js";
import { getCache, setCache, deleteCache, CACHE_KEYS, TTL } from '../../utils/cache.js';
import { ATTENDANCE_SETTINGS_ID } from '../../models/attendanceModels/attendanceSettings.model.js';

const { AttendanceSettings } = models;

// ── Read — cache-first, self-healing ────────────────────────────────
// Never throws due to missing config. If the singleton row somehow
// doesn't exist yet (fresh deploy, migration ran but nothing seeded),
// findOrCreate silently creates it with the model's defaults — the
// system stays usable instead of every attendance calculation
// throwing a 500 because a config row is missing.
export async function getAttendanceSettings(){
    const cached = await getCache(CACHE_KEYS.attendanceSettings);
    if(cached){
        return cached;
    }

    const [settings] = await AttendanceSettings.findOrCreate({
        where: {
            id: ATTENDANCE_SETTINGS_ID,
        },
        defaults: { id: ATTENDANCE_SETTINGS_ID, }
    });

    const plain = settings.toJSON();

    await setCache(CACHE_KEYS.attendanceSettings, plain, TTL.ATTENDANCE_SETTINGS);
    return plain;
}

// ── Write — admin-only, validated, cache invalidated immediately ────
// Bounds are enforced here (not just relying on the model-level
// `validate` rules) so a bad value never even reaches the DB layer,
// and so the error message returned to the admin UI is clear rather
// than a raw Sequelize validation error string.
export async function updateAttendanceSettings(patch, updatedByUserId){
    const allowedFields = [
        'shift_start_hour', 'shift_start_minute',
        'grace_minutes', 'overtime_threshold_minutes',
        'reminder_delay_minutes',
    ];

    const updates = [];

    for (const field of allowedFields){
        if(patch[field] === undefined){
            continue;
        }
        const value = Number(patch[field]);
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`${field} must be a non-negative number`);
        }
        updates[field] = value;
    }

    if(updates.shift_start_hour !== undefined && updates.shift_start_hour > 23){
        throw new Error('shift_start_hour must be between 0 and 23');
    }

    if(updates.shift_start_minute !== undefined && updates.shift_start_minute > 59){
        throw new Error('shift_start_minute must be between 0 and 59');
    }

    if(updates.overtime_threshold_minutes !== undefined && updates.overtime_threshold_minutes < 1){
        throw new Error('overtime_threshold_minutes must be at least 1');
    }

    if(Object.keys(updates).length === 0){
        throw new Error('No valid fields provided to update');
    }

    updates.updated_by = updatedByUserId;

    const [settings] = await AttendanceSettings.findOrCreate({
        where: { id: ATTENDANCE_SETTINGS_ID },
        defaults: { id: ATTENDANCE_SETTINGS_ID },
    });

    await settings.update(updates);

    // Invalidate immediately — never serve a stale threshold after an explicit admin change, even for the few seconds a TTL would allow.
    await deleteCache(CACHE_KEYS.attendanceSettings);

    return settings.toJSON();

}