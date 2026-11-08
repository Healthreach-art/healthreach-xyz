import {bankingRoles,bankingDetails,completePayoutProfile,missingPayoutEvidence,publicPayoutProfile,payoutEvidenceKinds} from './payout-banking.mjs';
import {driverAreaEligible,driverProximity} from './experience.mjs';
import { kmBetween, addressFor, serves, productKey, openNow, maximumPharmacistDispensingFee } from './matching.mjs';
import { digest } from './completion.mjs';
import { handleBusiness } from './business.mjs';
import { hasPatientBookableHomecareOffer } from './homecare-marketplace.mjs';
import { refreshConnectedPublication } from './service-categories.mjs';
import { medicineStarterCatalogue } from './medicine-starter-catalogue.mjs';
const providerRoles = ['Pharmacy', 'Doctor', 'Homecare', 'Driver'];
const words = (v, max = 200) => { if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw Error('Complete the required information'); return v.trim(); };
const closed = r => ['Delivered', 'Collected', 'Completed'].includes(r?.status);
const accountFor = (s, id) => (s.drivers[id] ? 'driver:' : 'provider:') + id;
export const defaultMedicineCategories = Object.freeze([
    { id: 'pain-relief', name: 'Pain relief', color: 'rose', active: true },
    { id: 'cold-flu', name: 'Cold & flu', color: 'sky', active: true },
    { id: 'allergy', name: 'Allergy', color: 'violet', active: true },
    { id: 'digestive-health', name: 'Digestive health', color: 'amber', active: true },
    { id: 'vitamins', name: 'Vitamins & supplements', color: 'yellow', active: true },
    { id: 'skin-care', name: 'Skin care', color: 'pink', active: true },
    { id: 'first-aid', name: 'First aid', color: 'red', active: true },
    { id: 'oral-care', name: 'Oral care', color: 'cyan', active: true },
    { id: 'eye-ear-care', name: 'Eye & ear care', color: 'indigo', active: true },
    { id: 'baby-family-care', name: 'Baby & family care', color: 'green', active: true },
    { id: 'womens-health', name: "Women's health", color: 'pink', active: true }
]);
export function upgradeMarket(s) {
    const previous = Number(s.marketVersion) || 0;
    if (previous >= 8) return false;
    // Add the current patient taxonomy without replacing administrator-created
    // categories or reactivating categories that an administrator archived.
    s.medicineCategories ??= [];
    const knownCategoryIds = new Set(s.medicineCategories.map(category => category.id));
    for (const category of defaultMedicineCategories) if (!knownCategoryIds.has(category.id)) s.medicineCategories.push(structuredClone(category));
    if (previous < 3) {
        s.dispatchPolicy.allocation ??= 'Sequential'; s.matchingPolicy ??= { acceptanceMinutes: 5 }; s.promotions ??= []; s.refunds ??= []; s.payoutProfiles ??= {}; s.payoutChallenges ??= {}; s.settlementBatches ??= []; s.marketPolicy ??= { commissionBps: 0, processingBps: 0, processingFixedMinor: 0, payoutDay: 5, clearanceHours: 24, version: 1 };
        for (const r of s.records) if (r.payment === 'Paid') r.feeSnapshot ??= { version: 0, commissionMinor: 0, processingMinor: 0, legacy: true };
        for (const d of s.providers) d.publication ??= { status: ['pharmacy','doctor','homecare'].includes(d.id)&&!(s.registeredAccounts || []).some(a => a.id === d.id) ? 'Sample preview' : 'Draft', history: [] };
    }
    // Existing listings become one shared app price only where all current
    // branches agree. Conflicting prices require an administrator decision.
    s.medicineCatalogue ??= {};
    if (previous < 8) for (const candidate of medicineStarterCatalogue) {
        const key = productKey(candidate);
        if (!s.medicineCatalogue[key]) s.medicineCatalogue[key] = { ...candidate, productKey: key, status: 'Needs review', createdAt: new Date().toISOString(), history: [], sourceNote: 'Department of Health price database · review candidate only' };
    }
    const groups = new Map();
    for (const product of s.products || []) if (!product.removed) { const key=productKey(product); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(product); }
    for (const [key, products] of groups) {
        let shared=s.medicineCatalogue[key];
        const prices=[...new Set(products.map(v=>Number(v.price)).filter(v=>Number.isFinite(v)&&v>0))];
        if(!shared){shared=prices.length===1?{productKey:key,name:products[0].name,strength:products[0].strength||'',form:products[0].form||'',packageSize:products[0].packageSize||'',requiresPrescription:products.some(v=>v.requiresPrescription),price:prices[0],status:'Published',createdAt:new Date().toISOString(),history:[]}:{productKey:key,name:products[0].name,strength:products[0].strength||'',form:products[0].form||'',packageSize:products[0].packageSize||'',requiresPrescription:products.some(v=>v.requiresPrescription),price:null,status:'Needs review',createdAt:new Date().toISOString(),history:[]};s.medicineCatalogue[key]=shared;}
        shared.requiresPrescription=!!shared.requiresPrescription||products.some(v=>v.requiresPrescription);
        for(const product of products){product.catalogueStatus=shared.status==='Published'?'Published':'Pending review';product.requiresPrescription=shared.requiresPrescription;if(shared.status==='Published')product.price=shared.price;}
    }
    s.medications_public ??= {};
    for (const [key, shared] of Object.entries(s.medicineCatalogue)) {
        const branches = groups.get(key) || [];
        if (shared.status !== 'Published' || shared.priceModel !== 'branch' && (!Number.isFinite(shared.price) || shared.price <= 0) || !branches.length) continue;
        const first = branches[0];
        s.medications_public[key] = {
            productKey: key, name: shared.name || first.name, strength: shared.strength || first.strength || '',
            form: shared.form || first.form || '', packageSize: shared.packageSize || first.packageSize || '',
            description: shared.description || first.description || '', category: shared.category || first.category || 'Other',
            image: shared.image || first.image || '', price: shared.price, priceModel:shared.priceModel||'legacy-shared',schedule:shared.schedule||'',activeIngredient:shared.activeIngredient||'',brand:shared.brand||'',registeredProductId:shared.registeredProductId||'',officialSource:shared.officialSource||'',priceDataDate:shared.priceDataDate||'',
            requiresPrescription: !!shared.requiresPrescription || branches.some(v => v.requiresPrescription),
            status: 'Published', updatedAt: shared.reviewedAt || shared.createdAt || new Date().toISOString()
        };
    }
    s.marketVersion = 8; s.version++; return true;
}
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
            t.offerExpires = Date.now() + 90000;
            t.offerDurationSeconds = 90;
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
        const platformMedicineFee=r.type==='Order'?Number(r.feeBreakdown?.platformFeeMinor||0)+Number(r.feeBreakdown?.platformVatMinor||0):0;
        const gross = Math.round((r.total - (r.deliveryFee || 0)) * 100) - platformMedicineFee + (r.discountMinor || 0), policy = s.marketPolicy, commissionMinor = Math.round(gross * policy.commissionBps / 10000), processingMinor = Math.round(r.total * 100 * policy.processingBps / 10000) + policy.processingFixedMinor;
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
export function marketAvailable(s, id) { const d = s.providers.find(v => v.id === id), homecareOfferReady=d?.type==='Homecare'&&hasPatientBookableHomecareOffer(d),accountControl=s.accountControls?.[id],application=s.applications?.[id]; return !!d && accountControl?.status !== 'Suspended' && d.status === 'Approved' && (homecareOfferReady || ['Published', 'Sample preview'].includes(d.publication?.status)) && (!application || application.status === 'Approved' && application.checks.every(v => v.result === 'Simulated verified' && v.expiresAt > Date.now())); }
export function publicMarket(out, s, session) {
    out.medicinePricing={platformFeeBps:Number.isInteger(s.medicinePricing?.platformFeeBps)?s.medicinePricing.platformFeeBps:1200,vatRegistered:s.medicinePricing?.vatRegistered===true,platformVatBps:s.medicinePricing?.vatRegistered===true?1500:0};
    out.medicineCategories = (s.medicineCategories || defaultMedicineCategories)
        .filter(category => session.role === 'Admin' || category.active !== false && category.status !== 'Pending')
        .map(category => ({ id: category.id, name: category.name, color: category.color || 'green', active: category.active !== false, status: category.status || 'Published' }));
    if (session.role === 'Admin') out.medicineCategorySuggestions = (s.medicineCategorySuggestions || []).filter(value => value.status === 'Pending');
    if (['Pharmacy','Admin'].includes(session.role)) { const keys=new Set([...Object.keys(s.medicineCatalogue||{}),...(s.products||[]).filter(p=>!p.removed).map(productKey)]);out.medicineCatalogue=[...keys].map(key=>{const item=s.medicineCatalogue?.[key],branches=(s.products||[]).filter(p=>!p.removed&&productKey(p)===key),suggestions=[...new Set([...branches.map(p=>Number(p.suggestedPrice??p.price)),Number(item?.suggestedPrice)].filter(v=>Number.isFinite(v)&&v>0))].sort((a,b)=>a-b);return {productKey:key,name:item?.name||branches[0]?.name||'',strength:item?.strength||branches[0]?.strength||'',form:item?.form||branches[0]?.form||'',packageSize:item?.packageSize||branches[0]?.packageSize||'',category:item?.category||branches[0]?.category||'Other',price:item?.status==='Published'?item.price:null,priceModel:item?.priceModel||'shared',schedule:item?.schedule||'',activeIngredient:item?.activeIngredient||'',brand:item?.brand||'',registeredProductId:item?.registeredProductId||'',officialSource:item?.officialSource||'',priceDataDate:item?.priceDataDate||'',status:item?.status||'Needs review',branchCount:branches.length,suggestedMin:session.role==='Admin'?suggestions[0]??null:null,suggestedMax:session.role==='Admin'?suggestions.at(-1)??null:null};}); }
    if (session.role === 'Patient') {
    out.providers = out.providers.filter(d => marketAvailable(s, d.id));
    const address = addressFor(s, session.accountId);
    out.providers = out.providers.map(d => ({ ...d, distanceKm: kmBetween(d.coordinates, address), servesLocation: d.matchingEnabled ? serves(d, address) : null })).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    if (s.connectedAccounts) {
        // Patient discovery receives the shared catalogue projection, never branch
        // inventory rows. Branch stock is used only to determine availability and
        // to produce a small public location/hours summary.
        const visibleProviders = new Map(out.providers.filter(d => d.type === 'Pharmacy').map(d => [d.id, d]));
        const keys = new Set(Object.keys(s.medications_public || {}));
        out.products = [...keys].flatMap(key => {
            const shared = s.medications_public?.[key];
            if (shared?.status !== 'Published' || shared.priceModel !== 'branch' && (!Number.isFinite(shared.price) || shared.price <= 0)) return [];
            const rows = (s.products || []).filter(p => productKey(p) === key && p.active && !p.removed && p.stock > 0 && p.catalogueStatus !== 'Pending review' && marketAvailable(s, p.ownerId));
            const branches = rows.map(p => {
                const d = visibleProviders.get(p.ownerId);
                if (!d) return null;
                return { id: d.id, name: d.name, location: d.location || '', openNow: d.openNow ?? openNow(d, out.serverTime), distanceKm: d.distanceKm, weeklyHours: d.weeklyHours || [], openTime: d.openTime || '', closeTime: d.closeTime || '', collection: d.collection === true, stockAvailable: true, price:p.priceModel==='branch'?p.price:shared.price, dispensingFee:p.priceModel==='SEP'?Number(d.dispensingFee||0):0, dispensingVat:p.priceModel==='SEP'&&d.vatRegistered===true?Math.round(Number(d.dispensingFee||0)*15)/100:0, vatRegistered:d.vatRegistered===true, deliveryFee:d.deliveryFee??s.platformDelivery?.fee??d.fee, stock:p.stock, priceValid:p.priceModel!=='SEP'||Number(d.dispensingFee||0)<=maximumPharmacistDispensingFee(shared.price)+0.0001, requiresPrescription:!!(shared.requiresPrescription||p.requiresPrescription) };
            }).filter(Boolean).sort((a, b) => Number(b.openNow === true) - Number(a.openNow === true) || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.id.localeCompare(b.id));
            const canonical = rows[0];
            if (!canonical || !branches.length) return [];
            const preferred=branches.find(v=>v.openNow&&v.stockAvailable)||branches.find(v=>v.stockAvailable)||branches[0];
            return [{
                id: `shared-medicine:${key}`, productKey: key, name: shared.name || canonical.name,
                description: shared.description || canonical.description || '', category: shared.category || canonical.category || 'Other',
                strength: shared.strength || canonical.strength || '', form: shared.form || canonical.form || '',
                packageSize: shared.packageSize || canonical.packageSize || '', price: shared.priceModel==='branch'?preferred.price:shared.price, priceModel:shared.priceModel||'legacy-shared',schedule:shared.schedule||'',activeIngredient:shared.activeIngredient||'',brand:shared.brand||'',registeredProductId:shared.registeredProductId||'',
                active: true, removed: false, availableAtBranch: true, branchCount: branches.length,
                branches, requiresPrescription: !!shared.requiresPrescription,
                image: shared.image || canonical.image || '', imageIds: undefined
            }];
        });
        // Patient records and open checkouts must use the public medicine key too;
        // never return a pharmacy's private inventory row ID to another account.
        const publicId = id => {
            const product = (s.products || []).find(v => v.id === id);
            return product ? `shared-medicine:${productKey(product)}` : id;
        };
        for (const record of out.records || []) if (Array.isArray(record.items)) record.items = record.items.map(item => ({ ...item, id: publicId(item.id) }));
        for (const checkout of out.checkouts || []) if (Array.isArray(checkout.items)) checkout.items = checkout.items.map(item => ({ ...item, id: publicId(item.id) }));
    } else {
        const catalogue = new Map();
        for (const p of out.products.filter(p => marketAvailable(s, p.ownerId)).sort((a, b) => (out.providers.findIndex(d => d.id === a.ownerId)) - (out.providers.findIndex(d => d.id === b.ownerId)))) {
            const key = productKey(p);
            if (!catalogue.has(key)) catalogue.set(key, p);
        }
        out.products = [...catalogue.values()];
    }
} delete out.payoutChallenges; out.refunds = (s.refunds||[]).filter(v => session.role === 'Admin' || (out.records||[]).some(r => r.id === v.recordId)); out.payoutProfiles = Object.values(s.payoutProfiles||{}).filter(v => session.role === 'Admin' || v.accountId === session.accountId).map(publicPayoutProfile); out.settlementBatches = (s.settlementBatches||[]).map(b => session.role === 'Admin' ? b : { ...b, items: b.items.filter(i => i.account === accountFor(s, session.accountId)) }).filter(b => session.role === 'Admin' || b.items.length); return out; }
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
        if (d.type !== 'Pharmacy' && (!a || a.status !== 'Approved'))
            throw Error('Complete provider approval before preparing this public profile');
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
        const submittedLatitude=p.latitude??p.coordinates?.latitude,submittedLongitude=p.longitude??p.coordinates?.longitude;
        if(d.type==='Pharmacy'){
            const latitude=Number(submittedLatitude),longitude=Number(submittedLongitude);
            if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -34.45||latitude > -33.45||longitude < 18.15||longitude > 19.15)
                throw Error('Choose a real Cape Town address suggestion or use current location so the pharmacy can be listed.');
        }
        if (submittedLatitude !== undefined && submittedLatitude !== '' || submittedLongitude !== undefined && submittedLongitude !== '') {
            const latitude = Number(submittedLatitude), longitude = Number(submittedLongitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
                throw Error('Enter valid provider coordinates');
            d.coordinates = { latitude, longitude };
        }
        else
            delete d.coordinates;
        d.deliveryRadiusKm = Number(p.deliveryRadiusKm || 15);
        if (!Number.isFinite(d.deliveryRadiusKm) || d.deliveryRadiusKm < 1 || d.deliveryRadiusKm > 200)
            throw Error('Enter a radius from 1 to 200 km');
        const previousStatus=d.publication?.status;
        d.publication = { ...d.publication, status: d.type==='Pharmacy'&&a?.status==='Approved'?'Published':'Draft', history: [...(d.publication?.history || []), { status: d.type==='Pharmacy'&&a?.status==='Approved'?'Published':'Draft', at: now, actor: owner }] };
        if(d.type==='Doctor'){
            refreshConnectedPublication(d);
            if(d.publication.status==='Published'&&previousStatus!=='Published'){
                d.publication.history.push({status:'Published',at:now,actor:owner,reason:'Automatically published after account approval and complete professional profile'});
                notify(d.id,'Doctor profile published after professional approval and profile completion');
            }
        }
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
        if(d.type==='Doctor'){
            refreshConnectedPublication(d);
            if(d.publication.status!=='Published')throw Error('Complete the approved Cape Town practice profile, enable appointment requests, add a priced service and consultation type. Your profile does not need appointment slots to appear; a valid slot is required to book.');
            return true;
        }
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
