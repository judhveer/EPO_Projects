// Asks the browser for the device's CURRENT position. Used for both
// check-in and check-out; the app refuses to continue without it.
//
// maximumAge: 0 forces a FRESH reading every time. Without it a browser
// may hand back a cached position from earlier, from somewhere else.
// enableHighAccuracy asks for the real GPS chip rather than the coarser
// Wi-Fi/cell estimate; the trade-off is a couple of extra seconds.
export function getCurrentLocation({ timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('Geolocation unsupported'), { kind: 'UNSUPPORTED' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => {
        const kind = { 1: 'DENIED', 2: 'UNAVAILABLE', 3: 'TIMEOUT' }[err?.code] || 'UNKNOWN';
        reject(Object.assign(new Error(err?.message || kind), { kind }));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
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