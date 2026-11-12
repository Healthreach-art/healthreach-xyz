import {withinHours} from './provider-hours.mjs';
import {platformDeliveryFee} from './platform-delivery-fee.mjs';
import {afterHoursDeliverySchedule} from './after-hours-delivery.mjs';
// Matching uses saved coordinates or exact service-area names; it never invents a distance.
// One shared identity per medicine and pack across all branch pharmacies.
// Prescription handling is a safety flag, not a separate product identity.
export const productKey = p => [p.name, p.strength || '', p.form || '', p.packageSize || ''].map(v=>String(v).toLowerCase().trim()).join('|');
export function kmBetween(a, b) { if (!a || !b || ![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite))
    return null; const rad = x => x * Math.PI / 180, lat = rad(b.latitude - a.latitude), lon = rad(b.longitude - a.longitude), h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lon / 2) ** 2; return Math.round(12742 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 100) / 100; }
export const addressFor = (s, id) => s.profiles[id]?.addresses?.find(a => a.id === s.profiles[id].selectedAddressId);
const capeTownPoint = p => Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)&&p.latitude>=-34.45&&p.latitude<=-33.45&&p.longitude>=18.15&&p.longitude<=19.15;
export function serves(d, address) { const km = kmBetween(d.coordinates, address); if (km !== null)
    return km <= (d.deliveryRadiusKm || 15); return (d.serviceAreas || []).some(v => [address?.city, address?.suburb, address?.province].filter(Boolean).map(v => v.toLowerCase().trim()).includes(v.toLowerCase().trim())); }
