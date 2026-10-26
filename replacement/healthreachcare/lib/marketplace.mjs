import {bankingRoles,bankingDetails,completePayoutProfile,missingPayoutEvidence,publicPayoutProfile,payoutEvidenceKinds} from './payout-banking.mjs';
import {driverAreaEligible,driverProximity} from './experience.mjs';
import { kmBetween, addressFor, serves, productKey } from './matching.mjs';
import { digest } from './completion.mjs';
import { handleBusiness } from './business.mjs';
const providerRoles = ['Pharmacy', 'Doctor', 'Homecare', 'Driver'];
const words = (v, max = 200) => { if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw Error('Complete the required information'); return v.trim(); };
const closed = r => ['Delivered', 'Collected', 'Completed'].includes(r?.status);
const accountFor = (s, id) => (s.drivers[id] ? 'driver:' : 'provider:') + id;
export function upgradeMarket(s) { if (s.marketVersion === 3)
    return false; s.marketVersion = 3; s.dispatchPolicy.allocation ??= 'Sequential'; s.matchingPolicy ??= { acceptanceMinutes: 5 }; s.promotions ??= []; s.refunds ??= []; s.payoutProfiles ??= {}; s.payoutChallenges ??= {}; s.settlementBatches ??= []; s.marketPolicy ??= { commissionBps: 0, processingBps: 0, processingFixedMinor: 0, payoutDay: 5, clearanceHours: 24, version: 1 }; for (const r of s.records)
    if (r.payment === 'Paid')
        r.feeSnapshot ??= { version: 0, commissionMinor: 0, processingMinor: 0, legacy: true }; for (const d of s.providers)
    d.publication ??= { status: ['pharmacy','doctor','homecare'].includes(d.id)&&!(s.registeredAccounts || []).some(a => a.id === d.id) ? 'Sample preview' : 'Draft', history: [] }; s.version++; return true; }
