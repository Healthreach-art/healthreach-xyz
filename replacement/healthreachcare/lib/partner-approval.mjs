// Pharmacy and Driver accounts have one operational gate: administrator approval.
// Stock, opening hours and a driver's online toggle remain ordinary work controls.
const approvalOnlyRoles = new Set(['Pharmacy', 'Driver']);

export function postApprovalSetupRequired(role, status) {
  return !(approvalOnlyRoles.has(role) && status === 'Approved');
}
