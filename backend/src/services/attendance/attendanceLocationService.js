import { classifyLocation, isValidCoordinate } from '../../utils/attendance/geo.js';
import { reverseGeocode } from './reverseGeocodeService.js';

// Mirrors the default of AttendanceSettings.office_radius_meters. Used
// ONLY if the settings object handed in has no usable radius (e.g. a
// stale cached copy from before that column existed), so a config
// hiccup can never make every check-in fail.
const DEFAULT_OFFICE_RADIUS_METERS = 300;

export const OFFSITE_FALLBACK_LABEL = 'Off-site (address unavailable)';

const MAX_ACCURACY_M = 999999.99; // ceiling of the DECIMAL(8,2) column

function locationError(message, code) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Validates and normalises the location a client sent with a check-in
 * or check-out. Throws a 400 (with a machine-readable `code`) if it is
 * missing or malformed. This is the server-side enforcement of
 * "location is mandatory", so it cannot be bypassed by skipping the UI.
 *
 * @param {object} body    req.body, expects { lat, lng, accuracy? }
 * @param {string} action  'check in' | 'check out', used in the message
 */
export function parseLocationInput(body, action) {
  const { lat, lng, accuracy } = body || {};

  if (isBlank(lat) || isBlank(lng)) {
    throw locationError(
      `Location is required to ${action}. Please allow location access and try again.`,
      'LOCATION_REQUIRED',
    );
  }
  if (!isValidCoordinate(lat, lng)) {
    throw locationError('The location sent was not valid. Please try again.', 'LOCATION_INVALID');
  }

  let accuracyM = null;
  if (!isBlank(accuracy)) {
    const numeric = typeof accuracy === 'number' || typeof accuracy === 'string' ? Number(accuracy) : NaN;
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw locationError('The location accuracy sent was not valid. Please try again.', 'LOCATION_INVALID');
    }
    accuracyM = Math.round(Math.min(numeric, MAX_ACCURACY_M) * 100) / 100;
  }

  // 7 decimals matches the DECIMAL(10,7) column (about 1 cm).
  const round7 = (n) => Math.round(Number(n) * 1e7) / 1e7;
  return { lat: round7(lat), lng: round7(lng), accuracy: accuracyM };
}

/**
 * Builds the Attendance columns for one location capture.
 *
 * On-site  -> office label, NO external call (spends no Geoapify credit).
 * Off-site -> reverse-geocoded address, or a fallback label if the
 *             lookup fails. A failed lookup never blocks the check-in.
 *
 * Classification uses raw distance only; the employee's own assigned
 * office is deliberately not consulted (an EPO worker at MM shows MM).
 *
 * @param {'check_in'|'check_out'} prefix
 */
export async function buildLocationFields(prefix, location, settings) {
  const configured = Number(settings?.office_radius_meters);
  const radius = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OFFICE_RADIUS_METERS;
  if (radius !== configured) {
    console.warn(`[attendanceLocation] office_radius_meters missing/invalid in settings, using default ${DEFAULT_OFFICE_RADIUS_METERS}.`);
  }

  const result = classifyLocation(location.lat, location.lng, radius);

  let label;
  if (!result.offsite) {
    label = result.officeLabel;
  } else {
    const { address } = await reverseGeocode(location.lat, location.lng);
    label = address || OFFSITE_FALLBACK_LABEL;
  }

  return {
    [`${prefix}_lat`]: location.lat,
    [`${prefix}_lng`]: location.lng,
    [`${prefix}_accuracy_m`]: location.accuracy,
    [`${prefix}_location_label`]: label,
    [`${prefix}_offsite`]: result.offsite,
  };
}