export function maintainMarket(s) { let changed = false; for (const t of s.deliveryTasks.filter(t => t.status === 'Ready for assignment' && !t.driverId)) {
    const order = s.records.find(r => r.id === t.recordId);
    if (!order || order.payment !== 'Paid' || order.status !== 'Ready for dispatch' || order.fulfilment !== 'Delivery' || order.cancellationRequested || order.exception?.status === 'Open')
        continue;
    if (s.dispatchPolicy.allocation === 'Sequential' && (!t.offeredDriverId || t.offerExpires <= Date.now())) {
        if (t.offerExpires <= Date.now() && t.offeredDriverId) {
            t.offerExcluded ??= [];
            t.offerExcluded.push(t.offeredDriverId);
        }
        const drivers = Object.values(s.drivers).filter(d => d.status === 'Approved' && s.accountControls[d.id]?.status !== 'Suspended' && d.online && driverAreaEligible(s,t,d) && (!s.applications[d.id] || s.applications[d.id].status === 'Approved') && !(t.offerExcluded || []).includes(d.id)).sort((a, b) => (driverProximity(s,t,a)??1e9)-(driverProximity(s,t,b)??1e9)||(a.lastOfferAt || 0) - (b.lastOfferAt || 0) || a.id.localeCompare(b.id));
        const candidate = drivers[0];
        if (candidate) {
            t.offeredDriverId = candidate.id;
            t.offerExpires = Date.now() + s.dispatchPolicy.offerMinutes * 60000;
            candidate.lastOfferAt = Date.now();
            t.offerHistory ??= [];
            t.offerHistory.push({ driverId: candidate.id, at: new Date().toISOString(), expires: t.offerExpires });
            s.notifications.unshift({ id: crypto.randomUUID(), recipientId: candidate.id, recordId: t.recordId, title: 'Delivery offer', message: 'Review the delivery before this offer expires.', type: 'Orders', at: new Date().toISOString(), read: false });
            changed = true;
        }
        else if (t.offeredDriverId) {
            t.offeredDriverId = null;
            changed = true;
        }
    }
} for (const r of s.records) {
    if (r.payment === 'Refunded' && r.feeSnapshot && !r.feeSnapshot.refundManaged) {
        if (r.discountMinor > 0 && !s.ledger.some(e => e.key === 'promotion-refund:' + r.id)) {
            s.ledger.push({ id: crypto.randomUUID(), key: 'promotion-refund:' + r.id, debit: 'provider:' + r.providerId, credit: 'platform:promotions', amountMinor: r.discountMinor, currency: 'ZAR', recordId: r.id, at: r.updated, reference: 'PROMO-REFUND-' + r.id.slice(0, 8), type: 'Promotion reversal', simulated: true });
            changed = true;
        }
        for (const [type, amount, debit] of [['Platform commission', r.feeSnapshot.commissionMinor, 'platform:fees'], ['Processing fee', r.feeSnapshot.processingMinor, 'processor:fees']]) {
            const key = 'fee-refund:' + type + ':' + r.id;
            if (amount > 0 && !s.ledger.some(e => e.key === key)) {
                s.ledger.push({ id: crypto.randomUUID(), key, debit, credit: 'provider:' + r.providerId, amountMinor: amount, currency: 'ZAR', recordId: r.id, reference: 'FEE-REFUND-' + r.id.slice(0, 8), at: r.updated, type: 'Fee reversal', simulated: true });
                changed = true;
            }
        }
    }
    if (r.payment !== 'Paid')
        continue;
    if (r.discountMinor > 0 && !s.ledger.some(e => e.key === 'promotion:' + r.id)) {
        s.ledger.push({ id: crypto.randomUUID(), key: 'promotion:' + r.id, debit: 'platform:promotions', credit: 'provider:' + r.providerId, amountMinor: r.discountMinor, currency: 'ZAR', recordId: r.id, at: r.updated, reference: r.promotion?.code, type: 'Platform funded promotion', simulated: true });
        const promotion = s.promotions.find(p => p.id === r.promotion?.id);
        if (promotion)
            promotion.uses++;
        changed = true;
    }
    if (!r.feeSnapshot) {
        const gross = Math.round((r.total - (r.deliveryFee || 0)) * 100) + (r.discountMinor || 0), policy = s.marketPolicy, commissionMinor = Math.round(gross * policy.commissionBps / 10000), processingMinor = Math.round(r.total * 100 * policy.processingBps / 10000) + policy.processingFixedMinor;
        if (commissionMinor + processingMinor > gross)
            throw Error('Configured fees exceed the provider service value');
        r.feeSnapshot = { version: policy.version, grossMinor: gross, commissionMinor, processingMinor, providerNetMinor: gross - commissionMinor - processingMinor, at: r.updated };
        changed = true;
    }
    for (const [type, amount, credit] of [['Platform commission', r.feeSnapshot.commissionMinor, 'platform:fees'], ['Processing fee', r.feeSnapshot.processingMinor, 'processor:fees']]) {
        const key = type + ':' + r.id;
        if (amount > 0 && !s.ledger.some(e => e.key === key)) {
            s.ledger.push({ id: crypto.randomUUID(), key, debit: 'provider:' + r.providerId, credit, amountMinor: amount, currency: 'ZAR', recordId: r.id, patientId: r.patientId, reference: 'FEE-' + r.id.slice(0, 8), at: r.updated, type, ruleVersion: r.feeSnapshot.version, simulated: true });
            changed = true;
        }
    }
} return changed; }
export function marketAvailable(s, id) { const d = s.providers.find(v => v.id === id); return !!d && s.accountControls[id]?.status !== 'Suspended' && d.status === 'Approved' && ['Published', 'Sample preview'].includes(d.publication?.status) && (!s.applications[id] || s.applications[id].status === 'Approved' && s.applications[id].checks.every(v => v.result === 'Simulated verified' && v.expiresAt > Date.now())); }
export function publicMarket(out, s, session) { if (session.role === 'Patient') {
    out.providers = out.providers.filter(d => marketAvailable(s, d.id));
    const address = addressFor(s, session.accountId);
    out.providers = out.providers.map(d => ({ ...d, distanceKm: kmBetween(d.coordinates, address), servesLocation: d.matchingEnabled ? serves(d, address) : null })).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    out.products = out.products.filter(p => marketAvailable(s, p.ownerId)).sort((a, b) => (out.providers.findIndex(d => d.id === a.ownerId)) - (out.providers.findIndex(d => d.id === b.ownerId)));
    const catalogue = new Map();
    for (const p of out.products) {
        const key = productKey(p) + '|' + p.price;
        if (!catalogue.has(key))
            catalogue.set(key, p);
    }
    if(!s.connectedAccounts)out.products = [...catalogue.values()];
} delete out.payoutChallenges; out.refunds = s.refunds.filter(v => session.role === 'Admin' || out.records.some(r => r.id === v.recordId)); out.payoutProfiles = Object.values(s.payoutProfiles).filter(v => session.role === 'Admin' || v.accountId === session.accountId).map(publicPayoutProfile); out.settlementBatches = s.settlementBatches.map(b => session.role === 'Admin' ? b : { ...b, items: b.items.filter(i => i.account === accountFor(s, session.accountId)) }).filter(b => session.role === 'Admin' || b.items.length); return out; }
export function settlementBalance(s, account, start, end) { return Math.max(0, s.ledger.reduce((n, e) => { const r = s.records.find(r => r.id === e.recordId); const eligible = r && (r.payment === 'Refunded' || closed(r) && r.payment === 'Paid' && !r.disputeOpen && !r.refundHold && Date.parse(r.updated) <= Date.now() - s.marketPolicy.clearanceHours * 3600000 && r.updated >= start && r.updated <= end); return n + (e.credit === account && (eligible || !e.recordId && e.type === 'Failed') ? e.amountMinor : 0) - (e.debit === account ? e.amountMinor : 0); }, 0)); }
export async function handleMarket(c) {
    const { s, p, session, action, check, now, id } = c, owner = session.accountId;
    const notify = (recipientId, title) => s.notifications.unshift({ id: crypto.randomUUID(), recipientId, title, message: 'Open Payments and payouts for details.', type: 'System', at: now, read: false });
    if (action === 'savePromotion') {
        check(['Admin']);
        const code = words(p.code, 30).toUpperCase();
        if (!/^[A-Z0-9-]{3,30}$/.test(code) || !Number.isInteger(p.discountMinor) || p.discountMinor < 1 || p.discountMinor > 100000 || !Number.isInteger(p.maxUses) || p.maxUses < 1 || p.maxUses > 10000 || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now())
            throw Error('Enter a valid code, discount, use limit and future expiry');
        if (s.promotions.some(v => v.code === code))
            throw Error('Promotion code already exists');
        s.promotions.push({ id, code, discountMinor: p.discountMinor, maxUses: p.maxUses, uses: 0, expiresAt: p.expiresAt, active: true, funding: 'Platform', created: now });
        return true;
    }
    if (action === 'stopPromotion') {
        check(['Admin']);
        const promotion = s.promotions.find(v => v.id === p.id);
        if (!promotion)
            throw Error('Promotion unavailable');
        promotion.active = false;
        return true;
    }
    if (action === 'checkout' && p.promoCode) {
        const promotion = s.promotions.find(v => v.code === String(p.promoCode).trim().toUpperCase());
        const subtotal = Array.isArray(p.items) ? p.items.reduce((n, i) => n + (s.products.find(v => v.id === i.id)?.price || 0) * i.quantity, 0) : 0;
        if (!promotion || !promotion.active || promotion.uses >= promotion.maxUses || Date.parse(promotion.expiresAt) <= Date.now() || promotion.discountMinor >= Math.round(subtotal * 100))
            throw Error('Promotion is unavailable or exceeds this basket value');
        p.discountMinor = promotion.discountMinor;
        p.promotion = { id: promotion.id, code: promotion.code, discountMinor: promotion.discountMinor, funding: 'Platform' };
    }
    if (action === 'checkoutPay') {
        const checkout = s.checkouts.find(v => v.id === p.id);
        if (checkout?.promotion) {
            const promotion = s.promotions.find(v => v.id === checkout.promotion.id);
            if (!promotion || !promotion.active || promotion.uses >= promotion.maxUses || Date.parse(promotion.expiresAt) <= Date.now())
                throw Error('Promotion expired or reached its limit. Review a new checkout.');
        }
    }
    if (action === 'refund' && s.refunds.some(v => v.recordId === p.id && ['Pending', 'Simulated refunded'].includes(v.status)))
        throw Error('Use the refund workflow for the remaining refundable amount');
    if (action === 'createRefund') {
        check(['Patient', 'Admin']);
        const r = s.records.find(v => v.id === p.id);
        if (!r || r.payment !== 'Paid' || session.role === 'Patient' && r.patientId !== owner)
            throw Error('Choose a paid order belonging to this account');
        const reference = words(p.reference, 80), amount = p.amountMinor, remaining = Math.round(r.total * 100) - (r.refundedMinor || 0);
        if (s.refunds.some(v => v.reference === reference))
            throw Error('Refund reference already used');
        if (s.refunds.some(v => v.recordId === r.id && v.status === 'Pending'))
            throw Error('Resolve the pending refund first');
        if (!Number.isInteger(amount) || amount <= 0 || amount > remaining)
            throw Error('Amount exceeds the remaining refundable amount');
        s.refunds.push({ id, recordId: r.id, patientId: r.patientId, amountMinor: amount, reference, reason: words(p.reason, 500), status: 'Pending', created: now, history: [{ status: 'Pending', at: now, actor: owner }] });
        r.refundHold = true;
        notify('admin', 'Refund review requested');
        return true;
    }
    if (action === 'refundOutcome') {
        check(['Admin']);
        const refund = s.refunds.find(v => v.id === p.refundId);
        if (!refund || refund.status !== 'Pending' || !['Simulated refunded', 'Failed', 'Rejected'].includes(p.status))
            throw Error('Choose a pending test refund and outcome');
        const r = s.records.find(v => v.id === refund.recordId);
        if (!r || r.payment !== 'Paid')
            throw Error('The payment is no longer refundable');
        refund.status = p.status;
        refund.history.push({ status: p.status, reason: words(p.reason, 500), at: now, actor: owner });
        r.refundHold = false;
        if (p.status === 'Simulated refunded') {
            const paid = Math.round(r.total * 100), previous = r.refundedMinor || 0, next = previous + refund.amountMinor, delivery = Math.round((r.deliveryFee || 0) * 100);
            if (next > paid)
                throw Error('Refund exceeds the original payment');
            const deliveryPart = Math.round(delivery * next / paid) - Math.round(delivery * previous / paid), providerPart = refund.amountMinor - deliveryPart;
            const add = (debit, credit, amountMinor, type) => { if (amountMinor > 0)
                s.ledger.push({ id: crypto.randomUUID(), key: 'refund:' + refund.id + ':' + type, debit, credit, amountMinor, recordId: r.id, patientId: r.patientId, reference: refund.reference, at: now, type, simulated: true }); };
            add('provider:' + r.providerId, 'processor:test', providerPart, 'Provider refund');
            if (r.discountMinor)
                add('provider:' + r.providerId, 'platform:promotions', Math.round(r.discountMinor * next / paid) - Math.round(r.discountMinor * previous / paid), 'Promotion reversal');
            add(r.status === 'Delivered' ? 'platform:refunds' : 'delivery:reserve', 'processor:test', deliveryPart, 'Delivery refund');
            if (r.feeSnapshot) {
                r.feeSnapshot.refundManaged = true;
                for (const [field, debit] of [['commissionMinor', 'platform:fees'], ['processingMinor', 'processor:fees']])
                    add(debit, 'provider:' + r.providerId, Math.round((r.feeSnapshot[field] || 0) * next / paid) - Math.round((r.feeSnapshot[field] || 0) * previous / paid), 'Refund ' + field);
            }
            r.refundedMinor = next;
            s.payments.unshift({ id: crypto.randomUUID(), recordId: r.id, amount: refund.amountMinor / 100, status: 'Simulated refund', at: now, reference: refund.reference });
            if (next === paid) {
                r.payment = 'Refunded';
                if (!closed(r) && r.stockDebited && !r.stockReleased) {
                    for (const i of r.items || []) {
                        const product = s.products.find(v => v.id === i.id);
                        if (product)
                            product.stock += i.quantity;
                    }
                    r.stockReleased = true;
                }
                for (const t of s.deliveryTasks.filter(v => v.recordId === r.id && v.status !== 'Delivered'))
                    t.status = 'Cancelled';
                if (!closed(r)) {
                    r.status = 'Cancelled';
                    r.updated = now;
                    r.history.push({ status: 'Cancelled', note: 'Full simulated refund completed', role: 'Admin', actor: session.name, at: now });
                }
            }
        }
        notify(r.patientId, 'Refund ' + p.status.toLowerCase());
        return true;
    }
    if (action === 'savePublicProfile') {
        check(['Pharmacy', 'Doctor', 'Homecare']);
        const d = s.providers.find(v => v.id === owner);
        if (!d)
            throw Error('Provider unavailable');
        const a = s.applications[owner];
        if (!a || a.status !== 'Approved')
            throw Error('Complete provider approval before preparing your public profile');
        d.name = words(p.name, 100);
        d.description = words(p.description, 1000);
        d.location = words(p.location, 250);
        d.languages = words(p.languages, 150);
        d.serviceAreas = words(p.serviceAreas, 300).split(',').map(v => v.trim()).filter(Boolean);
        d.matchingEnabled = true;
        d.openTime = p.openTime || '00:00';
        d.closeTime = p.closeTime || '23:59';
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.closeTime) || d.openTime >= d.closeTime)
            throw Error('Enter opening and closing times on the same day');
        if (p.latitude !== undefined && p.latitude !== '' || p.longitude !== undefined && p.longitude !== '') {
            const latitude = Number(p.latitude), longitude = Number(p.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
                throw Error('Enter valid provider coordinates');
            d.coordinates = { latitude, longitude };
        }
        else
            delete d.coordinates;
        d.deliveryRadiusKm = Number(p.deliveryRadiusKm || 15);
        if (!Number.isFinite(d.deliveryRadiusKm) || d.deliveryRadiusKm < 1 || d.deliveryRadiusKm > 200)
            throw Error('Enter a radius from 1 to 200 km');
        d.publication = { status: 'Draft', history: [...(d.publication?.history || []), { status: 'Draft', at: now, actor: owner }] };
        return true;
    }
    if (action === 'submitPublicProfile') {
        check(['Pharmacy', 'Doctor', 'Homecare']);
        const d = s.providers.find(v => v.id === owner), a = s.applications[owner];
        if (!d || !a || a.status !== 'Approved' || a.checks.some(v => v.result !== 'Simulated verified' || v.expiresAt <= Date.now()))
            throw Error('Current provider approval is required');
        if (!d.name || !d.description || !d.location || !d.languages)
            throw Error('Complete name, biography, location and languages');
        if (d.type === 'Doctor' && !d.professionalVerified)
            throw Error('Professional review is required');
        if (d.type === 'Pharmacy' && !s.products.some(v => v.ownerId === owner && v.active && !v.removed))
            throw Error('Add available products before submitting');
        if (d.type === 'Homecare' && !d.services?.length)
            throw Error('Configure your approved services first');
        d.publication ??= { history: [] };
        if (d.publication.status === 'Under review')
            throw Error('Profile is already under review');
        d.publication.status = 'Under review';
        d.publication.history.push({ status: 'Under review', actor: owner, at: now });
        notify('admin', 'Public profile awaiting review');
        return true;
    }
    if (action === 'reviewPublicProfile') {
        check(['Admin']);
        const d = s.providers.find(v => v.id === p.providerId), a = s.applications[p.providerId];
        if (!d || d.publication?.status !== 'Under review' || !['Published', 'Changes requested'].includes(p.status))
            throw Error('Choose a profile under review');
        if (p.status === 'Published' && (!a || a.status !== 'Approved' || a.checks.some(v => v.result !== 'Simulated verified' || v.expiresAt <= Date.now())))
            throw Error('Current provider approval is required');
        if(p.status==='Published'&&d.pendingPhotoId){d.photoId=d.pendingPhotoId;d.photoURL='/api/product-image/'+d.photoId;d.photoApproved=true;delete d.pendingPhotoId;}d.publication.status = p.status;
        d.publication.history.push({ status: p.status, reason: words(p.reason, 500), actor: owner, at: now });
        notify(d.id, 'Public profile ' + p.status.toLowerCase());
        return true;
    }
    if (action === 'declineDeliveryOffer') {
        check(['Driver']);
        const t = s.deliveryTasks.find(v => v.id === p.taskId);
        if (!t || t.driverId || t.status !== 'Ready for assignment' || s.dispatchPolicy.allocation !== 'Sequential' || t.offeredDriverId !== owner)
            throw Error('No current delivery offer for this account');
        t.offerExcluded ??= [];
        t.offerExcluded.push(owner);
        t.offeredDriverId = null;
        t.offerExpires = Date.now();
        return true;
    }
    if (action === 'payoutChallenge') {
        check(providerRoles);
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
        s.payoutChallenges[owner] = { hash: await digest(owner + ':' + code), expires: Date.now() + 300000, attempts: 0 };
        c.extra.payoutChallenge = code;
        return true;
    }
    if (action === 'savePayoutProfile'||action==='savePayoutDraft') {
        check(providerRoles);
        const challenge = s.payoutChallenges[owner];
        if (!challenge || challenge.expires < Date.now() || challenge.attempts >= 5)
            throw Error('Request a fresh payout change challenge');
        if (await digest(owner + ':' + p.code) !== challenge.hash) {
            challenge.attempts++;
            c.status = 400;
            c.extra.error = 'Incorrect payout challenge';
            return true;
        }
        if(p.accountId&&p.accountId!==owner)throw Error('Only your own payout details can be changed');
        if(p.accountNumber!==undefined)throw Error('Real account numbers are not accepted in this demo. Use a TEST reference.');
        const previous=s.payoutProfiles[owner],rich=bankingRoles.includes(session.role),draft=action==='savePayoutDraft';
        if(draft&&!rich)throw Error('Draft banking setup is not available for this role');
        const reference=typeof p.testAccountReference==='string'?p.testAccountReference.trim():'';
        if(reference&&!/^TEST-[A-Z0-9]{4,20}$/.test(reference)||!reference&&!(p.useSavedAccount===true&&previous?.fingerprint)&&!draft)throw Error('Only TEST-prefixed fictional account references are permitted');
        if(p.acknowledged!==true)throw Error('Acknowledge the test payout terms');
        const banking=rich?bankingDetails(p.banking,!draft):undefined;
        const field=(value,max)=>{if(!draft)return words(value,max);if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw Error('Check bank name and account holder');return value.trim();};
        const beneficiary=field(p.beneficiary,100),bank=field(p.bank,100),fingerprint=reference?await digest(reference):p.useSavedAccount===true?previous?.fingerprint:undefined;
        const changed=!previous||JSON.stringify(previous.banking)!==JSON.stringify(banking)||previous.beneficiary!==beneficiary||previous.bank!==bank||previous.fingerprint!==fingerprint;
        const revision=(previous?.revision||0)+(changed?1:0),changedFields=[...(previous?.beneficiary!==beneficiary?['account holder']:[]),...(previous?.bank!==bank?['bank name']:[]),...(previous?.fingerprint!==fingerprint?['masked account reference']:[]),...Object.keys(banking||{}).filter(key=>previous?.banking?.[key]!==banking[key])];
        const profile={accountId:owner,beneficiary,bank,banking,maskedAccount:reference?'TEST-••••'+reference.slice(-4):fingerprint?previous.maskedAccount:'Not provided',fingerprint,status:draft?'Incomplete':'Pending verification',schedule:'Weekly',payoutDay:s.marketPolicy.payoutDay,updated:now,revision,evidenceRequests:previous?.evidenceRequests||[],history:[...(previous?.history||[])]};
        if(!draft&&rich&&missingPayoutEvidence(s,profile,revision).length)throw Error('Upload the requested evidence for these payout details before submitting. Save an incomplete setup first if details changed.');
        profile.history.push({status:profile.status,at:now,actor:owner,reason:draft?'Banking setup saved; not submitted':'Explicitly submitted for simulated payout review',revision,changedFields});
        s.payoutProfiles[owner]=profile;
        delete s.payoutChallenges[owner];
        if(!draft)notify('admin', 'Payout details awaiting review');
        return true;
    }
    if (action === 'reviewPayoutProfile') {
        check(['Admin']);
        const profile = s.payoutProfiles[p.accountId];
        if (!profile || !['Simulated verified', 'Rejected','Action required'].includes(p.status))
            throw Error('Choose payout details and a review outcome');
        if(profile.status!=='Pending verification')throw Error('Only submitted payout details can be reviewed');
        const role=s.providers.find(v=>v.id===p.accountId)?.type;if(p.status==='Simulated verified'&&bankingRoles.includes(role)&&(!completePayoutProfile(profile)||missingPayoutEvidence(s,profile).length))throw Error('Complete the setup and requested evidence before simulated verification');
        const reason=words(p.reason,500);profile.reviewReason=reason;profile.updated=now;
        profile.status = p.status;
        profile.history.push({ status: p.status, reason: words(p.reason, 500), at: now, actor: owner });
        notify(p.accountId, 'Payout details updated');
        return true;
    }
    if(action==='requestPayoutEvidence'){
        check(['Admin']);const profile=s.payoutProfiles[p.accountId];if(!profile||!bankingRoles.includes(s.providers.find(v=>v.id===p.accountId)?.type))throw Error('Choose a provider payout setup');
        const reason=words(p.reason,500);if(!Array.isArray(p.kinds)||!p.kinds.length||p.kinds.some(kind=>!Object.hasOwn(payoutEvidenceKinds,kind)))throw Error('Select the specific evidence needed');
        profile.evidenceRequests=[...new Set(p.kinds)].map(kind=>({kind,required:true,reason,requestedAt:now}));profile.status='Action required';profile.reviewReason=reason;profile.updated=now;profile.history.push({status:'Action required',reason,at:now,actor:owner,revision:profile.revision});notify(p.accountId,'Payout evidence requested');return true;
    }
    if (action === 'saveMarketPolicy') {
        check(['Admin']);
        for (const [key, max] of [['commissionBps', 5000], ['processingBps', 2000], ['processingFixedMinor', 10000], ['clearanceHours', 720], ['payoutDay', 6]])
            if (!Number.isInteger(p[key]) || p[key] < 0 || p[key] > max)
                throw Error('Enter valid policy values');
        s.marketPolicy = { ...s.marketPolicy, ...Object.fromEntries(['commissionBps', 'processingBps', 'processingFixedMinor', 'clearanceHours', 'payoutDay'].map(k => [k, p[k]])), version: s.marketPolicy.version + 1 };
        return true;
    }
    if (action === 'draftWeeklySettlement') {
        check(['Admin']);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end) || p.start > p.end || Date.parse(p.end + 'T23:59:59+02:00') > Date.now())
            throw Error('Choose a completed settlement period');
        const reference = words(p.reference, 80);
        if (s.settlementBatches.some(b => b.reference === reference))
            throw Error('Settlement reference already exists');
        const start = new Date(p.start + 'T00:00:00.000+02:00').toISOString(), end = new Date(p.end + 'T23:59:59.999+02:00').toISOString();if(Date.parse(end)-Date.parse(start)>7*86400000)throw Error('Use a settlement period of up to one week');
        const items = Object.values(s.payoutProfiles).filter(v => v.status === 'Simulated verified').map(v => ({ account: accountFor(s, v.accountId), accountId: v.accountId, amountMinor: settlementBalance(s, accountFor(s, v.accountId), start, end), maskedAccount: v.maskedAccount,profileVersion:v.updated })).filter(v => v.amountMinor > 0);
        if (!items.length)
            throw Error('No cleared completed-work balances with verified payout details in this period');
        s.settlementBatches.push({ id, reference, start, end,periodStart:p.start,periodEnd:p.end,timeZone:'Africa/Johannesburg', status: 'Draft', items, history: [{ status: 'Draft', at: now, actor: owner }], policyVersion: s.marketPolicy.version });
        return true;
    }
    if (action === 'advanceWeeklySettlement') {
        check(['Admin']);
        const batch = s.settlementBatches.find(v => v.id === p.id);
        const next = { Draft: 'Reviewed', Reviewed: 'Approved', Approved: 'Initiated' }[batch?.status];
        if (!next || p.status !== next)
            throw Error('Follow draft, review, approval and initiation in order');
        const reason = words(p.reason, 500);
        if (next === 'Reviewed' || next === 'Initiated')
            for (const item of batch.items) {
                if (s.payoutProfiles[item.accountId]?.status !== 'Simulated verified' || s.payoutProfiles[item.accountId]?.maskedAccount !== item.maskedAccount || s.payoutProfiles[item.accountId]?.updated !== item.profileVersion || settlementBalance(s, item.account, batch.start, batch.end) < item.amountMinor)
                    throw Error('Reconciliation changed; create a fresh settlement draft');
            }
        if (next === 'Initiated') {
            for (const [i, item] of batch.items.entries()) {
                const payoutId = crypto.randomUUID();
                await handleBusiness({ ...c, id: payoutId, action: 'createPayout', p: { account: item.account, amountMinor: item.amountMinor, reference: batch.reference + '-' + i } });
                item.payoutId = payoutId;
                notify(item.accountId, 'Test settlement initiated');
            }
        }
        batch.status = next;
        batch.history.push({ status: next, reason, at: now, actor: owner });
        return true;
    }
    if (action === 'refreshWeeklySettlement') {
        check(['Admin']);
        const batch = s.settlementBatches.find(v => v.id === p.id);
        if (!batch || !['Initiated', 'Completed with failures'].includes(batch.status))
            throw Error('Initiate the settlement first');
        const payouts = batch.items.map(i => s.payouts.find(v => v.id === i.payoutId));
        if (payouts.some(v => !v || v.status === 'Pending'))
            throw Error('Record an outcome for every payout first');
        batch.status = payouts.some(v => v.status === 'Failed') ? 'Completed with failures' : 'Simulated completed';
        batch.history.push({ status: batch.status, at: now, actor: owner });
        return true;
    }
    return false;
}
