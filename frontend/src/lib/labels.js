export function labelForStatus(code = '') {
  switch (String(code).toUpperCase()) {
    case 'CRM_FOLLOW_UP': return 'CRM follow-up';
    case 'RESCHEDULE_MEETING': return 'Reschedule meeting';
    case 'APPROVE': return 'Approve';
    case 'REJECT': return 'Reject';
    case 'HOLD': return 'Hold';
    default: return code || '-';
  }
}
