import {handleRealTracking} from './real-delivery-tracking.mjs';
import {executionContext,operationalReadiness} from './execution-readiness.mjs';
export {enforceExecutionBoundary} from './execution-readiness.mjs';
import {candidateTimes} from './appointment-calendar.mjs';
import { validateSlot, digest } from './completion.mjs';
import { kmBetween, serves } from './matching.mjs';
const completed = r => ['Delivered', 'Collected', 'Completed', 'Cancelled', 'Declined', 'Rejected'].includes(r?.status);
export function driverAreaEligible(s, t, d) { const r = s.records.find(r => r.id === t.recordId), areas = (d.serviceArea || '').split(',').map(v => v.trim().toLowerCase()); return areas.includes((r?.addressDetails?.city || s.dispatchPolicy.serviceArea || '').toLowerCase()); }
export function driverProximity(s, t, d) { const point = s.driverLocations?.[d.id], r = s.records.find(r => r.id === t.recordId), pickup = s.providers.find(p => p.id === r?.providerId)?.coordinates; return point?.consented && point.expires > Date.now() ? kmBetween(point, pickup) : null; }
export function maintainExperience(s) { let changed = false; for(const [key,value] of [['deliveryLocations',{}],['driverLocations',{}],['messageAssets',[]]])if(!s[key]){s[key]=value;changed=true;} for (const [taskId, point] of Object.entries(s.deliveryLocations)) {
    const task = s.deliveryTasks.find(t => t.id === taskId), r = s.records.find(r => r.id === task?.recordId);
    if (!task || !r || !s.drivers[point.driverId]?.online || s.drivers[point.driverId]?.status!=='Approved' || completed(r) || task.driverId !== point.driverId || !s.connectedAccounts&&!s.sessions.some(v => v.hash === point.sessionHash && v.expires > Date.now()) || point.expires <= Date.now()) {
        if (task)
            task.lastLocationAt = point.at;
        delete s.deliveryLocations[taskId];
        changed = true;
    }
} for (const [id, point] of Object.entries(s.driverLocations))
    if (point.expires <= Date.now() || point.taskId && (!s.deliveryTasks.some(t=>t.id===point.taskId&&t.driverId===id)||completed(s.records.find(r => r.id === s.deliveryTasks.find(t => t.id === point.taskId)?.recordId))) || !s.drivers[id]?.online || !s.connectedAccounts&&!s.sessions.some(v => v.hash === point.sessionHash && v.expires > Date.now())) {
        delete s.driverLocations[id];
        changed = true;
    } return changed; }
