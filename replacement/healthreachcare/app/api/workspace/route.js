import {canAccessCompanyCare} from '../../../lib/company-homecare.mjs';
import {projectHomecareCatalogue} from '../../../lib/homecare-catalogue.mjs';
import {firebaseWorkspaceGET,firebaseWorkspacePOST} from '../../../lib/firebase-workspace.mjs';
import {maintainAccountWorkspace,publicAccountWorkspace,handleAccountWorkspace} from '../../../lib/account-workspace.mjs';
import {maintainDoctorOperations,publicDoctorOperations,handleDoctorOperations} from '../../../lib/doctor-operations.mjs';
import {maintainPatientExperience,publicPatientExperience,handlePatientExperience,routineStatuses,validateTransactionAddress,ticketAllowed} from '../../../lib/patient-experience.mjs';
import {maintainExperience,publicExperience,handleExperience,enforceExecutionBoundary} from '../../../lib/experience.mjs';
import {demoAccounts,demoEntries,administratorAllowed} from '../../../lib/demo-access.mjs';
import {prepareMatch,maintainMatching,handleMatching,careBookingPrice} from '../../../lib/matching.mjs';
import {upgradeMarket,maintainMarket,publicMarket,handleMarket,marketAvailable} from '../../../lib/marketplace.mjs';
import { upgradeBusiness, maintainBusiness, publicBusiness, handleBusiness, requireLegal, applicationEligible, offerEligible } from '../../../lib/business.mjs';
import { upgradeCompletion, publicCompletion, handleCompletion, validateSlot } from '../../../lib/completion.mjs';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
const pharmacyRecord = (r) => ['Order', 'Prescription'].includes(r.type);
const terminal = (r) => ['Delivered', 'Collected', 'Completed', 'Cancelled', 'Declined', 'Rejected'].includes(r.status);
const round = (n) => Math.round(n * 100) / 100;
export function initial() { return { workflowVersion: 3, version: 0, profile: { name: 'Thandi Mokoena', address: '123 Demo Street, Cape Town', email: 'thandi@example.test', preferences: true }, products: [{ id: 'med1', name: 'Paracetamol 500mg', description: '20 tablets · Demo product', category: 'Pain relief', price: 45, stock: 40, active: true, requiresPrescription: false, image: '' }, { id: 'med2', name: 'Vitamin C 1000mg', description: '30 tablets · Demo product', category: 'Vitamins', price: 85, stock: 25, active: true, requiresPrescription: false, image: '' }, { id: 'med3', name: 'Daily care cream', description: '100 ml · Demo product', category: 'Skin care', price: 65, stock: 18, active: true, requiresPrescription: false, image: '' }], providers: [{ id: 'pharmacy', name: 'HealthPlus Pharmacy', type: 'Pharmacy', status: 'Approved', fee: 40, collection: true }, { id: 'doctor', name: 'Dr Sarah Mokoena', type: 'Doctor', status: 'Approved', fee: 450, speciality: 'General practitioner', slots: ['09:00', '10:00', '11:30', '14:00'] }, { id: 'homecare', name: 'HealthReach Homecare', type: 'Homecare', status: 'Approved', fee: 250, services:[{id:'personal',name:'Personal care',description:'Fictional daily-care service',rate:250},{id:'elderly',name:'Elderly care',description:'Fictional companionship service',rate:250},{id:'mobility',name:'Mobility assistance',description:'Fictional mobility assistance',rate:250},{id:'recovery',name:'Post-surgery care',description:'Fictional recovery support',rate:250}] }], checkouts: [], deliveryTasks: [], records: [], payments: [], notifications: [], audit: [], tickets: [], legacyAudit: [] }; }
// Versioned, idempotent data upgrade. Old events remain archived, never treated as approvals/payments.
function migrateHomecarePricing(s, at) {
    s.legacyAudit ??= [];
    let changed = false;
    for (const r of s.records.filter(r => r.type === 'Homecare' && (r.pricingMode === 'quotation' || r.homecareQuote || r.quoteHistory?.length || /quot/i.test(r.status)))) {
        const historic = (r.history || []).filter(h => /quot/i.test((h.status || '') + ' ' + (h.note || '')));
        s.legacyAudit.push({ recordId: r.id, at, kind: 'Archived homecare pricing workflow', data: { pricingMode: r.pricingMode, quote: r.quote, homecareQuote: r.homecareQuote, quoteHistory: r.quoteHistory, quoteRequestKey: r.quoteRequestKey, history: historic } });
        r.history = (r.history || []).filter(h => !/quot/i.test((h.status || '') + ' ' + (h.note || '')));
        const unpaid = r.payment !== 'Paid' && !terminal(r);
        if (unpaid) {
            r.status = 'Booking review required';
            r.total = null;
            delete r.priceSnapshot;
            delete r.holdExpires;
            r.reservationActive = false;
            r.updated = at;
            r.history.push({ status: 'Booking review required', note: 'Previous price workflow archived. Review current published provider pricing before payment; no payment or approval was created.', at, actor: 'System', role: 'System' });
        }
        delete r.pricingMode;
        delete r.quote;
        delete r.homecareQuote;
        delete r.quoteHistory;
        delete r.quoteRequestKey;
        changed = true;
    }
    if (changed) {
        s.notifications = (s.notifications || []).filter(n => !s.records.some(r => r.type === 'Homecare' && r.id === n.recordId && /quot/i.test((n.title || '') + ' ' + (n.message || ''))));
        s.audit ??= [];
        s.audit.unshift({ id: crypto.randomUUID(), action: 'homecare-fixed-price-migration', role: 'System', at });
    }
    return changed;
}
export function migrate(s) {
    if (s.workflowVersion === 3)
        return false;
    const at = new Date().toISOString();
    if (s.workflowVersion === 2) {
        migrateHomecarePricing(s, at);
        s.workflowVersion = 3;
        s.version++;
        return true;
    }
    s.checkouts ??= [];
    s.deliveryTasks ??= [];
    s.legacyAudit ??= [];
    const removed = new Set();
    for (const p of s.products) {
        p.requiresPrescription ??= false;
        p.image ??= '';
    }
    const ph = s.providers.find((p) => p.type === 'Pharmacy');
    if (ph)
        ph.collection ??= true;
    for (const r of s.records.filter(pharmacyRecord)) {
        const historic = (r.history || []).filter((h) => /quot/i.test(h.status + ' ' + h.note));
        if (r.quote || historic.length)
            s.legacyAudit.push({ recordId: r.id, at, kind: 'Archived pharmacy workflow', data: { quote: r.quote, history: historic } });
        delete r.quote;
        r.history = (r.history || []).filter((h) => !/quot/i.test(h.status + ' ' + h.note));
        r.fulfilment ??= 'Delivery';
        r.deliveryFee ??= 40;
        if (r.type === 'Order' && r.payment !== 'Paid' && !terminal(r)) { // This was a pre-payment order, not confirmed work.
            s.legacyAudit.push({ recordId: r.id, at, kind: 'Unconfirmed order moved to checkout', data: structuredClone(r) });
            if (r.items)
                for (const i of r.items) {
                    const m = s.products.find((p) => p.id === i.id);
                    if (m)
                        m.stock += i.quantity;
                }
            s.checkouts.push({ id: r.id, title: 'Medication checkout', items: r.items || [], address: r.address, fulfilment: r.fulfilment, deliveryFee: r.deliveryFee, total: r.total, status: 'Review required', created: r.created, updated: at });
            removed.add(r.id);
        }
        else if (r.type === 'Prescription' && !terminal(r)) {
            s.legacyAudit.push({ recordId: r.id, at, kind: 'Prescription returned to verification', data: structuredClone(r) });
            r.status = 'Under review';
            r.prescriptionApproved = false;
            r.isOrder = false;
            r.verificationRequired = true;
            r.updated = at;
            // Paid historical totals stay untouched; no payment or verification is invented.
            if (r.payment !== 'Paid') {
                delete r.items;
                r.total = 0;
            }
            else
                r.legacyPaidTotal = r.total;
        }
        else if (r.type === 'Order') {
            r.isOrder = true;
            r.stockDebited = true;
            if (/quot/i.test(r.status))
                r.status = 'Order confirmed';
            if (r.status === 'Ready for dispatch' && r.payment === 'Paid' && !s.deliveryTasks.some((t) => t.recordId === r.id))
                s.deliveryTasks.push({ id: crypto.randomUUID(), recordId: r.id, status: 'Ready for assignment', driver: null, address: r.address, created: at });
        }
        else if (r.type === 'Prescription') {
            r.isOrder = r.payment === 'Paid';
            r.prescriptionApproved = false;
        }
    }
    s.audit = s.audit.map((a) => { if (a.role === 'Pharmacy' && /quot/i.test(a.action)) {
        s.legacyAudit.push({ at, kind: 'Archived pharmacy audit event', data: structuredClone(a) });
        return { ...a, action: 'archived-pharmacy-workflow-event' };
    } return a; });
    s.records = s.records.filter((r) => !removed.has(r.id));
    const pharmacyIds = new Set(s.records.filter(pharmacyRecord).map((r) => r.id));
    s.notifications = s.notifications.filter((n) => !removed.has(n.recordId) && !(pharmacyIds.has(n.recordId) && /quot/i.test(n.title + ' ' + n.message)));
    migrateHomecarePricing(s, at);
    s.workflowVersion = 3;
    s.version++;
    s.audit.unshift({ id: crypto.randomUUID(), action: 'pharmacy-direct-checkout-migration', role: 'System', at });
    return true;
}