export function pharmacyServes(d,address){const km=kmBetween(d.coordinates,address);if(km!==null)return (capeTownPoint(d.coordinates)&&capeTownPoint(address))||km<=(d.deliveryRadiusKm||15);return (d.serviceAreas||[]).some(v=>[address?.city,address?.suburb,address?.province].filter(Boolean).map(x=>String(x).toLowerCase().trim()).includes(String(v).toLowerCase().trim()));}
export function openNow(d,now=Date.now()) { if(d.weeklyHours)return withinHours(d,now);  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(Date.now()).map(v => [v.type, v.value])); const time = p.hour + ':' + p.minute; return (d.weekdays || [0, 1, 2, 3, 4, 5, 6]).includes(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)) && time >= (d.openTime || '00:00') && time <= (d.closeTime || '23:59'); }
const available = (s, d) => d.status === 'Approved' && d.acceptingOrders !== false && s.accountControls[d.id]?.status !== 'Suspended' && ['Published', 'Sample preview'].includes(d.publication?.status) && (!s.applications[d.id] || s.applications[d.id].status === 'Approved' && s.applications[d.id].checks.every(v => v.result === 'Simulated verified' && v.expiresAt > Date.now()));
export function maximumPharmacistDispensingFee(sep) {
 const amount=Number(sep); if(!Number.isFinite(amount)||amount<0)return 0;
 if(amount<164.49)return Math.round((23.93+amount*.46)*100)/100;
 if(amount<438.13)return Math.round((44.39+amount*.33)*100)/100;
 if(amount<1551.30)return Math.round((126.20+amount*.15)*100)/100;
 return Math.round((279.85+amount*.05)*100)/100;
}
export function pharmacyMatches(s, items, address, mode, excluded = [], fee, options = {}) {
 return s.providers.filter(d => d.type === 'Pharmacy' && available(s, d) && (mode === 'Collection' || pharmacyServes(d, address)) && (options.allowClosed || openNow(d)) && !excluded.includes(d.id) && (mode !== 'Collection' || d.collection)).map(d => {
  const lines = items.map(i => {
   const source = s.products.find(p => p.id === i.id) || i, key=i.productKey || productKey(source), shared=s.connectedAccounts?s.medications_public?.[key]:null, expectedPrice=shared?.status==='Published'?shared.price:(i.price ?? source.price);
   const product = s.products.find(p => p.ownerId === d.id && p.active && !p.removed && (!s.connectedAccounts || p.catalogueStatus !== 'Pending review' && shared?.status === 'Published') && productKey(p) === key && (shared?.priceModel==='branch' ? true : p.price === expectedPrice) && p.stock >= i.quantity);
   if(!product)return null;
   const medicinePrice=shared?.priceModel==='branch'?product.price:(shared?.price??product.price),sep=shared?.priceModel==='SEP'?medicinePrice:null,dispensingFee=sep===null?0:Number(d.dispensingFee||0),maxFee=sep===null?0:maximumPharmacistDispensingFee(sep);
   if(dispensingFee>maxFee+0.0001)return null;
   const dispensingVat=d.vatRegistered?Math.round(dispensingFee*15)/100:0;
   return { id: product.id, name: shared?.name||product.name, price: medicinePrice, medicinePrice, priceModel:shared?.priceModel||'legacy-shared',sep,dispensingFee,dispensingVat,quantity:i.quantity,lineTotal:Math.round((medicinePrice+dispensingFee+dispensingVat)*100)*i.quantity/100,requiresPrescription:!!(shared?.requiresPrescription||product.requiresPrescription),productKey:productKey(product),registrationNumber:product.registeredProductId||product.registrationNumber||shared?.registeredProductId||'' };
  });
  const distanceKm=kmBetween(d.coordinates,address);
  let deliveryFee=0;if(mode!=='Collection'){try{deliveryFee=platformDeliveryFee(s,d,distanceKm);}catch{deliveryFee=null;}}const dispensingTotal=lines.every(Boolean)?lines.reduce((n,v)=>n+(v.dispensingFee+v.dispensingVat)*v.quantity,0):null;
  return {provider:d,items:lines,fee:deliveryFee,dispensingFee:dispensingTotal,distanceKm};
 }).filter(v=>v.items.every(Boolean)&&(mode==='Collection'||Number.isFinite(v.fee))&&(fee===undefined||v.fee===fee)).sort((a,b)=>(a.distanceKm??1e9)-(b.distanceKm??1e9)||(a.fee??0)-(b.fee??0)||a.provider.id.localeCompare(b.provider.id));
}
export function prepareMatch(s, session, action, p, now = Date.now()) {
    if (session.role !== 'Patient')
        return;
    const address = p.addressDetails || addressFor(s, session.accountId);
    if (['checkout', 'prescriptionDraft'].includes(action) && Array.isArray(p.items) && p.items.length) {
        const deliverySchedule = afterHoursDeliverySchedule(now);
        if (!s.connectedAccounts && p.fulfilment === 'Collection') return;
        if (!address&&p.fulfilment!=='Collection')
            { if(s.connectedAccounts)throw Error('Save and select a delivery address before matching'); else return; }
        const result = pharmacyMatches(s, p.items, address, p.fulfilment, [], undefined, {allowClosed:!!deliverySchedule})[0];
        if (!result)
            { if(s.connectedAccounts)throw Error('No matching open pharmacy can currently complete this basket at the displayed prices. Check the delivery address pin, item quantities, stock and pharmacy hours, or choose collection.'); else return; }
        p.items = result.items.map(i => ({ id: i.id, quantity: i.quantity }));
        p.providerId = result.provider.id;
        p.address = address?.formatted || result.provider.location || 'Pharmacy collection';
        p.matching = { state: 'Offered', excluded: [], attempts: [], distanceKm: result.distanceKm, keys: result.items.map(i => i.productKey) };
        p.deliverySchedule = deliverySchedule;
    }
    // Homecare is coordinated by the HealthReachCare service, not a location
    // matched provider marketplace. The selected, published offer and its
    // saved schedule are validated by the booking action; patient address and
    // legacy matchingEnabled flags must not hide or reject the offer.
    if(action==='request'&&p.type==='Doctor'){const d=s.providers.find(d=>d.id===(p.doctorId||'doctor'));if(!d)throw Error('Choose an available doctor');if(Number.isFinite(d.coordinates?.latitude)&&Number.isFinite(d.coordinates?.longitude)&&!capeTownPoint(d.coordinates))throw Error('This doctor is not available in Cape Town.');const patientAddress=p.addressDetails||address;if(p.mode==='In-person'&&Number.isFinite(patientAddress?.latitude)&&Number.isFinite(patientAddress?.longitude)&&!capeTownPoint(patientAddress))throw Error('In-person appointments are currently available in Cape Town.');}
    if (action === 'rescheduleHomecare') {
        const r = s.records.find(r => r.id === p.id);
        const d = s.providers.find(d => d.id === r?.providerId);
        if (d?.matchingEnabled && !careAvailable(s, d, p.date, p.time, r.duration, r.id))
            throw Error('The provider is unavailable for the requested schedule');
    }
}
export function careAvailable(s, d, date, time, duration, exclude) { const begin = Date.parse(date + 'T' + time + ':00+02:00'), finish = begin + Number(duration) * 3600000, day = new Date(date + 'T12:00:00+02:00').getUTCDay(); if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish <= begin || (d.weeklyHours ? !withinHours(d,begin,finish) : (!(d.weekdays || [0,1,2,3,4,5,6]).includes(day) || time < (d.openTime || '00:00') || finish > Date.parse(date + 'T' + (d.closeTime || '23:59') + ':00+02:00'))))
    return false; return !s.records.some(r => r.id !== exclude && r.type === 'Homecare' && r.providerId === d.id && (r.payment==='Paid'||r.holdExpires>Date.now()) && !['Completed', 'Cancelled', 'Declined', 'Rejected'].includes(r.status) && begin < Date.parse(r.date + 'T' + r.time + ':00+02:00') + r.duration * 3600000 && finish > Date.parse(r.date + 'T' + r.time + ':00+02:00')); }
