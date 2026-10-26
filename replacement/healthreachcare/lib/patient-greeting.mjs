export function patientGreetingName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.split(/\s+/)[0] || 'there';
}
