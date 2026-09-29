import { isValidCoordinate } from '../../utils/attendance/geo.js';

const GEOAPIFY_REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse';
const DEFAULT_TIMEOUT_MS = 4000;
const MAX_LABEL_LENGTH = 255; // matches the check_*_location_label column

const fail = (reason) => ({ address: null, reason });

/**
 * Turns coordinates into a human-readable address via Geoapify.
 *
 * NEVER throws. A failed lookup must never block someone's check-in, so
 * every failure comes back as { address: null, reason } and the caller
 * decides what to store. Success is { address: '...', reason: null }.
 */
export async function reverseGeocode(lat, lng, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  // Read at CALL time, not module load: app.js calls dotenv.config()
  // after its imports have already run, so a top-level read of
  // process.env here would see undefined.
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    console.error('[reverseGeocode] GEOAPIFY_API_KEY is not set.');
    return fail('no_api_key');
  }
  if (!isValidCoordinate(lat, lng)) return fail('invalid_coordinates');

  const params = new URLSearchParams({
    lat: String(Number(lat)),
    lon: String(Number(lng)),
    lang: 'en',
    limit: '1',
    apiKey,
  });

  try {
    const res = await fetch(`${GEOAPIFY_REVERSE_URL}?${params}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      // Status only. Never log the URL, it contains the API key.
      console.error(`[reverseGeocode] Geoapify responded with HTTP ${res.status}`);
      return fail(`http_${res.status}`);
    }

    let body;
    try {
      body = await res.json();
    } catch {
      return fail('bad_response');
    }

    const formatted = body?.features?.[0]?.properties?.formatted;
    if (typeof formatted !== 'string' || !formatted.trim()) return fail('no_result');

    return { address: formatted.trim().slice(0, MAX_LABEL_LENGTH), reason: null };
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    // Error name and low-level code only (e.g. ENOTFOUND). Never the
    // message or URL, in case either ever embeds the key.
    console.error(`[reverseGeocode] ${timedOut ? 'Timed out' : 'Request failed'} (${err?.name}${err?.cause?.code ? ' / ' + err.cause.code : ''})`);
    return fail(timedOut ? 'timeout' : 'network_error');
  }
}