function announce(s, r, title, recipientId) { s.notifications.unshift({ id: crypto.randomUUID(), recordId: r.id, recipientId, title, message: 'Open the order for the current matching status.', type: 'Orders', at: new Date().toISOString(), read: false }); }
export function reroute(s, r, reason, retry = false) { const now = new Date().toISOString(), old = r.providerId; r.matching.excluded = [...new Set([...(r.matching.excluded || []), ...(retry ? [] : [old])])]; r.matching.attempts.push({ providerId: old, outcome: reason, at: now }); if (r.stockDebited && !r.stockReleased)
    for (const i of r.items) {
        const p = s.products.find(p => p.id === i.id);
        if (p)
    p.stock += i.quantity;
    } r.stockReleased = true; const next = pharmacyMatches(s, r.items.map((i, n) => ({ ...i, productKey: r.matching.keys?.[n] || productKey(i) })), r.addressDetails, r.fulfilment, r.matching.excluded, undefined, {allowClosed:!!r.deliverySchedule})[0]; for (const thread of s.conversations.filter(t => t.recordId === r.id && t.participants?.includes(old))) {
    thread.archived = true;
    thread.archivedAt = now;
    thread.retention = 'Provider reassignment audit evidence';
} if (next) {
    r.providerId = next.provider.id;
    r.items = next.items.map(({ productKey: unusedKey, ...i }) => { void unusedKey; return i; });
    for (const i of r.items)
        s.products.find(p => p.id === i.id).stock -= i.quantity;
    r.stockReleased = false;
    r.matching.state = 'Offered';
    r.matching.deadline = Date.now() + s.matchingPolicy.acceptanceMinutes * 60000;
    r.status = 'Order confirmed';
    const net = r.feeSnapshot?.providerNetMinor ?? Math.round((r.total - r.deliveryFee) * 100);
    s.ledger.push({ id: crypto.randomUUID(), key: 'reroute:' + r.id + ':' + r.matching.attempts.length, debit: 'provider:' + old, credit: 'provider:' + r.providerId, amountMinor: net, currency: 'ZAR', recordId: r.id, reference: 'MATCH-' + r.id.slice(0, 8), type: 'Provider reassignment', at: now, simulated: true });
    announce(s, r, 'New order awaiting acceptance', r.providerId);
}
else {
    r.matching.state = 'No available pharmacy';
    r.matching.deadline = null;
    r.status = 'Awaiting pharmacy';
} r.updated = now; r.history.push({ status: r.status, note: reason + '; ' + r.matching.state, actor: 'System', role: 'System', at: now }); announce(s, r, 'Pharmacy matching updated', r.patientId); }
export function maintainMatching(s) { let changed = false; for (const r of s.records) {
    if (r.type !== 'Order' || !r.matching || r.payment !== 'Paid')
        continue;
    if (r.status === 'Order confirmed' && r.matching.state === 'Offered') {
        if (!r.matching.deadline) {
            r.matching.deadline = Date.now() + s.matchingPolicy.acceptanceMinutes * 60000;
            changed = true;
        }
        else if (r.matching.deadline <= Date.now()) {
            reroute(s, r, 'Pharmacy acceptance deadline expired');
            changed = true;
        }
    }
    else if (r.status === 'Accepted' && r.matching.state === 'Offered') {
        r.matching.state = 'Accepted';
        r.matching.deadline = null;
        changed = true;
    }
} return changed; }
export function handleMatching(c) { const { s, session, p, action } = c; if (action === 'transition' && p.status === 'Declined') {
    const r = s.records.find(v => v.id === p.id);
    if (r?.type === 'Order' && r.matching && r.status === 'Order confirmed') {
        if (session.role !== 'Pharmacy' || r.providerId !== session.pharmacyId || typeof p.note !== 'string' || !p.note.trim())
            throw Error('Only the offered pharmacy can decline with a reason');
        reroute(s, r, p.note.trim().slice(0, 300));
        return true;
    }
} if (action === 'retryPharmacyMatching') {
    const r = s.records.find(v => v.id === p.id);
    if (!r || r.type !== 'Order' || r.status !== 'Awaiting pharmacy' || r.payment !== 'Paid' || !['Patient', 'Admin'].includes(session.role) || session.role === 'Patient' && r.patientId !== session.accountId)
        throw Error('Choose your order awaiting pharmacy matching');
    r.matching.excluded = [];
    reroute(s, r, 'Matching retry requested', true);
    return true;
} return false; }
// Fixed-price homecare checkout uses the selected provider's saved service rate.
export function careBookingPrice(s,d,p,exclude,options={}){const service=d.services?.find(v=>(p.serviceId?v.id===p.serviceId:v.name===p.service)&&v.active!==false);if(!service||!Number.isFinite(service.rate)||service.rate<=0)throw Error('This provider has no available fixed-price service');const duration=Number(p.duration),date=p.date,time=p.time,day=new Date(date+'T12:00:00Z'),minimum=Number(service.minDuration||1),maximum=Number(service.maxDuration||24),pricingModel=['hourly','per-visit','daily','fixed-package'].includes(service.pricingModel)?service.pricingModel:'hourly';if(!Number.isFinite(duration)||duration<minimum||duration>maximum||duration>24||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date||'')||!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'')||Date.parse(date+'T'+time+':00+02:00')<=Date.now())throw Error('Choose a valid future homecare schedule and duration');if(!(options.acceptRequestedTime||p.acceptRequestedTime===true||d.type==='Homecare')){if(service.noticeHours&&Date.parse(date+'T'+time+':00+02:00')<Date.now()+service.noticeHours*3600000)throw Error('This service needs more booking notice. Choose a later time.');if(Array.isArray(service.availability)&&service.availability.length){const weekday=new Date(date+'T12:00:00+02:00').getUTCDay(),start=Date.parse(date+'T'+time+':00+02:00'),end=start+duration*3600000,range=service.availability.find(value=>value.weekday===weekday&&value.active!==false&&value.start<=time&&value.end>=new Date(end+7200000).toISOString().slice(11,16));if(!range)throw Error('This service is not available at the selected time. Choose a published service time.');}if(!careAvailable(s,d,date,time,duration,exclude))throw Error('This homecare time is unavailable. Choose another time or provider');}const rateMinor=Math.round(service.rate*100),totalMinor=pricingModel==='hourly'?rateMinor*duration:rateMinor,total=totalMinor/100;if(p.expectedTotal!==undefined&&p.expectedTotal!==total)throw Error('The service price changed. Review the current fixed total before paying');return {serviceId:service.id,masterServiceId:service.masterServiceId||service.id,serviceName:service.name,qualificationRequirements:service.qualificationRequirements||'',rate:rateMinor/100,duration,total,currency:'ZAR',pricingModel,pricing:pricingModel==='hourly'?'Fixed hourly rate':pricingModel==='per-visit'?'Fixed price per visit':pricingModel==='daily'?'Fixed daily rate':'Fixed package price'};}
