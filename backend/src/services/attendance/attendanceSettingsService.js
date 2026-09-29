import models from '../../models/index.js';
import { getCache, setCache, deleteCache, CACHE_KEYS, TTL } from '../../utils/cache.js';
import { ATTENDANCE_SETTINGS_ID } from '../../models/attendanceModels/attendanceSettings.model.js';
import { writeAuditLog } from './auditLogService.js';

const { AttendanceSettings, sequelize } = models;

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
        'office_radius_meters',
    ];

    const updates = [];

    for (const field of allowedFields){
        if(patch[field] === undefined){
            continue;
        }
        // Number(null) and Number('') are both 0. Without this check, a
        // blank input would silently save as 0 (e.g. a 0-minute grace period).
        if (patch[field] === null || (typeof patch[field] === 'string' && patch[field].trim() === '')) {
            throw new Error(`${field} cannot be blank`);
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

    if (updates.office_radius_meters !== undefined) {
        if (!Number.isInteger(updates.office_radius_meters) || updates.office_radius_meters < 50 || updates.office_radius_meters > 1000) {
            throw new Error('Office radius meters must be a whole number between 50 and 1000');
        }
    }

    if(Object.keys(updates).length === 0){
        throw new Error('No valid fields provided to update');
    }

    // The settings change and its audit entry commit together. This is the control that decides what gets flagged, so a change must never be able to land without its trace.
    const t = await sequelize.transaction();
    let settings;

    try{
        [settings] = await AttendanceSettings.findOrCreate({
        where: { id: ATTENDANCE_SETTINGS_ID },
        defaults: { id: ATTENDANCE_SETTINGS_ID },
        transaction: t,
        });

        // Log only fields whose value actually changed, so pressing Save with nothing edited doesn't create noise.
        const oldValue = {};
        const newValue = {};
        for (const field of Object.keys(updates)) {
            if (settings[field] !== updates[field]) {
                oldValue[field] = settings[field];
                newValue[field] = updates[field];
            }
        }
        await settings.update({ ...updates, updated_by: updatedByUserId }, { transaction: t });
        
        if (Object.keys(newValue).length > 0) {
            await writeAuditLog({
                entityType: 'ATTENDANCE_SETTINGS',
                entityId: ATTENDANCE_SETTINGS_ID,
                action: 'UPDATED',
                performedBy: updatedByUserId,
                oldValue,
                newValue,
                transaction: t,
            });
        }

        await t.commit();
    }catch (err){
        await t.rollback();
        throw err;
    }

    // Invalidate immediately — never serve a stale threshold after an explicit admin change, even for the few seconds a TTL would allow.
    await deleteCache(CACHE_KEYS.attendanceSettings);

    return settings.toJSON();

}

