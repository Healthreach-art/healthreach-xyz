// Existing isolated demo personas. These are workspace IDs, never email/password credentials.
export const demoAccounts = [{ id: 'patient-thandi', role: 'Patient', name: 'Thandi Mokoena' }, { id: 'patient-sipho', role: 'Patient', name: 'Sipho Demo' }, { id: 'pharmacy', role: 'Pharmacy', name: 'Demo Pharmacist', pharmacyId: 'pharmacy' }, { id: 'doctor', role: 'Doctor', name: 'Dr Sarah Mokoena' }, { id: 'homecare', role: 'Homecare', name: 'Homecare Coordinator' }, { id: 'admin', role: 'Admin', name: 'Demo Administrator' }, { id: 'driver-lee', role: 'Driver', name: 'Lee Demo' }, { id: 'driver-kim', role: 'Driver', name: 'Kim Demo' }];
export function administratorAllowed(user) { return Array.isArray(user?.permissions)&&user.permissions.includes('healthreachcare:admin'); }
export function demoEntries(s, user) { return [...demoAccounts, ...(s.registeredAccounts || [])].map(a => ({ id: a.id, role: a.role, name: a.name, identifier: s.profiles[a.id]?.email || a.email || a.id, available: a.role !== 'Admin' || administratorAllowed(user), reason: a.role === 'Admin' && !administratorAllowed(user) ? 'Existing verified administrator permission is required. No administrator permission is granted by this demo chooser.' : '' })); }
export function safeReturnTo(value) { if (typeof value !== 'string' || !value.startsWith('/dashboard/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return ''; try {
    const url = new URL(value, 'https://healthreach.local');
    return url.origin === 'https://healthreach.local' ? url.pathname + url.search : '';
}
catch {
    return '';
} }
export function entryPath(mode = 'login', returnTo = '', demo = '') { const params = new URLSearchParams(); if (safeReturnTo(returnTo))
    params.set('returnTo', safeReturnTo(returnTo)); if (demo)
    params.set('demo', demo); return '/' + (mode === 'signup' ? 'signup' : 'login') + (params.size ? '?' + params : ''); }
