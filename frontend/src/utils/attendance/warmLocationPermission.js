/**
 * Called once per login (and once per restored session on page load),
 * never touches the backend, never saves anything. Its only job is to
 * get the location permission decided at a calm moment, right after
 * login, instead of the employee's first encounter with it being the
 * time-pressured moment they tap Check In. If permission is already
 * granted, this also warms up the device's GPS so the real check-in
 * later resolves faster.
 *
 * `denied` is deliberately a no-op here — once a browser permission is
 * explicitly blocked, calling getCurrentPosition() again can NEVER
 * bring back the native popup (confirmed: Chrome, and every major
 * browser, permanently suppress it after an explicit deny, only the
 * browser's own site settings can undo that). The already-built
 * check-in/check-out flow already shows the real, actionable "please
 * allow location" message the moment the employee actually tries to
 * act, which is both the most relevant point to show it and needs no
 * extra code here.
 */
export async function warmLocationPermission(user) {
  // Skip BOSS entirely — no attendance exists for that account, so
  // asking for location here would be a confusing prompt with
  // nothing behind it.
  if (!user || user.role === 'BOSS') return;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;

  let state = 'prompt'; // safe default if the Permissions API can't tell us
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      state = status.state;
    }
  } catch {
    // Some browsers don't support querying the 'geolocation' permission
    // specifically — fall through and just attempt the call below,
    // which is still safe either way.
  }

  if (state === 'denied') return;

  // state is 'granted' (silently warms up GPS) or 'prompt' (this call
  // IS what triggers the real native popup, at login rather than at
  // check-in time). Fire-and-forget — the result and any error are
  // discarded, this never writes anywhere.
  navigator.geolocation.getCurrentPosition(
    () => {},
    () => {},
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}