import { OFFICE_LOCATIONS } from '../../config/attendance/officeLocations.js';

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance between two lat/lng points, in metres.
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Number(null) === 0 and Number('') === 0, which would silently turn a
// MISSING coordinate into the real-looking point (0, 0). Only genuine
// numbers, or non-empty numeric strings (DB DECIMALs arrive as strings),
// are accepted; everything else becomes NaN and is rejected.
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

export function isValidCoordinate(lat, lng) {
  const latN = toNumber(lat);
  const lngN = toNumber(lng);
  return Number.isFinite(latN) && Number.isFinite(lngN) &&
    latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180;
}

/**
 * Where is this reading relative to the offices?
 *
 * Deliberately ignores GPS accuracy and the employee's own assigned
 * office, per your decisions: classification is by raw distance only
 * (the accuracy figure is stored and shown separately so a reviewer can
 * judge trust), and an EPO employee at the MM building correctly shows
 * as MM.
 *
 * If the radius is ever set large enough for two office circles to
 * overlap (they are ~1,974 m apart, so this needs a radius near 1 km),
 * the NEARER office wins.
 *
 * @returns {{ offsite, officeCode, officeLabel, nearestOfficeCode, distanceMeters }}
 */
export function classifyLocation(lat, lng, radiusMeters) {
  const latN = toNumber(lat);
  const lngN = toNumber(lng);
  const radiusN = toNumber(radiusMeters);

  if (!isValidCoordinate(latN, lngN)) throw new Error('Invalid coordinates.');
  if (!Number.isFinite(radiusN) || radiusN <= 0) {
    throw new Error('Radius must be a positive number of metres.');
  }

  let nearest = null;
  for (const office of Object.values(OFFICE_LOCATIONS)) {
    const distance = haversineMeters(latN, lngN, office.lat, office.lng);
    if (!nearest || distance < nearest.distance) nearest = { office, distance };
  }

  const withinRange = nearest.distance <= radiusN;
  return {
    offsite: !withinRange,
    officeCode: withinRange ? nearest.office.code : null,
    officeLabel: withinRange ? nearest.office.label : null,
    nearestOfficeCode: nearest.office.code,
    distanceMeters: Math.round(nearest.distance),
  };
}