export function publicExperience(out, s, session) { out.executionContext={...executionContext};
    delete out.deliveryLocations;
    delete out.driverLocations;
    delete out.messageAssets;
    out.deliveryTracking = s.deliveryTasks.filter(t => s.records.some(r=>r.id===t.recordId)&&(session.role === 'Admin' || t.driverId === session.accountId || s.records.some(r => r.id === t.recordId && r.patientId === session.accountId))).map(t => { const point = s.deliveryLocations[t.id], r = s.records.find(r => r.id === t.recordId), active = !completed(r) && t.driverId; return { taskId: t.id, recordId: t.recordId, state: !active ? 'Ended' : point ? 'Live' : 'Location unavailable', lastUpdate: point?.at || t.lastLocationAt || null, location: active && point ? { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy } : null }; });
    for (const conversation of out.conversations) {
        conversation.status = completed(s.records.find(r => r.id === conversation.recordId)) ? 'Completed service' : 'Active service';
        if (session.role === 'Admin') {
            conversation.messageCount = conversation.messages.length;
            conversation.messages = [];
            conversation.requiresPurpose = true;
        }
    }
    if (session.role !== 'Admin')
        out.archivedConversations = s.conversations.filter(c => c.archived && historyAllowed(s, c, session)).map(c => ({ id: c.id, recordId: c.recordId, channel: c.channel, updated: c.updated, messageCount: c.messages.length, status: 'Archived' }));
    return out;
}
function historyAllowed(s, thread, session) { const r = s.records.find(r => r.id === thread.recordId); return !!r && thread.participants?.includes(session.accountId) && (session.role === 'Patient' && r.patientId === session.accountId || session.role === 'Doctor' && r.providerId === session.accountId || session.role === 'Homecare' && r.providerId === session.accountId || session.role === 'Pharmacy' && r.providerId === session.pharmacyId || session.role === 'Driver' && s.deliveryTasks.some(t => t.recordId === r.id && t.driverId === session.accountId)); }
const words = (v, max = 300) => { if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw Error('Complete required information'); return v.trim(); };
export async function handleExperience(c) {
    if(c.action==='saveDeliveryEta')return handleRealTracking(c);
 if(c.action==='operationalReadiness'){c.check(['Admin']);c.extra.operationalReadiness=operationalReadiness(c.s,c.bucket);return true;}
    const { s, p, session, action, id, now, check, bucket } = c;
    if (action === 'appointmentAvailability') {
        check(['Patient','Doctor']);
        const d = s.providers.find(d => d.id === p.providerId && d.type === 'Doctor');
        if (!d || typeof p.date !== 'string')
            throw Error('Choose a doctor and date');
        if(session.role==='Doctor'&&d.id!==session.accountId)throw Error('Only your own practice availability is permitted');const existing=p.recordId?s.records.find(r=>r.id===p.recordId&&r.type==='Doctor'&&r.providerId===d.id&&c.canAccess(r)):null;if(p.recordId&&!existing)throw Error('Appointment not permitted');
        const address = p.addressDetails||s.profiles[session.accountId]?.addresses?.find(a => a.id === s.profiles[session.accountId].selectedAddressId);
        const application = s.applications[d.id];
        if (application && (application.status !== 'Approved' || application.checks.some(v => v.expiresAt <= Date.now())))
            throw Error('Doctor is not currently available');
        if (session.role==='Patient'&&!existing&&d.matchingEnabled && (p.mode==='In-person'||!p.mode&&d.modes.every(m => m === 'In-person')) && !serves(d, address))
            throw Error('Choose a saved address in the practice service area');
        c.extra.availabilityDate=p.date;c.extra.availabilityDoctorId=d.id;
        c.extra.availableSlots = candidateTimes(d,p.date,p.mode).filter(time => { try {
            validateSlot(s, d.id, p.date, time,existing?.id,p.mode);
            return true;
        }
        catch {
            return false;
        } });
        return true;
    }
    if (['shareDriverLocation', 'saveDriverAvailabilityLocation', 'stopDriverLocation'].includes(action)) {
        check(['Driver']);
        const driver = s.drivers[session.accountId];
        if (action === 'stopDriverLocation') {
            for (const [taskId, point] of Object.entries(s.deliveryLocations))
                if (point.driverId === session.accountId) {
                    const t = s.deliveryTasks.find(t => t.id === taskId);
                    if (t)
                        t.lastLocationAt = point.at;
                    delete s.deliveryLocations[taskId];
                }
            delete s.driverLocations[session.accountId];
            return true;
        }
        if (driver?.status !== 'Approved' || !driver.online || p.consent !== true)
            throw Error('An approved online driver and explicit location consent are required');
        for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180], ['accuracy', 0, 10000]])
            if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < min || p[key] > max)
                throw Error('Invalid location coordinates or accuracy');
        const point = { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, at: now, expires: Date.now() + 120000, taskId: action === 'shareDriverLocation' ? p.taskId : null, driverId: session.accountId, sessionHash: session.hash, consented: true };
        if (action === 'shareDriverLocation') {
            const task = s.deliveryTasks.find(t => t.id === p.taskId && t.driverId === session.accountId), r = s.records.find(r => r.id === task?.recordId);
            if (!task || !r || completed(r) || r.payment !== 'Paid' || !['Assigned', 'Arrived at pickup', 'Collected', 'En route', 'Arrived at destination', 'Delivery exception'].includes(task.status))
                throw Error('Location sharing requires an active assigned delivery');
            s.deliveryLocations[task.id] = point;
            task.lastLocationAt = now;
        }
        s.driverLocations[session.accountId] = point;
        return true;
    }
    if (action === 'deliveryOperations') {
        check(['Admin']);
        const purpose = words(p.purpose);
        c.extra.deliveryOperations = s.deliveryTasks.filter(t => t.driverId && s.records.some(r=>r.id===t.recordId&&!completed(r))).map(t => { const r = s.records.find(r => r.id === t.recordId), provider = s.providers.find(d => d.id === r.providerId); return { taskId: t.id, reference: 'HRC-' + r.id.slice(0, 8), status: t.status, driver: s.drivers[t.driverId]?.name, pickup: { label: provider?.location || provider?.name, coordinates: provider?.coordinates || null }, destination: { label: r.address, coordinates: r.addressDetails?.latitude !== undefined ? { latitude: r.addressDetails.latitude, longitude: r.addressDetails.longitude } : null }, tracking: s.deliveryLocations[t.id] ? { at: s.deliveryLocations[t.id].at, latitude: s.deliveryLocations[t.id].latitude, longitude: s.deliveryLocations[t.id].longitude } : null }; });
        c.extra.deliveryOperationsUpdatedAt=now;
        s.audit.unshift({ id, action: 'delivery-map-access', actorId: session.accountId, role: session.role, purpose, at: now });
        return true;
    }
    if (['readConversationHistory', 'reviewConversation'].includes(action)) {
        const thread = s.conversations.find(v => v.id === p.conversationId);
        if (!thread)
            throw Error('Conversation unavailable');
        if (session.role === 'Admin') {
            const purpose = words(p.purpose);
            s.audit.unshift({ id, action: 'conversation-evidence-access', recordId: thread.recordId, actorId: session.accountId, role: session.role, purpose, at: now });
        }
        else if (!historyAllowed(s, thread, session))
            throw Error('Conversation is not permitted');
        c.extra.reviewedThread = structuredClone(thread);
        return true;
    }
    if (action === 'sendAttachment') {
        const r = s.records.find(v => v.id === p.id);
        if (!r)
            throw Error('Service record unavailable');
        if (session.role === 'Admin')
            throw Error('Administrator communication uses authorised support cases');
        const thread = c.conversation(r), messageId = words(p.messageId, 150);
        if (thread.messages.some(m => m.id === messageId))
            return true;
        if (!bucket || typeof p.base64 !== 'string' || p.base64.length > 4194304)
            throw Error('Choose a file under 3 MB');
        const bytes = Uint8Array.from(atob(p.base64), v => v.charCodeAt(0));
        if (bytes.length > 3145728 || !bytes.length)
            throw Error('Choose a file under 3 MB');
        let mime;
        if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
            mime = 'image/png';
        if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
            mime = 'image/jpeg';
        if (bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)
            mime = 'application/pdf';
        if (bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163)
            mime = 'audio/webm';
        if (bytes[0] === 79 && bytes[1] === 103 && bytes[2] === 103 && bytes[3] === 83)
            mime = 'audio/ogg';
        if (!mime)
            throw Error('Use PNG, JPEG, PDF, WebM audio or Ogg audio');
        const filename = words(p.filename, 100).replace(/[^a-zA-Z0-9._ -]/g, '_'), key = 'messages/' + await digest(c.userId) + '/' + id;
        await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
        c.uploadedKey = key;
        s.messageAssets.push({ id, key, mime, filename, threadId: thread.id, recordId: r.id, created: now, expires: Date.now() + s.policy.prescriptionRetentionDays * 86400000, size: bytes.length });
        c.message(r, 'Attachment: ' + filename, messageId);
        const message = thread.messages.find(m => m.id === messageId);
        message.attachment = { id, mime, filename, size: bytes.length };
        return true;
    }
    if (action === 'viewMessageAttachment') {
        const asset = s.messageAssets.find(v => v.id === p.attachmentId), thread = s.conversations.find(v => v.id === asset?.threadId);
        if (!asset || asset.expires <= Date.now() || !thread || session.role !== 'Admin' && !historyAllowed(s, thread, session))
            throw Error('Attachment unavailable or not permitted');
        if (session.role === 'Admin') {
            const purpose = words(p.purpose);
            s.audit.unshift({ id, action: 'message-attachment-access', recordId: asset.recordId, actorId: session.accountId, role: session.role, purpose, at: now });
        }
        const file = await bucket?.get(asset.key);
        if (!file)
            throw Error('Attachment is unavailable');
        c.binary = { bytes: await file.arrayBuffer(), mime: asset.mime, filename: asset.filename };
        return true;
    }
    return false;
}
