import {kmBetween} from './matching.mjs';
import {validMapPoint} from './map-location.mjs';
import {homecareServiceCategories} from './service-categories.mjs';
export const companyCareActions=['saveHomecareDiscounts','saveHomecarePolicy','saveHomecareService','archiveHomecareService','companyHomecareBook','companyHomecarePay','assignHomecareStaff','companyHomecareProgress','recordHomecarePayout'];
export const carePolicy=s=>s.homecarePolicy||{mode:'company',managerId:null,centre:null,radiusKm:60,twoDiscountBps:0,threeDiscountBps:0};
export const companyStaff=(s,id)=>s.providers.some(d=>d.id===id&&d.type==='Homecare'&&d.status==='Approved');
const text=(v,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Complete the required information.');return v.trim();};
const cents=v=>{if(!Number.isFinite(v)||v<0||v>1000000)throw Error('Enter a valid amount.');return Math.round(v*100);};
export function companyManager(s){const d=s.providers.find(d=>d.id===carePolicy(s).managerId&&d.type==='Homecare'&&d.status==='Approved');if(!d)throw Error('HealthReachCare Homecare management has not been configured. Contact support.');return d;}
export function companyCarePrice(s,p){
 const d=companyManager(s),ids=p.serviceIds;if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length)throw Error('Select one or more different care services.');
 const duration=Number(p.duration);if(![1,2,4,8].includes(duration))throw Error('Select 1, 2, 4 or 8 hours.');
 const items=ids.map(id=>{const v=d.services?.find(x=>x.id===id&&x.active!==false&&!x.archived);if(!v||!Number.isFinite(v.staffRate)||v.rate<=0)throw Error('A selected service is not published with an approved price and staff fee.');return {id:v.id,name:v.name,rateMinor:cents(v.rate),staffRateMinor:cents(v.staffRate),duration};});
 const subtotalMinor=items.reduce((n,v)=>n+v.rateMinor*duration,0),staffPayableMinor=items.reduce((n,v)=>n+v.staffRateMinor*duration,0),policy=carePolicy(s),bps=ids.length>=3?policy.threeDiscountBps:ids.length===2?policy.twoDiscountBps:0;
 const discountMinor=Math.round(subtotalMinor*bps/10000),totalMinor=subtotalMinor-discountMinor;
 // Existing platform/processor fees also come out of the company margin.
 const costs=Math.round(subtotalMinor*(s.marketPolicy?.commissionBps||0)/10000)+Math.round(totalMinor*(s.marketPolicy?.processingBps||0)/10000)+(s.marketPolicy?.processingFixedMinor||0);
 if(totalMinor<staffPayableMinor+costs)throw Error('This discount would exceed the company margin. Management must correct the pricing before booking.');
 return {items,duration,subtotalMinor,discountMinor,totalMinor,staffPayableMinor,companyMarginMinor:totalMinor-staffPayableMinor-costs,total:totalMinor/100,currency:'ZAR',pricing:'Company fixed hourly rates',policyVersion:policy.updatedAt||'initial'};
}
function schedule(s,p){const start=Date.parse(p.date+'T'+p.time+':00+02:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time||'')||!Number.isFinite(start)||start<=Date.now())throw Error('Choose a future date and time in South Africa.');if(!validMapPoint(p.addressDetails)||!validMapPoint(carePolicy(s).centre))throw Error('Confirm the service address location before payment.');if(kmBetween(p.addressDetails,carePolicy(s).centre)>carePolicy(s).radiusKm)throw Error('This service address is outside our 60 km Cape Town coverage area.');return start;}
export function handleCompanyCare(c){
 const {s,p,action,session,check,now,id,event}=c;if(!companyCareActions.includes(action))return false;
 const notify=(r,title)=>{for(const recipientId of new Set([r.patientId,r.providerId,...(c.adminRecipientIds||[]),...(r.careStaffId?[r.careStaffId]:[])]))if(recipientId)s.notifications.unshift({id:crypto.randomUUID(),recordId:r.id,recipientId,title,message:r.status,type:'Bookings',at:now,read:false});};
 const management=()=>{check(['Admin','Homecare']);if(session.role!=='Admin'&&(session.accountId!==carePolicy(s).managerId||!companyStaff(s,session.accountId)))throw Error('Company Homecare management permission is required.');};
 if(action==='saveHomecareDiscounts'){management();const policy=carePolicy(s);for(const key of ['twoDiscountBps','threeDiscountBps'])if(!Number.isInteger(p[key])||p[key]<0||p[key]>10000)throw Error('Discount must be between 0 and 100 percent.');s.homecarePolicy={...policy,twoDiscountBps:p.twoDiscountBps,threeDiscountBps:p.threeDiscountBps,updatedAt:now,updatedBy:session.accountId};return true;}
 if(action==='saveHomecarePolicy'){check(['Admin']);if(!companyStaff(s,p.managerId)||!validMapPoint(p.centre))throw Error('Choose an approved Homecare manager and the actual service centre coordinates.');for(const key of ['twoDiscountBps','threeDiscountBps'])if(!Number.isInteger(p[key])||p[key]<0||p[key]>10000)throw Error('Discount must be between 0 and 100 percent.');s.homecarePolicy={mode:'company',managerId:p.managerId,centre:{latitude:p.centre.latitude,longitude:p.centre.longitude},radiusKm:60,twoDiscountBps:p.twoDiscountBps,threeDiscountBps:p.threeDiscountBps,updatedAt:now,updatedBy:session.accountId};return true;}
 if(['saveHomecareService','archiveHomecareService'].includes(action)){management();const d=companyManager(s);d.services??=[];const old=d.services.find(v=>v.id===p.id);if(action==='archiveHomecareService'){if(!old)throw Error('Service not found.');old.active=false;old.archived=true;old.updatedAt=now;return true;}if(p.id&&!old)throw Error('Service not found.');if(!homecareServiceCategories.some(v=>v.name===p.category))throw Error('Choose an existing care category.');const rate=cents(p.rate),staff=cents(p.staffRate);if(rate<=0||staff>rate)throw Error('Patient price must cover the agreed staff fee.');const item={id:old?.id||id,name:text(p.name,100),description:text(p.description,500),category:p.category,rate:rate/100,staffRate:staff/100,active:p.active===true,archived:false,updatedAt:now};if(old)Object.assign(old,item);else d.services.push(item);return true;}
 if(action==='companyHomecareBook'){
  check(['Patient']);if(!c.demoPayments)throw Error('Payment is not enabled.');const key=text(p.requestKey,100),prior=s.records.find(r=>r.patientId===session.accountId&&r.companyBooking&&r.bookingKey===key);
  const fingerprint=JSON.stringify({ids:p.serviceIds,date:p.date,time:p.time,duration:Number(p.duration),address:p.addressDetails});if(prior){if(prior.bookingFingerprint!==fingerprint)throw Error('This booking reference belongs to different care details.');c.extra.bookingId=prior.id;return true;}
  const price=companyCarePrice(s,p);schedule(s,p);if(price.total!==p.expectedTotal)throw Error('Prices changed. Review the current total.');const manager=companyManager(s),r={id,type:'Homecare',companyBooking:true,providerId:manager.id,patientId:session.accountId,patientName:s.profiles[session.accountId]?.name,patientEmail:s.profiles[session.accountId]?.email,title:price.items.map(i=>i.name).join(' + '),date:p.date,time:p.time,duration:price.duration,address:text(p.addressDetails.formatted,600),addressDetails:structuredClone(p.addressDetails),requirements:text(p.requirements||'No additional requirements',1000),priceSnapshot:price,total:price.total,payment:'Unpaid',created:now,updated:now,history:[],bookingKey:key,bookingFingerprint:fingerprint,holdExpires:Date.now()+600000,reservationActive:true,details:p.date+' at '+p.time+' · '+price.duration+' hours'};event(r,'Awaiting payment','Fixed company price saved for demo checkout.');s.records.unshift(r);c.extra.bookingId=id;return true;
 }
 const r=s.records.find(v=>v.id===p.id&&v.companyBooking);if(!r||!c.canAccess(r))throw Error('Booking unavailable.');
 if(action==='companyHomecarePay'){
  check(['Patient']);if(!c.demoPayments||r.patientId!==session.accountId)throw Error('Payment is not available.');if(r.payment==='Paid'){c.extra.bookingId=r.id;return true;}if(r.status!=='Awaiting payment'||r.holdExpires<=Date.now())throw Error('Booking review expired. Review the care details again.');companyManager(s);schedule(s,r);if(p.expectedTotal!==r.total||!['Success','Failure','Cancel'].includes(p.scenario))throw Error('Review the saved total and payment outcome.');
  s.payments.unshift({id,recordId:r.id,amount:r.total,amountMinor:Math.round(r.total*100),currency:'ZAR',status:p.scenario==='Success'?'Paid':p.scenario==='Failure'?'Failed':'Cancelled',simulated:true,environment:'demo-payment',provider:'internal-simulator',reference:'DEMO-'+id,at:now});
  if(p.scenario==='Success'){r.payment='Paid';r.simulated=true;r.paymentMode='Demo payment';r.staffPayableMinor=r.priceSnapshot.staffPayableMinor;event(r,'Booking confirmed','Demo payment successful; no real charge.');notify(r,'Homecare booking confirmed');}c.extra.bookingId=r.id;return true;
 }
 if(action==='recordHomecarePayout'){
  management();
  if(r.payment!=='Paid'||r.simulated===true||r.paymentMode==='Demo payment')throw Error('Cannot record a real payout against a simulated or unpaid customer transaction.');
  if(r.status!=='Completed')throw Error('Complete the care visit before recording its payout.');
  if(!r.careStaffId)throw Error('Assign an approved caregiver before recording payout.');
  if(r.payout?.status==='Paid')throw Error('This booking already has a recorded payout. Review the existing reference.');
  const amountMinor=r.staffPayableMinor??r.priceSnapshot?.staffPayableMinor;
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw Error('An agreed caregiver fee snapshot is required.');
  if(p.amountMinor!==amountMinor)throw Error('The transfer amount must match the agreed caregiver fee.');
  const reference=text(p.reference,100),evidence=text(p.evidence,300);
  if((s.records||[]).some(x=>x.id!==r.id&&x.payout?.reference===reference))throw Error('This transfer reference is already used on another booking.');
  if(p.confirmedTransfer!==true)throw Error('Confirm that the bank transfer actually occurred.');
  r.payout={id,recordId:r.id,recipientId:r.careStaffId,amountMinor,currency:'ZAR',status:'Paid',reference,evidence,paidAt:now,recordedBy:session.accountId,method:'External bank transfer recorded manually',verification:'Administrator attestation; not independently bank-verified'};
  r.payoutStatus='Paid';r.updated=now;
  r.history??=[];r.history.push({status:'Caregiver payout recorded',at:now,actorId:session.accountId,detail:'Manual transfer recorded with reference '+reference});
  return true;
 }
 if(action!=='companyHomecareProgress'||session.accountId!==r.careStaffId)management();else{check(['Homecare']);if(!companyStaff(s,session.accountId))throw Error('Approved staff required.');}if(r.payment!=='Paid'||['Completed','Cancelled','Declined'].includes(r.status))throw Error('Choose a paid active booking.');
 if(action==='assignHomecareStaff'){if(!['Booking confirmed','Care team preparing'].includes(r.status))throw Error('A visit already underway cannot be reassigned here.');if(!companyStaff(s,p.staffId))throw Error('Choose approved Homecare staff.');const start=Date.parse(r.date+'T'+r.time+':00+02:00'),end=start+r.duration*3600000;if(s.records.some(v=>v.id!==r.id&&v.careStaffId===p.staffId&&v.payment==='Paid'&&!['Completed','Cancelled','Declined'].includes(v.status)&&start<Date.parse(v.date+'T'+v.time+':00+02:00')+v.duration*3600000&&end>Date.parse(v.date+'T'+v.time+':00+02:00')))throw Error('This staff member already has a visit at that time.');r.careStaffId=p.staffId;r.caregiver=s.providers.find(d=>d.id===p.staffId).name;event(r,'Care team preparing','Approved care staff assigned.');}
 else{const next={'Booking confirmed':'Care team preparing','Care team preparing':'Care visit underway','Care visit underway':'Completed'};if(next[r.status]!==p.status||!r.careStaffId)throw Error('Assign care staff and follow the saved visit stages.');event(r,p.status,p.status==='Completed'?'Service completed; agreed staff fee retained.':'Care progress updated.');}
 notify(r,'Homecare visit updated');return true;
}
export function canAccessCompanyCare(s,session,r){return !!r.companyBooking&&session.role==='Homecare'&&companyStaff(s,session.accountId)&&(session.accountId===r.providerId||session.accountId===carePolicy(s).managerId||session.accountId===r.careStaffId);}
export function publicCompanyCare(out,s,session){
 const policy=carePolicy(s);out.homecarePolicy={mode:policy.mode,managerId:policy.managerId,centre:policy.centre,radiusKm:policy.radiusKm,twoDiscountBps:policy.twoDiscountBps,threeDiscountBps:policy.threeDiscountBps};
 const manager=s.providers.find(d=>d.id===policy.managerId&&companyStaff(s,d.id));out.companyHomecareServices=(manager?.services||[]).filter(v=>session.role==='Admin'||session.accountId===policy.managerId||v.active!==false&&!v.archived).map(v=>{const copy={...v};if(session.role!=='Admin'&&session.accountId!==policy.managerId)delete copy.staffRate;return copy;});
 if(session.role!=='Admin'&&session.accountId!==policy.managerId){out.providers=out.providers.map(d=>({...d,services:d.services?.map(v=>{const copy={...v};delete copy.staffRate;return copy;})}));out.records=out.records.map(r=>{if(!r.companyBooking)return r;const copy=structuredClone(r);delete copy.staffPayableMinor;delete copy.payout;delete copy.payoutStatus;delete copy.bookingFingerprint;if(copy.history)copy.history=copy.history.filter(event=>event.status!=='Caregiver payout recorded');if(copy.priceSnapshot){delete copy.priceSnapshot.staffPayableMinor;delete copy.priceSnapshot.companyMarginMinor;for(const item of copy.priceSnapshot.items||[])delete item.staffRateMinor;}return copy;});}
 return out;
}
