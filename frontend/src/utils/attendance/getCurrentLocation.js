const ACCURACY_THRESHOLD_M = 800;
const MAX_ATTEMPTS = 3; // 1 initial + up to 2 retries
const RETRY_DELAY_MS = 2000;

function getSinglePosition(timeoutMs) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('Geolocation unsupported'), { kind: 'UNSUPPORTED' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        const kind = { 1: 'DENIED', 2: 'UNAVAILABLE', 3: 'TIMEOUT' }[err?.code] || 'UNKNOWN';
        reject(Object.assign(new Error(err?.message || kind), { kind }));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/**
 * Up to 3 attempts, ~2s apart, keeping whichever single reading across
 * all attempts has the SMALLEST accuracy value (tightest, most
 * trustworthy). Stops early the moment a reading is <= 800m.
 *
 * A browser cannot be told "GPS only, never network/Wi-Fi" — the W3C
 * spec is explicit that it's source-agnostic and gives no such
 * guarantee, and enableHighAccuracy is only ever a hint. This retry
 * loop is the practical substitute: a real GPS fix typically tightens
 * on a second attempt as satellites lock in, while a network fallback
 * usually reports a similarly poor number every time, so filtering on
 * "did it actually improve" is the best available proxy.
 *
 * Never blocks on a reading that stays poor — soft enforcement, same
 * as the rest of this feature — the best reading obtained is still
 * returned and saved honestly, even if it never got under 800m.
 *
 * DENIED / UNSUPPORTED fail immediately, no retry: a permission block
 * won't change between attempts, so retrying would only waste time
 * before the employee ever sees the real "please allow location"
 * message.
 */
export async function getCurrentLocation({ timeoutMs = 15000, onRetry } = {}) {
  let best = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const reading = await getSinglePosition(timeoutMs);
      if (!best || reading.accuracy < best.accuracy) best = reading;
      if (reading.accuracy <= ACCURACY_THRESHOLD_M) return best;
    } catch (err) {
      if (err.kind === 'DENIED' || err.kind === 'UNSUPPORTED') throw err;
      lastError = err;
    }
    if (attempt < MAX_ATTEMPTS) {
      onRetry?.(attempt);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  if (best) return best;
  throw lastError || Object.assign(new Error('Could not get location'), { kind: 'UNKNOWN' });
}

// Short, plain wording on purpose: some of the people reading these
// cannot read long or technical messages easily.
export const LOCATION_ERROR_MESSAGES = {
  UNSUPPORTED: '📍 This phone or browser cannot share location. Please use another phone or ask HR for help.',
  DENIED: '📍 Location is OFF for this website. Tap the lock icon near the address bar, choose Location, then Allow. Then press the button again.',
  UNAVAILABLE: '📍 Your location could not be found. Please go near a window or outside, then try again.',
  TIMEOUT: '📍 Finding your location took too long. Please try again.',
  UNKNOWN: '📍 Could not get your location. Please try again.',
};