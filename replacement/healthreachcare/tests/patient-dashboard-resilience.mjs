import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patientGreetingName } from '../lib/patient-greeting.mjs';

assert.equal(patientGreetingName('Hlawulekani Malungane'), 'Hlawulekani');
assert.equal(patientGreetingName('  Amahle  Ndlovu '), 'Amahle');
assert.equal(patientGreetingName(''), 'there');
assert.equal(patientGreetingName(null), 'there');
assert.equal(patientGreetingName(undefined), 'there');

const dashboardRoute = await readFile(new URL('../app/dashboard/[...path]/error.tsx', import.meta.url), 'utf8');
assert.match(dashboardRoute, /We couldn’t open your dashboard/);
assert.match(dashboardRoute, /Try again/);
console.log('Patient dashboard resilience checks passed: missing profile names are safe and dashboard render failures show recovery actions.');