const allAccounts=s=>[...demoAccounts,...(s.registeredAccounts||[])];
async function tokenHash(token) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)); return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function upgradeSessions(s) { if (s.sessionSchema === 1)
    return false; s.sessionSchema = 1; s.sessions = []; s.conversations = []; s.profiles = { 'patient-thandi': { ...s.profile }, 'patient-sipho': { name: 'Sipho Demo', address: '456 Fictional Avenue, Cape Town', email: 'sipho@example.test', preferences: true } }; for (const r of s.records) {
    r.patientId ??= 'patient-thandi';
    r.patientName ??= s.profile.name;
    r.patientEmail ??= s.profile.email;
} for (const c of s.checkouts)
    c.patientId ??= 'patient-thandi'; for (const t of s.tickets)
    t.patientId ??= 'patient-thandi'; for (const n of s.notifications) {
    n.recipientRole ??= 'Patient';
    n.patientId ??= 'patient-thandi';
} s.version++; return true; }
function upgradeNavigation(s) { if (s.navigationSchema === 1)
    return false; s.navigationSchema = 1; s.drivers = { 'driver-lee': { id: 'driver-lee', name: 'Lee Demo', status: 'Pending Review', online: false, serviceArea: 'Demo service area', documents: 'Not supplied' }, 'driver-kim': { id: 'driver-kim', name: 'Kim Demo', status: 'Pending Review', online: false, serviceArea: 'Demo service area', documents: 'Not supplied' } }; for (const c of s.conversations) {
    c.channel ??= 'pharmacy';
    c.participants ??= [c.patientId, 'pharmacy'];
} s.version++; return true; }
function canAccess(r, session, s) { if(canAccessCompanyCare(s,session,r))return true; if (session.role === 'Admin')
    return true; if (session.role === 'Driver')
    return !!s.deliveryTasks.find((t) => t.recordId === r.id && t.driverId === session.accountId); if (session.role === 'Patient')
    return r.patientId === session.accountId; if (session.role === 'Pharmacy')
    return pharmacyRecord(r) && r.providerId === session.pharmacyId; if (session.role === 'Doctor')
    return r.type === 'Doctor' && r.providerId === session.accountId; if (session.role === 'Homecare')
    return r.type === 'Homecare' && r.providerId === session.accountId; return false; }
async function sessionFor(req, s) { const token = req.headers.get('x-demo-session'); if (!token)
    return null; const hash = await tokenHash(token); return s.sessions.find((x) => x.hash === hash && x.expires > Date.now()) || null; }
