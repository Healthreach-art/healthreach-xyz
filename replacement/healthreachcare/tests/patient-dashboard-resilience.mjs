import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patientGreetingName } from '../lib/patient-greeting.mjs';

assert.equal(patientGreetingName('Hlawulekani Malungane'), 'Hlawulekani');
assert.equal(patientGreetingName('  Amahle  Ndlovu '), 'Amahle');
assert.equal(patientGreetingName(''), 'there');
assert.equal(patientGreetingName(null), 'there');
assert.equal(patientGreetingName(undefined), 'there');

const dashboardRoute = await readFile(new URL('../app/dashboard/[...path]/error.tsx', import.meta.url), 'utf8');
const dashboardApp = await readFile(new URL('../app/page.jsx', import.meta.url), 'utf8');
const firebaseWorkspace = await readFile(new URL('../lib/firebase-workspace.mjs', import.meta.url), 'utf8');
const demoWorkspace = await readFile(new URL('../app/api/workspace/route.js', import.meta.url), 'utf8');
assert.match(dashboardRoute, /We couldn’t open your dashboard/);
assert.match(dashboardRoute, /Try again/);
assert.match(dashboardApp, /const profile=s\?\.profile\|\|/);
assert.match(firebaseWorkspace, /s\.profiles\?\.\[identity\.uid\]\|\|\{\}/);
assert.match(demoWorkspace, /s\.profiles\?\.\[session\.accountId\]\|\|/);
console.log('Patient dashboard resilience checks passed: missing profile names and profile records fall back safely, and dashboard render failures show recovery actions.');
