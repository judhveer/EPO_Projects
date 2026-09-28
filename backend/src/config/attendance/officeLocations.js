// Physical office locations. These are facts about the buildings, not business rules, so they live in code rather than in the Config tab.
// The matching RADIUS is different — it needs tuning against real GPS accuracy — so it lives in AttendanceSettings (Step 3).

// `label` is what gets stored on an attendance row when someone checks in within range. It's written to the row at check-in time, so editing the wording here later only affects FUTURE rows; old rows keep the text they were saved with.
// Keep the keys in sync with OFFICES in User.model.js — if a third office is ever added, it needs an entry in both places.
export const OFFICE_LOCATIONS = {
  EPO: { code: 'EPO', label: 'EPO Office', lat: 25.5738537, lng: 91.8831907 },
  MM:  { code: 'MM',  label: 'MM Office',  lat: 25.5818418, lng: 91.9007659 },
};