export function publicState(s, session) {
    const out = structuredClone(s);
    out.serverTime=Date.now();
    delete out.sessions;
    delete out.legacyAudit;
    delete out.profiles;
    out.records = out.records.filter((r) => canAccess(r, session, s));
    const ids = new Set(out.records.map((r) => r.id));
    out.checkouts = session.role === 'Patient' ? out.checkouts.filter((c) => c.patientId === session.accountId) : [];
    const checkoutIds = new Set(out.checkouts.map((c) => c.id));
    out.payments = out.payments.filter((p) => session.role === 'Admin' || ids.has(p.recordId) || checkoutIds.has(p.checkoutId));
    out.notifications = out.notifications.filter((n) => n.recipientId ? n.recipientId === session.accountId : (n.recipientRole === session.role) && (session.role !== 'Patient' || n.patientId === session.accountId) && (!['Pharmacy','Doctor','Homecare'].includes(session.role)||!n.recordId||ids.has(n.recordId)));
    out.deliveryTasks = out.deliveryTasks.filter((t) => ids.has(t.recordId));
    out.conversations = out.conversations.filter((c) => ids.has(c.recordId) && (session.role === 'Admin' || !c.archived && c.participants?.includes(session.accountId)));
    out.tickets = out.tickets.filter((t) => session.role === 'Admin' || ['Patient', 'Driver'].includes(session.role) && t.patientId === session.accountId || session.role === 'Pharmacy' && ids.has(t.recordId) && (!t.team || t.team === 'Pharmacy'));
    out.audit = session.role === 'Admin' ? out.audit : [];
    out.products = out.products.filter((p) => session.role==='Admin'||session.role==='Pharmacy'&&p.ownerId===session.pharmacyId||session.role!=='Pharmacy'&&p.active&&!p.removed);
    out.profile = session.role === 'Patient' ? s.profiles[session.accountId] : { name: session.name, address: 'Fictional provider workspace', email: session.accountId + '@example.test', preferences: false };
    out.drivers = Object.values(s.drivers).filter((d) => ['Admin', 'Pharmacy'].includes(session.role) || d.id === session.accountId);
    if (session.role === 'Driver') {
        const driver = s.drivers[session.accountId];
        out.driver = driver;
        out.products = [];
        out.payments = [];
        out.records = out.records.map((r) => ({ id: r.id, type: 'Order', title: 'Medication delivery', status: r.status, patientId: r.patientId, patientName: r.patientName, address: r.address, created: r.created, updated: r.updated, history: r.history.map((h) => ({ status: h.status, at: h.at, role: h.role, actor: h.actor })) }));
        out.deliveryTasks = s.deliveryTasks.filter((t) => t.driverId === session.accountId || (driver.status === 'Approved' && driver.online && t.status === 'Ready for assignment' && s.records.some((r) => r.id === t.recordId && r.status === 'Ready for dispatch' && r.payment === 'Paid' && !r.cancellationRequested && r.exception?.status !== 'Open'))).map((t) => t.driverId === session.accountId ? { ...t, patientName: s.records.find((r) => r.id === t.recordId)?.patientName } : { id: t.id, recordId: t.recordId, status: t.status, created: t.created, pickup: s.providers.find(p=>p.id===s.records.find(r=>r.id===t.recordId)?.providerId)?.name||'Pharmacy pickup', destinationArea: (s.records.find(r=>r.id===t.recordId)?.addressDetails?.city||s.dispatchPolicy.serviceArea)+' · full address after assignment', estimate: s.records.find((r) => r.id === t.recordId)?.deliveryFee || 0 });
        out.profile = { ...out.profile, ...driver, email: session.accountId + '@example.test', address: driver.serviceArea };
    }
    out.session = { accountId: session.accountId, role: session.role, name: session.name };
    out.demoAccounts = allAccounts(s).filter(a=>session.role==='Admin'||a.id===session.accountId).map(({id,name,role})=>({id,name,role}));delete out.registeredAccounts;
    return projectHomecareCatalogue(publicAccountWorkspace(publicDoctorOperations(publicPatientExperience(publicExperience(publicMarket(publicBusiness(publicCompletion(out, s, session), s, session),s,session),s,session),s,session),s,session),s,session),s,session,session.role);
}
function fail(message, status = 400) { return Response.json({ error: message }, { status,headers:{'Cache-Control':'no-store'} }); }
async function workspace(uid) { for (let tries = 0; tries < 4; tries++) {
    const row = await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind(uid).first();
    if (!row) {
        await env.DB.prepare('INSERT OR IGNORE INTO workspaces (id,data,updated) VALUES (?,?,?)').bind(uid, JSON.stringify(initial()), new Date().toISOString()).run();
        continue;
    }
    const s = JSON.parse(row.data);
    enforceExecutionBoundary({},s);
    const migrated = migrate(s);
    const upgraded = upgradeSessions(s);
    const navigation = upgradeNavigation(s);
    const complete = upgradeCompletion(s);
    const business = upgradeBusiness(s);
    const market=upgradeMarket(s);
    const maintained = maintainBusiness(s);
    const marketMaintained=maintainMarket(s);
    const matched=maintainMatching(s);
    const experience=maintainExperience(s);
    const patientExperience=maintainPatientExperience(s);
    const doctorOperations=maintainDoctorOperations(s);const accounts=maintainAccountWorkspace(s);
    if (!migrated && !upgraded && !navigation && !complete && !business && !maintained && !market && !marketMaintained && !matched && !experience && !patientExperience && !doctorOperations && !accounts)
        return { s, raw: row.data };
    const raw = JSON.stringify(s);
    const result = await env.DB.prepare('UPDATE workspaces SET data=?,updated=? WHERE id=? AND data=?').bind(raw, new Date().toISOString(), uid, row.data).run();
    if (result.meta.changes)
        return { s, raw };
} throw Error('Workspace is busy. Please refresh.'); }
export async function GET(req) { if(req.headers.get('authorization')?.startsWith('Bearer '))return firebaseWorkspaceGET(req,env,publicState);if(env.HRC_DEMO_ENABLED==='false')return fail('Sign in to HealthReachCare to continue.',401);const u = await getChatGPTUser(); if (!u)
    return fail('Sign in with ChatGPT to open your private demo.', 401); try {
    const { s } = await workspace(u.userId);
    const session = await sessionFor(req, s);
    if (!session)
        return Response.json({ requiresDemoSession: true, demoEntries:demoEntries(s,u) },{headers:{'Cache-Control':'no-store'}});
    if(session.role==='Admin'&&!administratorAllowed(u))return fail('Verified administrator permission is required',403);
    return Response.json(publicState(s, session), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return fail(e.message, 503);
} }
export async function POST(req) {
    if(req.headers.get('authorization')?.startsWith('Bearer '))return firebaseWorkspacePOST(req,env,publicState);
    if(env.HRC_DEMO_ENABLED==='false')return fail('Sign in to HealthReachCare to continue.',401);
    const u = await getChatGPTUser();
    if (!u)
        return fail('Authentication required', 401);
    if (req.headers.get('origin') && new URL(req.headers.get('origin')).host !== new URL(req.url).host)
        return fail('Invalid origin', 403);
    try {
        const { action, payload: p = {}, version } = await req.json();
        if(action!=='endDemoSession')enforceExecutionBoundary(p);
        const { s, raw } = await workspace(u.userId);
        if(action==='endDemoSession'){for(let attempt=0;attempt<4;attempt++){const current=attempt?await workspace(u.userId):{s,raw};const ending=await sessionFor(req,current.s);if(!ending)return Response.json({sessionEnded:true},{headers:{'Cache-Control':'no-store'}});current.s.sessions=current.s.sessions.filter(v=>v.hash!==ending.hash);maintainExperience(current.s);current.s.version++;current.s.audit.unshift({id:crypto.randomUUID(),action:'endDemoSession',actorId:ending.accountId,role:ending.role,at:new Date().toISOString()});const saved=await env.DB.prepare('UPDATE workspaces SET data=?,updated=? WHERE id=? AND data=?').bind(JSON.stringify(current.s),new Date().toISOString(),u.userId,current.raw).run();if(saved.meta.changes)return Response.json({sessionEnded:true},{headers:{'Cache-Control':'no-store'}});}return fail('Sign-out could not be confirmed. Retry secure sign-out.',503);}
        if (action === 'startSession') {
            if(await sessionFor(req,s))return fail('Log out before selecting a different demo account',409);
            const account = allAccounts(s).find(x => x.id === p.accountId);
            if (!account)
                return fail('Choose a provisioned fictional demo account');
            if(account.role==='Admin'&&!administratorAllowed(u))return fail('Verified administrator permission is required; demo entry cannot grant administrator access',403);
            const token = crypto.randomUUID() + crypto.randomUUID();
            const session = { accountId: account.id, role: account.role, name: account.name, pharmacyId: account.pharmacyId, hash: await tokenHash(token), created: new Date().toISOString(), expires: Date.now() + 86400000 };
            s.sessions = s.sessions.filter((x) => x.expires > Date.now()).slice(-99);
            s.sessions.push(session);
            s.version++;
            const saved = await env.DB.prepare('UPDATE workspaces SET data=?,updated=? WHERE id=? AND data=?').bind(JSON.stringify(s), new Date().toISOString(), u.userId, raw).run();
            if (!saved.meta.changes)
                return fail('Session changed. Retry signing into the demo.', 409);
            return Response.json({ ...publicState(s, session), sessionToken: token });
        }
        const session = await sessionFor(req, s);
        if (!session)
            return fail('Choose a demo account to continue.', 401);
        const role = session.role;
        if(role==='Admin'&&!administratorAllowed(u)&&action!=='endDemoSession')return fail('Verified administrator permission is required',403);
        requireLegal(s, session, action,p);
        if(s.accountControls[session.accountId]?.status==='Suspended'&&!['endDemoSession','privacyRequest','supportCase','supportReply','acceptLegal','refresh','read','readNotification'].includes(action))throw Error('This demo account is suspended. Use Support or privacy assistance');
        if(role==='Patient'&&['checkout','prescriptionDraft','request','appointmentAvailability','discoverDoctors','appointmentAlternatives'].includes(action))validateTransactionAddress(p);
        if(['requestHomecareQuote','issueHomecareQuote','acceptHomecareQuote','declineHomecareQuote'].includes(action))return fail('Homecare uses the provider’s published fixed price and direct booking checkout.',410);
        prepareMatch(s,session,action,p);
        if(role==='Patient'&&['prescriptionDraft','submitPrescription','request','checkout','checkoutPay','pay','rescheduleAppointment','rescheduleHomecare','reviewHomecarePrice'].includes(action)){const target=s.records.find(r=>r.id===p.id)?.providerId||s.rxDrafts.find(r=>r.id===p.id)?.providerId||s.checkouts.find(r=>r.id===p.id)?.providerId||p.providerId||p.doctorId||s.products.find(m=>p.items?.some(i=>i.id===m.id))?.ownerId||(p.type==='Doctor'?'doctor':p.type==='Homecare'?'homecare':'pharmacy');if(!applicationEligible(s,target)||!marketAvailable(s,target))throw Error('Provider onboarding or credential renewal is required');}
        if (!applicationEligible(s, session.accountId) && ['product', 'removeProduct', 'pharmacySettings', 'prescriptionReview', 'identityReview', 'transition', 'claimDelivery', 'driverProgress', 'verifyHandoverCode','issueHandoverCode','saveCareNote','uploadProductImage','productImages','rescheduleAppointment','rescheduleHomecare','uploadCareDocument'].includes(action))
            throw Error('Complete provider onboarding or renewal before operational actions');
        if (!['endDemoSession','shareDriverLocation','stopDriverLocation','saveDriverAvailabilityLocation'].includes(action)&&s.version !== version)
            return fail('This workspace changed. Refresh and try again.', 409);
        const now = new Date().toISOString(), id = crypto.randomUUID();
        const completionContext = { s, p, action, session, now, id, userId: u.userId, bucket: env.BUCKET, extra: {}, status: 200 };
        const check = (rs) => { if (!rs.includes(role))
            throw Error('This action is not available in this demo role'); };
        const txt = (x, max = 200) => { if (typeof x !== 'string' || !x.trim() || x.length > max)
            throw Error('Please complete the required fields'); return x.trim(); };
        const num = (x, min = 0, max = 100000) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max)
            throw Error('Invalid amount or quantity'); return x; };
        const provider = (type) => { const providerId=p.providerId||p.doctorId||s.records.find(r=>r.id===p.id)?.providerId||s.checkouts.find(r=>r.id===p.id)?.providerId||(type==='Pharmacy'?s.products.find(m=>p.items?.some(i=>i.id===m.id))?.ownerId:null);const v=s.providers.find(x=>x.type===type&&(!providerId||x.id===providerId)); if (!v || v.status !== 'Approved' || v.acceptingOrders === false || !applicationEligible(s, v.id) || !marketAvailable(s,v.id))
            throw Error(type + ' provider is not available for new requests'); return v; };
        const event = (r, status, note = '') => { r.status = status; r.updated = now; r.history.push({ status, note, at: now, role, actorId: session.accountId, actor: session.name }); if(!routineStatuses.has(status)||/exception|rescheduled|cancellation|rejected/i.test(note))s.notifications.unshift({ id: crypto.randomUUID(), recordId: r.id, title: r.title, message: /exception|rescheduled|cancellation|rejected/i.test(note)?note:status, at: now, read: false, type: pharmacyRecord(r) ? 'Orders' : 'Bookings', recipientRole: 'Patient', patientId: r.patientId }); if (role === 'Patient'&&!(r.type==='Homecare'&&status==='Awaiting payment'))
            s.notifications.unshift({ id: crypto.randomUUID(), recordId: r.id, title: r.title, message: status, at: now, read: false, type: pharmacyRecord(r) ? 'Orders' : 'Bookings', recipientId:r.providerId,recipientRole: pharmacyRecord(r) ? 'Pharmacy' : r.type, patientId: r.patientId }); };
        const conversation = (r) => {if(r.type==='Doctor'&&!['Confirmed','In consultation','Completed'].includes(r.status))throw Error('Appointment messaging opens after booking confirmation');if(session.role==='Admin')throw Error('Use purpose-based conversation review'); if (!canAccess(r, session, s))
            throw Error('Conversation is not available to this account'); if (terminal(r) && role !== 'Admin')
            throw Error('Operational conversation is archived. Open a support case for this completed order'); const channel = p.channel || (pharmacyRecord(r) ? 'pharmacy' : r.type === 'Doctor' ? 'doctor' : 'homecare'); let participants; if (['delivery-patient', 'delivery-pharmacy'].includes(channel)) {
            const task = s.deliveryTasks.find((t) => t.recordId === r.id && t.driverId);
            if (!task)
                throw Error('No assigned driver conversation is available');
            participants = [task.driverId, channel === 'delivery-patient' ? r.patientId : r.providerId];
        }
        else {
            const expected = pharmacyRecord(r) ? 'pharmacy' : r.type === 'Doctor' ? 'doctor' : 'homecare';
            if (channel !== expected)
                throw Error('Conversation does not match this record');
            participants = [r.patientId, r.providerId];
        } if (role !== 'Admin' && !participants.includes(session.accountId))
            throw Error('You are not a participant in this conversation'); let c = s.conversations.find((x) => x.recordId === r.id && x.channel === channel && !x.archived); if (!c) {
            c = { id: channel + ':' + r.id + (channel==='pharmacy'&&r.matching?.attempts?.length?':match'+r.matching.attempts.length+':'+r.providerId:'') + ((channel.startsWith('delivery') && (s.deliveryTasks.find((t) => t.recordId === r.id)?.assignmentVersion || 1) > 1) ? ':v' + s.deliveryTasks.find((t) => t.recordId === r.id).assignmentVersion : ''), channel, recordId: r.id, patientId: r.patientId, patientName: r.patientName, providerId: r.providerId, participants, created: now, updated: now, messages: [] };
            s.conversations.push(c);
        } return c; };
        const message = (r, body, messageId) => { const c = conversation(r); if (c.messages.some((m) => m.id === messageId))
            return; const m = { id: messageId, body: txt(body, 2000), senderId: session.accountId, senderName: session.name, senderRole: role, created: now, readBy: [session.accountId] }; c.messages.push(m); c.updated = now; for (const recipientId of c.participants.filter((x) => x !== session.accountId)) {
            const recipientRole = allAccounts(s).find(a => a.id === recipientId)?.role || 'Patient';
            s.notifications.unshift({ id: crypto.randomUUID(), recordId: r.id, conversationId: c.id, channel: c.channel, title: role + ' message received', message: 'New message for HRC-' + r.id.slice(0, 8), at: now, read: false, type: pharmacyRecord(r) ? 'Orders' : 'Bookings', recipientRole, recipientId, patientId: r.patientId });
        } };
        const fulfilment = (mode) => { const ph = provider('Pharmacy'); if (!['Delivery', 'Collection'].includes(mode))
            throw Error('Choose delivery or collection'); if (mode === 'Collection' && !ph.collection)
            throw Error('Collection is not currently available'); return mode === 'Collection' ? 0 : ph.fee; };
        const items = (input, allowRx = false) => { if (!Array.isArray(input) || !input.length || input.length > 30)
            throw Error('Select at least one product'); const combined = new Map(); for (const i of input) {
            const q = num(i.quantity, 1, 100);
            if (!Number.isInteger(q))
                throw Error('Quantity must be a whole number');
            combined.set(i.id, (combined.get(i.id) || 0) + q);
        } return Array.from(combined).map(([pid, q]) => { const m = s.products.find((x) => x.id === pid && x.active && !x.removed); if (!m || m.stock < q)
            throw Error('Product unavailable or insufficient stock'); if(m.ownerId!==provider('Pharmacy').id)throw Error('Checkout one pharmacy at a time');
                if (m.requiresPrescription && !allowRx)
            throw Error('Prescription approval is required for this product'); return { id: m.id, name: m.name, price: m.price, quantity: q, requiresPrescription: !!m.requiresPrescription }; }); };
        const reserve = (lines) => { for (const i of lines) {
            const m = s.products.find((x) => x.id === i.id && x.active && !x.removed);
            if (!m || m.stock < i.quantity)
                throw Error('Product unavailable or insufficient stock');
            m.stock -= i.quantity;
        } };
        const release = (r) => { if (r.stockDebited && !r.stockReleased && r.items) {
            for (const i of r.items) {
                const m = s.products.find((x) => x.id === i.id);
                if (m)
                    m.stock += i.quantity;
            }
            r.stockReleased = true;
        } };
        const attempt = (ref, amount, scenario, checkoutId) => { if (!['Success', 'Failure', 'Cancel'].includes(scenario))
            throw Error('Choose a payment scenario'); if (scenario === 'Success')
            s.notifications.unshift({ id: crypto.randomUUID(), recordId: ref, title: 'Demo payment recorded', message: 'Simulated payment successful — ' + amount.toFixed(2) + ' ZAR', at: now, read: false, type: 'Orders', recipientRole: 'Patient', patientId: session.accountId }); s.payments.unshift({ id, recordId: ref, checkoutId, amount, simulated:true,environment:'isolated-demo',provider:'internal-simulator',currency:'ZAR',verification:'Simulated outcome; not provider-confirmed', status: scenario === 'Success' ? 'Paid' : scenario === 'Failure' ? 'Failed' : 'Cancelled', at: now, reference: 'DEMO-' + id.slice(0, 8) }); };
        completionContext.provider=provider;
        completionContext.event = event;
        completionContext.conversation=conversation;completionContext.message=message;
        completionContext.check = check;
        completionContext.canAccess = (r) => canAccess(r, session, s);
        if(await handleAccountWorkspace(completionContext)){}
        else if (await handleDoctorOperations(completionContext)) { }
        else if (await handlePatientExperience(completionContext)) { }
        else if (await handleExperience(completionContext)) { }
        else if (handleMatching(completionContext)) { }
        else if (await handleMarket(completionContext)) { }
        else if (await handleBusiness(completionContext)) { }
        else if (await handleCompletion(completionContext)) { }
        else if(action==='reviewHomecarePrice'){check(['Patient']);const r=s.records.find(r=>r.id===p.id&&r.type==='Homecare'&&canAccess(r,session,s));if(!r||r.payment==='Paid'||!['Booking review required','Awaiting payment'].includes(r.status))throw Error('Choose an unpaid active homecare booking');const prov=provider('Homecare');const price=careBookingPrice(s,prov,{service:r.title,serviceId:r.serviceId,date:r.date,time:r.time,duration:r.duration},r.id);r.total=price.total;r.priceSnapshot={...price,confirmedAt:now};r.serviceId=price.serviceId;r.holdExpires=Date.now()+600000;r.reservationActive=true;event(r,'Awaiting payment');}
        else if (action === 'product') {
            check(['Pharmacy']);
            const prod = p.id ? s.products.find((x) => x.id === p.id && x.ownerId===session.pharmacyId && !x.removed) : null;
            if (p.id && !prod)
                throw Error('Product not found');
            const image = typeof p.image === 'string' ? p.image.trim() : '';
            if (image && (image.length > 2000 || !(/^(https:\/\/[^\s]+|\/products\/(tablets|bottle|cream)\.svg)$/.test(image))))
                throw Error('Use a valid HTTPS product image URL');
            const d = { name: txt(p.name, 80), description: txt(p.description, 200), category: txt(p.category, 50), price: round(num(p.price, 1)), stock: num(p.stock, 0, 10000), active: p.active !== false, requiresPrescription: !!p.requiresPrescription, image:prod?.imageIds?.length?'/api/product-image/'+prod.imageIds[0]:image,strength:typeof p.strength==='string'?p.strength.slice(0,80):'',form:typeof p.form==='string'?p.form.slice(0,80):'',packageSize:typeof p.packageSize==='string'?p.packageSize.slice(0,80):'', ownerId: session.pharmacyId, testData: true };
            if (s.products.some((v) => v.id !== prod?.id && v.ownerId===session.pharmacyId && !v.removed && v.name.toLowerCase() === d.name.toLowerCase()))
                throw Error('A product with this name already exists');
            if (!Number.isInteger(d.stock))
                throw Error('Stock must be a whole number');
            if (prod)
                Object.assign(prod, d);
            else
                s.products.push({ id, ...d });
        }
        else if (action === 'removeProduct') {
            check(['Pharmacy']);
            const m = s.products.find((x) => x.id === p.id && x.ownerId===session.pharmacyId && !x.removed);
            if (!m)
                throw Error('Product not found');
            m.removed = true;
            m.active = false;
        }
        else if (action === 'pharmacySettings') {
            check(['Pharmacy']);
            const ph = s.providers.find((x) => x.id === session.pharmacyId);
            if(p.fee!==undefined)throw Error('Only the platform manages delivery charges.');
            ph.collection = !!p.collection;
            if (typeof p.acceptingOrders === 'boolean')
                ph.acceptingOrders = p.acceptingOrders;
            ph.collectionInstructions = txt(p.collectionInstructions || 'Collect at the demo pharmacy counter. Bring your order reference.', 300);
        }
        else if (action === 'checkout') {
            check(['Patient']);
            const fee = fulfilment(p.fulfilment);
            const lines = items(p.items);
            s.checkouts.unshift({ id, title: 'Medication checkout',providerId:provider('Pharmacy').id, matching:p.matching,discountMinor:p.discountMinor||0,promotion:p.promotion, patientId: session.accountId, items: lines, address: txt(p.address), addressDetails: structuredClone(p.addressDetails || (p.address===s.profiles[session.accountId].address?s.profiles[session.accountId].addresses?.find(a=>a.id===s.profiles[session.accountId].selectedAddressId):null) || null), fulfilment: p.fulfilment, deliveryFee: fee, total: round(lines.reduce((a, i) => a + i.price * i.quantity, 0) + fee-(p.discountMinor||0)/100), status: 'Awaiting payment', created: now, updated: now });
        }
        else if (action === 'checkoutPay') {
            check(['Patient']);
            const c = s.checkouts.find((x) => x.id === p.id);
            if (!c || c.patientId !== session.accountId || c.status !== 'Awaiting payment')
                throw Error('Checkout is no longer payable. Review your basket again.');
            if (p.expectedTotal !== c.total)
                throw Error('Review the final total before payment');
            const fee = fulfilment(c.fulfilment);
            const lines = items(c.items);
            if (fee !== c.deliveryFee || JSON.stringify(lines) !== JSON.stringify(c.items))
                throw Error('Product prices or delivery rules changed. Review your basket again before payment.');
            const orderId = crypto.randomUUID();
            attempt(p.scenario === 'Success' ? orderId : '', c.total, p.scenario, c.id);
            if (p.scenario === 'Success') {
                reserve(lines);
                const r = { id: orderId, type: 'Order', patientId: session.accountId, patientName: s.profiles[session.accountId].name, patientEmail: s.profiles[session.accountId].email, providerId: c.providerId||'pharmacy',matching:c.matching?structuredClone(c.matching):undefined,discountMinor:c.discountMinor||0,promotion:c.promotion, title: 'Medication order', address: c.address, addressDetails: c.addressDetails, fulfilment: c.fulfilment, deliveryFee: c.deliveryFee, items: structuredClone(c.items), total: c.total, payment: 'Paid', isOrder: true, stockDebited: true, details: c.items.map((x) => x.name + ' × ' + x.quantity).join(', '), history: [], created: now, updated: now, checkoutId: c.id };
                event(r, 'Order confirmed');
                s.records.unshift(r);
                c.status = 'Paid';
                c.recordId = r.id;
            }
            else if (p.scenario === 'Cancel')
                c.status = 'Cancelled';
        }
        else if (action === 'request') {
            check(['Patient']);
            const type = txt(p.type);
            if (!['Prescription', 'Doctor', 'Homecare'].includes(type))
                throw Error('Use direct checkout for medication orders');
            const prov = provider(type === 'Prescription' ? 'Pharmacy' : type);
            const r = { id, type, patientId: session.accountId, patientName: s.profiles[session.accountId].name, patientEmail: s.profiles[session.accountId].email, providerId: prov.id, title: '', address: txt(p.address), status: '', payment: 'Unpaid', total: 0, details: '', history: [], created: now, updated: now };
            if (type === 'Prescription') {
                throw Error('Create a prescription draft and upload the required fictional documents before submission');
            }
            if (type === 'Doctor') {
                r.date = txt(p.date, 10);
                r.time = txt(p.time, 5);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < now.slice(0, 10) || !prov.slots.includes(r.time))
                    throw Error('Choose an available future slot');
                if (s.records.some((x) => x.type === 'Doctor' && x.date === r.date && x.time === r.time && !['Cancelled', 'Declined'].includes(x.status)))
                    throw Error('That appointment slot is already reserved');
                r.title = 'Appointment with ' + prov.name;
                r.total = prov.fee;
                r.details = r.date + ' at ' + r.time + ' · ' + txt(p.mode, 30);
                event(r, 'Awaiting payment');
            }
            if (type === 'Homecare') {
                const price=careBookingPrice(s,prov,p);r.title=price.serviceName;r.serviceId=price.serviceId;r.date=p.date;r.time=p.time;r.duration=price.duration;r.total=price.total;r.priceSnapshot={...price,confirmedAt:now};r.holdExpires=Date.now()+600000;r.reservationActive=true;
                r.requirements=txt(p.requirements||'No additional requirements supplied',1000);r.details=r.date+' at '+r.time+' · '+r.duration+' hours';r.addressDetails=structuredClone(p.addressDetails||null);
                event(r,'Awaiting payment');completionContext.extra.bookingId=r.id;
            }
            s.records.unshift(r);
        }
        else if (action === 'driverSettings') {
            check(['Driver']);
            const d = s.drivers[session.accountId];
            d.online = !!p.online;
            d.serviceArea = txt(p.serviceArea, 150);
        }
        else if (action === 'driverApproval') {
            check(['Admin']);
            const d = s.drivers[p.driverId];
            if (!d || !['Pending Review', 'Approved', 'Rejected', 'Suspended'].includes(p.status))
                throw Error('Invalid driver status');
            d.review = { at: now, by: session.name, note: txt(p.note, 500), outcome: p.status };
            d.status = p.status;
            s.notifications.unshift({ id, recipientRole: 'Driver', recipientId: d.id, title: 'Application status updated', message: d.status, at: now, read: false, type: 'System' });
        }
        else if (action === 'claimDelivery') {
            check(['Driver']);
            const driver = s.drivers[session.accountId];
            if (driver.status !== 'Approved' || !driver.online)
                throw Error('Only approved, online drivers can accept deliveries');
            const t = s.deliveryTasks.find((t) => t.id === p.taskId);
            const r = s.records.find((r) => r.id === t?.recordId);
            if (!t || !offerEligible(s, t, driver) || t.status !== 'Ready for assignment' || t.driverId || !r || r.status !== 'Ready for dispatch' || r.payment !== 'Paid' || r.fulfilment !== 'Delivery' || r.type === 'Prescription' && (!r.prescriptionApproved || r.requiresDocuments && r.identity?.status !== 'Verified') || r.cancellationRequested || r.exception?.status === 'Open')
                throw Error('Delivery is no longer eligible');
            t.driverId = driver.id;
            t.driver = driver.name;
            t.status = 'Assigned';
            t.history = [{ status: 'Assigned', at: now, actor: driver.name }];
            t.agreedEarnings = t.proposedEarnings ?? r.deliveryFee ?? 0;
            t.demoEarnings = t.agreedEarnings;
            event(r, 'Driver assigned', 'Assigned to ' + driver.name);
            s.notifications.unshift({ id, recordId: r.id, recipientRole: 'Pharmacy', title: 'Driver assigned', message: driver.name, at: now, read: false, type: 'Orders' }, { id: crypto.randomUUID(), recordId: r.id, recipientRole: 'Driver', recipientId: driver.id, title: 'Delivery assigned', message: 'HRC-' + r.id.slice(0, 8), at: now, read: false, type: 'Orders' });
        }
        else if (action === 'driverProgress') {
            check(['Driver']);
            const driver = s.drivers[session.accountId];
            const t = s.deliveryTasks.find((t) => t.id === p.taskId && t.driverId === session.accountId);
            const r = s.records.find((r) => r.id === t?.recordId);
            if (driver.status !== 'Approved' || !t || !r || r.isOrder !== true || r.type === 'Prescription' && (!r.prescriptionApproved || !r.verification || r.requiresDocuments && r.identity?.status !== 'Verified') || t.status === 'Delivery exception' || r.payment !== 'Paid' || ['Cancelled', 'Delivered'].includes(r.status) || r.cancellationRequested || r.exception?.status === 'Open')
                throw Error('Delivery cannot be progressed');
            const next = { Assigned: 'Arrived at pickup', 'Arrived at pickup': 'Collected', Collected: 'En route', 'En route': 'Arrived at destination', 'Arrived at destination': 'Delivered' };
            if (next[t.status] !== p.status)
                throw Error('Invalid delivery transition');
            if (['Collected', 'Delivered'].includes(p.status))
                throw Error('Use the separate one-time handover code verification');
            t.status = p.status;
            t.history ??= [];
            t.history.push({ status: p.status, at: now, actor: driver.name });
            t.updated = now;
            event(r, p.status === 'Delivered' ? 'Delivered' : ['Collected', 'En route', 'Arrived at destination'].includes(p.status) ? 'Out for delivery' : 'Driver assigned', 'Delivery: ' + p.status);
            s.notifications.unshift({ id, recordId: r.id, recipientRole: 'Pharmacy', title: 'Delivery progress', message: p.status, at: now, read: false, type: 'Orders' }, { id: crypto.randomUUID(), recordId: r.id, recipientRole: 'Driver', recipientId: driver.id, title: 'Delivery progress saved', message: p.status, at: now, read: false, type: 'Orders' });
        }
        else if (action === 'profile') {
            check(['Patient']);
            s.profiles[session.accountId] = { ...s.profiles[session.accountId], name: txt(p.name, 80), address: s.profiles[session.accountId].address, email: txt(p.email, 100), preferences: !!p.preferences };
        }
        else if (action === 'provider') {
            check(['Admin']);
            const v = s.providers.find((x) => x.id === p.id);
            if (!v || !['Approved', 'Pending Review', 'Rejected', 'Suspended'].includes(p.status))
                throw Error('Invalid provider status');
            v.status = p.status;
        }
        else if (action === 'settings') {
            check(['Doctor', 'Homecare']);
            const v = s.providers.find((x) => x.id === session.accountId);
            v.fee = num(p.fee, 1);
            if (role === 'Doctor'&&p.slots!==undefined) {
                v.slots = txt(p.slots, 150).split(',').map((x) => x.trim());
                if (v.slots.some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))
                    throw Error('Use time slots such as 09:00, 10:00');
            }
        }
        else if (action === 'read') {
            s.notifications.forEach((x) => { if (x.recipientId ? x.recipientId === session.accountId : x.recipientRole === role && (role !== 'Patient' || x.patientId === session.accountId))
                x.read = true; });
        }
        else if (action === 'support') {
            s.tickets.unshift({ id, subject: txt(p.subject, 200), patientId: session.accountId, status: 'Open', created: now });
        }
        else if (action === 'ticket') {
            check(['Admin']);
            const t = s.tickets.find((x) => x.id === p.id);
            if (!t)
                throw Error('Ticket not found');
            t.status = 'Resolved';
        }
        else {
            const r = s.records.find((x) => x.id === p.id);
            if (role === 'Driver' && !['sendMessage', 'openConversation'].includes(action))
                throw Error('Drivers may only coordinate their assigned delivery');
            if (!r || !canAccess(r, session, s))
                throw Error('Record not found or not permitted');
            const ownerRole = pharmacyRecord(r) ? 'Pharmacy' : r.type === 'Doctor' ? 'Doctor' : 'Homecare';
            if (action === 'sendMessage') {
                check(['Patient', 'Pharmacy', 'Doctor', 'Homecare', 'Driver']);
                message(r, txt(p.body, 2000), txt(p.messageId, 100));
            }
            else if (action === 'openConversation') {
                check(['Patient', 'Pharmacy', 'Doctor', 'Homecare', 'Driver', 'Admin']);
                const c = conversation(r);
                if (role !== 'Admin')
                    for (const m of c.messages)
                        if (!m.readBy.includes(session.accountId))
                            m.readBy.push(session.accountId);
                s.notifications.forEach((n) => { if (n.recordId === r.id && n.conversationId === c.id && n.recipientRole === role && (role !== 'Patient' || n.patientId === session.accountId))
                    n.read = true; });
            }
            else if (action === 'orderHelp') {
                check(['Patient']);
                if (!pharmacyRecord(r))
                    throw Error('Choose a pharmacy order or prescription');
                if (!['Cancellation', 'Refund review', 'Delivery delay', 'Incorrect or damaged order', 'General question'].includes(p.kind))
                    throw Error('Choose a support reason');
                const ticket = { id, recordId: r.id, patientId: r.patientId, subject: p.kind, details: txt(p.details, 500),team:'Pharmacy',messages:[],updated:now, status: 'Open', created: now, history: [{ status: 'Open', at: now, actor: session.name }] };
                s.tickets.unshift(ticket);
                if (p.kind === 'Cancellation')
                    r.cancellationRequested = true;
                event(r, r.status, 'Patient requested ' + p.kind.toLowerCase());
            }
            else if (action === 'resolveOrderHelp') {
                check(['Pharmacy', 'Admin']);
                const ticket = s.tickets.find((t) => t.id === p.ticketId && t.recordId === r.id);
                if (!ticket || !ticketAllowed(s,session,ticket) || !['Open', 'Escalated'].includes(ticket.status))
                    throw Error('Support request is not pending');
                if (!['Approved', 'Declined', 'Escalated', 'Resolved'].includes(p.decision))
                    throw Error('Choose a decision');
                const note = txt(p.note, 500);
                if (ticket.subject === 'Refund review' && role !== 'Admin' && p.decision === 'Approved')
                    throw Error('Refund approval requires the Admin demo account');
                if (ticket.subject === 'Cancellation' && p.decision === 'Approved') {
                    if (['Driver assigned', 'Out for delivery', 'Delivered', 'Collected'].includes(r.status))
                        throw Error('Dispatch or completion requires admin refund review instead');
                    release(r);
                    s.deliveryTasks.forEach((t) => { if (t.recordId === r.id)
                        t.status = 'Cancelled'; });
                    r.cancellationRequested = false;
                    event(r, 'Cancelled', 'Cancellation request approved: ' + note);
                }
                else {
                    if (ticket.subject === 'Cancellation')
                        r.cancellationRequested = false;
                    event(r, r.status, 'Support ' + p.decision.toLowerCase() + ': ' + note);
                }
                ticket.status = p.decision;
                ticket.decisionBy = session.name;
                ticket.updated = now;
                ticket.history.push({ status: p.decision, note, at: now, actor: session.name });
            }
            else if (action === 'orderException') {
                check(['Pharmacy']);
                if (!pharmacyRecord(r) || !r.isOrder || terminal(r))
                    throw Error('Choose an active pharmacy order');
                if (!['Product unavailable', 'Delivery delayed', 'Order issue'].includes(p.kind))
                    throw Error('Choose an order exception');
                r.exception = { kind: p.kind, note: txt(p.note, 500), status: 'Open', at: now, by: session.name };
                event(r, r.status, p.kind + ': ' + r.exception.note);
            }
            else if (action === 'clearException') {
                check(['Pharmacy']);
                if (!r.exception || r.exception.status !== 'Open')
                    throw Error('No open exception');
                r.exception.status = 'Resolved';
                r.exception.resolution = txt(p.note, 500);
                r.exception.resolvedAt = now;
                event(r, r.status, 'Exception resolved: ' + r.exception.resolution);
            }
            else if (action === 'prescriptionReview') {
                check(['Pharmacy']);
                if (r.type !== 'Prescription' || !['Under review', 'Clarification requested', ...(r.payment === 'Unpaid' ? ['Prescription approved'] : [])].includes(r.status))
                    throw Error('Prescription is not awaiting review');
                if (p.decision === 'Reject') {
                    r.prescriptionApproved = false;
                    r.verification = { at: now, by: session.name, reviewerId: session.accountId, reason: txt(p.note, 300), outcome: 'Rejected' };
                    event(r, 'Rejected', txt(p.note));
                }
                else if (p.decision === 'Clarify') {
                    event(r, 'Clarification requested', txt(p.note));
                    message(r, txt(p.note), crypto.randomUUID());
                }
                else if (p.decision === 'Approve') {
                    if (r.requiresDocuments && r.identity?.status !== 'Verified')
                        throw Error('Review and verify the submitted identity evidence first');
                    if (p.verified !== true)
                        throw Error('Confirm required prescription information has been verified');
                    const lines = items(p.items, true);
                    const fee = fulfilment(r.fulfilment);
                    const total = round(lines.reduce((a, i) => a + i.price * i.quantity, 0) + fee);
                    if (r.payment === 'Paid' && total !== r.total)
                        throw Error('Historical paid amount differs. Admin must simulate a refund before creating a new submission.');
                    r.items = lines;
                    r.deliveryFee = fee;
                    r.total = total;
                    r.prescriptionApproved = true;
                    r.verification = { at: now, by: session.name, reviewerId: session.accountId, reason: txt(p.note, 300), documentIds: s.documents.filter((d) => d.recordId === r.id && !d.purged).map((d) => d.id) };
                    r.details = lines.map((i) => i.name + ' × ' + i.quantity).join(', ');
                    if (r.payment === 'Paid') {
                        reserve(lines);
                        r.stockDebited = true;
                        r.isOrder = true;
                        event(r, 'Order confirmed', 'Prescription verified; existing demo payment preserved');
                    }
                    else
                        event(r, 'Prescription approved', 'Verified catalogue products and fixed prices ready for payment');
                }
                else
                    throw Error('Invalid review decision');
            }
            else if (action === 'clarification') {
                check(['Patient']);
                if (r.type !== 'Prescription' || r.status !== 'Clarification requested')
                    throw Error('No prescription clarification is pending');
                if (r.requiresDocuments && ['prescription', 'id-front', 'id-back', 'selfie'].some(kind => !s.documents.some((d) => d.recordId === r.id && d.kind === kind && !d.purged && d.retainUntil > Date.now())))
                    throw Error('Upload the required current fictional documents first');
                r.clarification = { at: now };
                event(r, 'Under review', 'Updated fictional information returned for review');
            }
            else if (action === 'pay') {
                check(['Patient']);
                if (r.payment === 'Paid')
                    throw Error('This request is already paid');
                if (r.type === 'Order')
                    throw Error('Medication orders are paid during checkout');
                const ready = r.type === 'Prescription' ? r.status === 'Prescription approved' && r.prescriptionApproved && r.verification : r.type === 'Homecare' ? r.status === 'Awaiting payment' && !!r.priceSnapshot : r.status === 'Awaiting payment';
                if (!ready)
                    throw Error('This request is not ready for payment');
                if (r.type === 'Prescription') {
                    if (r.requiresDocuments && r.identity?.status !== 'Verified')
                        throw Error('Identity review is not verified');
                    provider('Pharmacy');
                    if (p.expectedTotal !== r.total)
                        throw Error('Review the verified final total before payment');
                    items(r.items, true);
                    for (const i of r.items) {
                        const m = s.products.find((x) => x.id === i.id);
                        if (m.price !== i.price)
                            throw Error('Catalogue prices changed. Ask the pharmacy to review the fixed total again before payment.');
                        if (m.requiresPrescription && !i.requiresPrescription)
                            throw Error('Prescription product requirements changed. Pharmacy must review again.');
                    }
                }
                if(r.type==='Homecare'){const prov=provider('Homecare');if(!r.holdExpires||r.holdExpires<=Date.now())throw Error('Booking hold expired. Review the service price and availability again');careBookingPrice(s,prov,{serviceId:r.serviceId,service:r.title,date:r.date,time:r.time,duration:r.duration},r.id);if(p.expectedTotal!==undefined&&p.expectedTotal!==r.total)throw Error('Review the saved homecare total before payment');}
                if (r.type === 'Doctor') {
                    validateSlot(s, r.providerId, r.date, r.time, r.id,r.mode);
                    if (r.holdExpires && r.holdExpires < Date.now() && r.payment !== 'Paid')
                        throw Error('Reservation expired. Reschedule or create a new booking.');
                    if (p.scenario !== 'Success')
                        r.reservationActive = false;
                }
                attempt(r.id, r.total, p.scenario);
                if (p.scenario === 'Success') {
                    if (r.type === 'Prescription') {
                        reserve(r.items);
                        r.stockDebited = true;
                        r.isOrder = true;
                    }
                    r.payment = 'Paid';
                    event(r, r.type === 'Prescription' ? 'Order confirmed' : r.type === 'Doctor' ? 'Confirmed' : 'Paid — scheduling');
                }
            }
            else if (action === 'cancel') {
                check(['Patient']);
                if (terminal(r))
                    throw Error('This record is already closed');
                if (pharmacyRecord(r) && ['Driver assigned', 'Out for delivery'].includes(r.status))
                    throw Error('Dispatch has started. Contact demo support for cancellation.');
                if (pharmacyRecord(r)) {
                    release(r);
                    s.deliveryTasks.forEach((t) => { if (t.recordId === r.id)
                        t.status = 'Cancelled'; });
                }
                event(r, 'Cancelled', r.payment === 'Paid' ? 'Demo refund available through admin' : 'Cancelled by patient');
            }
            else if (action === 'refund') {
                check(['Admin']);
                if (r.payment !== 'Paid')
                    throw Error('No paid transaction to refund');
                r.payment = 'Refunded';
                if (pharmacyRecord(r) && !['Delivered', 'Collected'].includes(r.status))
                    release(r);
                s.deliveryTasks.forEach((t) => { if (t.recordId === r.id && t.status !== 'Delivered')
                    t.status = 'Cancelled'; });
                s.payments.unshift({ id, recordId: r.id, amount: r.total, status: 'Refunded', at: now, reference: 'DEMO-REFUND-' + id.slice(0, 8) });
                event(r, 'Cancelled', 'Simulated refund issued');
            }
            else if (action === 'assignDriver') {
                throw Error('Manual assignment is disabled. Approved online drivers claim eligible dispatch tasks.');
            }
            else if (action === 'feedback') {
                check(['Patient']);
                if (!['Completed', 'Delivered', 'Collected'].includes(r.status))
                    throw Error('Feedback is available after completion');
                r.feedback = txt(p.feedback, 300);
            }
            else if (action === 'transition') {
                check([ownerRole]);
                let next = [];
                if (pharmacyRecord(r)) {
                    if ((r.exception?.status === 'Open' || r.cancellationRequested) && p.status !== 'Declined')
                        throw Error('Resolve the open exception or cancellation request before fulfilment');
                    if (r.payment !== 'Paid' || r.isOrder !== true || r.type === 'Prescription' && (!r.prescriptionApproved || !r.verification || r.requiresDocuments && r.identity?.status !== 'Verified'))
                        throw Error('Paid order and required prescription verification are needed before fulfilment');
                    const map = { 'Order confirmed': ['Accepted', 'Declined'], Received: ['Accepted', 'Declined'], Accepted: ['Processing'], Processing: ['Prepared'], Prepared: [r.fulfilment === 'Collection' ? 'Ready for collection' : 'Ready for dispatch'], 'Ready for collection': ['Collected'] };
                    next = map[r.status] || [];
                }
                else {
                    const maps = { Doctor: { Requested: ['Confirmed', 'Declined'], Confirmed: ['In consultation', 'Completed'], "In consultation": ['Completed'] }, Homecare: { 'Paid — scheduling': ['Scheduled'], Scheduled: ['Assigned'], Assigned: ['On the way'], 'On the way': ['Arrived'], Arrived: ['In progress'], 'In progress': ['Completed'] } };
                    next = maps[r.type]?.[r.status] || [];
                }
                if(r.type==='Homecare'&&r.payment!=='Paid')throw Error('Homecare payment is required before fulfilment');
                if (!next.includes(p.status))
                    throw Error('Invalid status transition');
                if (['Declined', 'Clarification requested', 'Assigned'].includes(p.status))
                    txt(p.note);
                if (p.status === 'Assigned')
                    r.caregiver = p.note;
                if (pharmacyRecord(r) && p.status === 'Declined')
                    release(r);
                event(r, p.status, p.note || '');
                if (pharmacyRecord(r) && p.status === 'Ready for dispatch') {
                    if (s.deliveryTasks.some((t) => t.recordId === r.id))
                        throw Error('Dispatch task already exists');
                    s.deliveryTasks.unshift({ id: crypto.randomUUID(), recordId: r.id, status: 'Ready for assignment', driver: null, address: r.address, created: now });
                }
                if (pharmacyRecord(r) && ['Out for delivery', 'Delivered'].includes(p.status)) {
                    const t = s.deliveryTasks.find((t) => t.recordId === r.id && t.driver);
                    if (!t)
                        throw Error('Assign a driver before dispatch');
                    t.status = p.status;
                    t.updated = now;
                }
            }
            else
                throw Error('Unknown action');
        }
        maintainBusiness(s);
        maintainMarket(s);
        maintainMatching(s);
        maintainExperience(s);
        maintainPatientExperience(s);
        maintainDoctorOperations(s);maintainAccountWorkspace(s);
        s.version++;
        s.audit.unshift({ id, action, recordId: p.id || null, role, actorId: session.accountId, actor: session.name, at: now });
        // Preserve consequential demo audit history; production needs a separate scalable retention store.
        const result = await env.DB.prepare('UPDATE workspaces SET data=?,updated=? WHERE id=? AND data=?').bind(JSON.stringify(s), now, u.userId, raw).run();
        if (!result.meta.changes) {
            if (completionContext.uploadedKey)
                await env.BUCKET?.delete(completionContext.uploadedKey);
            return fail('Another action just completed. Refresh and retry.', 409);
        }
        if (completionContext.binary)
            return new Response(completionContext.binary.bytes, { headers: { 'X-Workspace-Version':String(s.version),'Content-Type': completionContext.binary.mime,...(completionContext.binary.filename?{'Content-Disposition':'attachment; filename="'+completionContext.binary.filename+'"'}:{}), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
        return Response.json({ ...publicState(s, session), ...completionContext.extra }, { status: completionContext.status });
    }
    catch (e) {
        return fail(e.message || 'Unable to complete action');
    }
}
