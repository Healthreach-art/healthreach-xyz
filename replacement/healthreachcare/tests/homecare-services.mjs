import assert from 'node:assert/strict';
import {handleConnectedCommerce,commerceActions} from '../lib/connected-commerce.mjs';
import {careBookingPrice} from '../lib/matching.mjs';
import {homecareCatalogueForState,homecareCategoryIdFromForm,homecareCaregiverServiceOptions,homecareProviderOfferList,projectHomecareCatalogue} from '../lib/homecare-catalogue.mjs';
import {homecareMarketplaceEntries} from '../lib/homecare-marketplace.mjs';
import {homecareServiceCategories} from '../lib/service-categories.mjs';

const provider={id:'provider-fixture',type:'Homecare',name:'Existing provider fixture',location:'Saved provider area',status:'Approved',acceptingOrders:true,availabilityConfigured:true,publication:{status:'Published'},services:[],weekdays:[0,1,2,3,4,5,6],openTime:'00:00',closeTime:'23:59'};
const s={providers:[provider],records:[],notifications:[],payments:[],products:[],profiles:{},connectedAccounts:true,homecarePolicy:{mode:'marketplace'},marketPolicy:{commissionBps:0,processingBps:0}};
const owner={role:'Homecare',accountId:provider.id,name:'Provider fixture'},admin={role:'Admin',accountId:'admin-fixture',name:'Admin fixture'};
function act(action,payload,as=owner){const context={s,p:payload,session:as,action,now:new Date().toISOString(),id:crypto.randomUUID(),demoPayments:true,extra:{},check:roles=>{if(!roles.includes(as.role))throw Error('Permission denied');},canAccess:record=>as.role==='Admin'||record.patientId===as.accountId||record.providerId===as.accountId,event:(record,status,note)=>{record.status=status;record.updated=context.now;record.history??=[];record.history.push({status,note,at:context.now});}};assert.equal(handleConnectedCommerce(context),true);return context.extra;}
function actIn(state,action,payload,as){const context={s:state,p:payload,session:as,action,now:new Date().toISOString(),id:crypto.randomUUID(),demoPayments:true,extra:{},check:roles=>{if(!roles.includes(as.role))throw Error('Permission denied');},canAccess:record=>as.role==='Admin'||record.patientId===as.accountId||record.providerId===as.accountId,event:(record,status,note)=>{record.status=status;record.updated=context.now;record.history??=[];record.history.push({status,note,at:context.now});}};assert.equal(handleConnectedCommerce(context),true);return context.extra;}
assert(commerceActions.includes('homecareServices'));
assert.deepEqual(homecareServiceCategories.map(value=>value.name),['Personal care','Elderly care','Mobility assistance','Post-surgery care']);
assert.equal(homecareCategoryIdFromForm({get:name=>name==='categoryId'?null:null},'homecare-main-personal-care'),'homecare-main-personal-care','The in-category form inherits the category it was opened from.');
assert.equal(homecareCategoryIdFromForm({get:name=>name==='categoryId'?'homecare-main-elderly-care':null},'homecare-main-personal-care'),'homecare-main-elderly-care','An explicit category picker takes precedence.');
const caregiverCatalogue=homecareCaregiverServiceOptions({providers:[{id:'provider-a',type:'Homecare',services:[{id:'offer-1',providerDefined:true,category:'Personal care',name:'Bathing assistance',description:'Saved patient-facing service',catalogueActive:true}]},{id:'provider-b',type:'Homecare',services:[{id:'offer-other',providerDefined:true,category:'Personal care',name:'Private other-provider service',description:'Must not leak',catalogueActive:true}]}]},'provider-a');
assert(caregiverCatalogue.categories.some(value=>value.name==='Personal care'));
assert(caregiverCatalogue.services.some(value=>value.name==='Bathing assistance'));
assert(!caregiverCatalogue.services.some(value=>value.name==='Private other-provider service'));

// The master catalogue begins with actual saved definitions; admins can add an
// existing catalogue sub-service once and every provider gets it automatically.
act('homecareCatalogue',{services:[{id:'master-bathing',category:'Personal care',name:'Bathing assistance',description:'Existing patient-catalogue bathing support.',pricingModel:'hourly',minDuration:1,maxDuration:8,active:true}]},admin);
let catalogue=homecareCatalogueForState(s);
let offers=homecareProviderOfferList(provider,catalogue);
assert.deepEqual(offers.filter(value=>!value.parentId).map(value=>value.name),['Personal care','Elderly care','Mobility assistance','Post-surgery care']);
let bathing=offers.find(value=>value.masterServiceId==='master-bathing');
assert(bathing,'The saved catalogue service appears for the provider without recreation.');
const bookingDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10),weekday=new Date(bookingDate+'T12:00:00+02:00').getUTCDay();
bathing={...bathing,rate:180,pricingModel:'hourly',minDuration:1,maxDuration:4,availability:[{weekday,start:'08:00',end:'18:00'}],active:true};
act('homecareServices',{services:offers.map(value=>value.masterServiceId===bathing.masterServiceId?bathing:value)});
assert.equal(provider.services.length,5,'Four category roots and the one saved sub-service are persisted to the provider.');
assert.equal(provider.services.find(value=>value.masterServiceId==='master-bathing').name,'Bathing assistance');
assert.equal(provider.services.find(value=>value.masterServiceId==='master-bathing').description,'Existing patient-catalogue bathing support.');
let patientState=projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient');
let market=homecareMarketplaceEntries(patientState);
assert.equal(market.entries.length,1);
assert.equal(market.entries[0].service.rate,180);
assert.equal(market.entries[0].service.description,'Existing patient-catalogue bathing support.');
assert.deepEqual(market.main.map(value=>value.service.name),['Personal care']);

const fixed=careBookingPrice(s,provider,{serviceId:provider.services.find(value=>value.masterServiceId==='master-bathing').id,date:bookingDate,time:'10:00',duration:2});
assert.equal(fixed.total,360);assert.equal(fixed.serviceId,provider.services.find(value=>value.masterServiceId==='master-bathing').id);
const savedRecord={id:'confirmed-fixture',type:'Homecare',providerId:provider.id,status:'Paid — scheduling',payment:'Paid',total:360,priceSnapshot:structuredClone(fixed)};s.records.push(savedRecord);
// A provider can change their price for future bookings; saved booking snapshots stay fixed.
act('homecareServices',{services:provider.services.map(value=>value.masterServiceId==='master-bathing'?{...value,rate:220}:value)});
assert.equal(homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient')).entries[0].service.rate,220);
assert.equal(savedRecord.total,360);assert.equal(savedRecord.priceSnapshot.total,360);
assert.equal(careBookingPrice(s,provider,{serviceId:provider.services.find(value=>value.masterServiceId==='master-bathing').id,date:bookingDate,time:'10:00',duration:2}).total,440);

assert.throws(()=>act('homecareServices',{services:[{id:'new-service',name:'Unsupported provider-created service',description:'Should not be accepted',category:'Personal care',rate:100,availability:[{weekday,start:'08:00',end:'17:00'}],active:true}]}),/active shared Homecare service|provider-owned sub-service/);
assert.throws(()=>act('providerProfile',{services:[{name:'Another service'}]}),/shared Services & Pricing catalogue/);
assert.throws(()=>act('homecareServices',{services:provider.services.map(value=>value.masterServiceId==='master-bathing'?{...value,rate:0,active:true}:value)}),/valid price before publishing/);
assert.throws(()=>act('homecareServices',{services:provider.services.map(value=>value.masterServiceId==='master-bathing'?{...value,availability:[],active:true}:value)}),/available day and time/);
assert.throws(()=>act('homecareServices',{services:provider.services},{role:'Patient',accountId:'patient-fixture'}),/Permission denied/);

// Pending Homecare accounts can persist drafts, but the backend keeps them
// unpublished regardless of a client-supplied active flag.
const pendingState=structuredClone(s),pendingProvider={...structuredClone(provider),id:'provider-pending-fixture',status:'Pending verification',services:[]};pendingState.providers=[pendingProvider];
const pendingOffers=homecareProviderOfferList(pendingProvider,homecareCatalogueForState(pendingState));
const pendingSession={role:'Homecare',accountId:pendingProvider.id,name:'Pending provider fixture'},draft={id:'provider-offer-pending-fixture-draft',providerDefined:true,category:'Personal care',name:'Pending draft service',description:'Saved before account approval.',rate:175,pricingModel:'hourly',minDuration:1,maxDuration:4,availability:[{weekday:1,start:'08:00',end:'17:00'}],active:false};
actIn(pendingState,'homecareServices',{services:[...pendingOffers,draft]},pendingSession);
assert(pendingProvider.services.some(value=>value.id===draft.id&&!value.active),'Pending providers can save a sub-service draft.');
actIn(pendingState,'homecareServices',{services:pendingProvider.services.map(value=>value.id===draft.id?{...value,active:true}:value)},pendingSession);
assert.equal(pendingProvider.services.find(value=>value.id===draft.id).active,false,'Pending provider status prevents publishing even if the client sends active=true.');
assert(!homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(pendingState.providers),homecareCatalogue:structuredClone(pendingState.homecareCatalogue)},pendingState,'Patient')).entries.some(value=>value.service.id===draft.id));
assert.throws(()=>actIn(pendingState,'homecareServices',{services:pendingProvider.services}, {...pendingSession,role:'Patient'}),/Permission denied/);

// An admin can hide/remove a master service from new patient booking without
// deleting its definition or changing a confirmed booking.
catalogue=homecareCatalogueForState(s);
act('homecareCatalogue',{services:catalogue.services.map(value=>value.id==='master-bathing'?{...value,active:false,archived:true}:value)},admin);
assert.equal(provider.services.find(value=>value.masterServiceId==='master-bathing').active,true,'Archiving the shared definition should preserve provider publication for a future restore.');
assert.equal(homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient')).entries.length,0);
assert.equal(savedRecord.priceSnapshot.total,360);
assert.equal(homecareCatalogueForState(s).services.find(value=>value.id==='master-bathing').archived,true);
assert(commerceActions.includes('requestHomecareService'));
assert(commerceActions.includes('reviewHomecareServiceRequest'));
const request=act('requestHomecareService',{category:'Mobility assistance',name:'Supported transfer session',description:'Assistance with safe transfers at home.',rate:240,pricingModel:'hourly',minDuration:1,maxDuration:4,availability:[{weekday,start:'08:00',end:'17:00'}]});
assert.equal(s.homecareServiceRequests[0].status,'Pending');
act('reviewHomecareServiceRequest',{id:request.requestId,status:'Approved',reason:'Shared service definition reviewed.'},admin);
const approvedRequest=s.homecareServiceRequests.find(value=>value.id===request.requestId),newDefinition=homecareCatalogueForState(s).services.find(value=>value.name==='Supported transfer session');
assert.equal(approvedRequest.status,'Approved');assert(newDefinition);assert.equal(provider.services.find(value=>value.masterServiceId===newDefinition.id).active,false);assert.equal(provider.services.find(value=>value.masterServiceId===newDefinition.id).rate,240);
assert.throws(()=>act('requestHomecareService',{category:'Unsupported category',name:'Bad service',description:'Invalid',rate:100,pricingModel:'hourly',minDuration:1,maxDuration:1,availability:[{weekday,start:'08:00',end:'09:00'}]}),/active Homecare main service/);
assert.throws(()=>act('reviewHomecareServiceRequest',{id:request.requestId,status:'Rejected',reason:'Second decision'},admin),/no longer pending/);

// Main categories remain shared and admin-controlled; additional definitions and
// offers persist without leaking one provider's custom service to another.
assert.throws(()=>act('saveHomecareMainService',{name:'Unapproved category',description:'Not allowed.'},owner),/Permission denied/);
assert.throws(()=>act('saveHomecareMainService',{id:'homecare-main-personal-care',name:'Renamed standard category',description:'Not allowed.'},admin),/four standard Homecare categories/);
act('saveHomecareMainService',{name:'Companion support',description:'Company-approved additional Homecare category.'},admin);
const extraCategory=homecareCatalogueForState(s).categories.find(value=>value.name==='Companion support');assert(extraCategory&&!extraCategory.isCore);
act('homecareCatalogue',{services:[...homecareCatalogueForState(s).services,{id:'master-companion',category:'Companion support',name:'Social companionship',description:'Visit and companionship support.',pricingModel:'per-visit',minDuration:1,maxDuration:4,active:true}]},admin);
catalogue=homecareCatalogueForState(s);assert(catalogue.services.some(value=>value.id==='master-companion'&&value.parentId===extraCategory.id));
offers=homecareProviderOfferList(provider,catalogue);const companion=offers.find(value=>value.masterServiceId==='master-companion');assert(companion);
const customDate=new Date(Date.now()+8*86400000).toISOString().slice(0,10),customWeekday=new Date(customDate+'T12:00:00+02:00').getUTCDay();
const custom={id:'provider-offer-custom-one',providerDefined:true,category:'Companion support',categoryId:extraCategory.id,name:'Evening companionship',description:'A provider-specific evening companionship visit.',rate:310,pricingModel:'per-visit',minDuration:1,maxDuration:2,availability:[{weekday:customWeekday,start:'08:00',end:'18:00'}],active:false};
act('homecareServices',{services:[...offers,custom]});
let customSaved=provider.services.find(value=>value.id===custom.id);assert(customSaved&&customSaved.providerDefined&&!customSaved.active);
catalogue=homecareCatalogueForState(s);assert(catalogue.services.some(value=>value.id===customSaved.masterServiceId&&value.ownerProviderId===provider.id));
assert(!homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient')).entries.some(value=>value.service.id===custom.id),'Unpublished provider-owned services are not visible to patients.');
act('homecareServices',{services:provider.services.map(value=>value.id===custom.id?{...value,active:true}:value)});customSaved=provider.services.find(value=>value.id===custom.id);assert(customSaved.active);
const otherProvider={...provider,id:'provider-other',name:'Other provider',services:[]};s.providers.push(otherProvider);
assert(!homecareProviderOfferList(otherProvider,catalogue).some(value=>value.masterServiceId===customSaved.masterServiceId),'Provider-owned definitions are not visible in another provider management list.');const isolatedHomecare=projectHomecareCatalogue({providers:structuredClone(s.providers)}, {...s,session:{accountId:otherProvider.id}},'Homecare');assert(!isolatedHomecare.homecareCatalogue.services.some(value=>value.id===customSaved.masterServiceId),'Provider-owned definitions are removed from another provider workspace projection.');assert.deepEqual(isolatedHomecare.providers.find(value=>value.id===provider.id).services,[],'Other Homecare provider prices and service entries are not exposed.');
const publishedCustom=homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient')).entries.find(value=>value.service.id===custom.id);assert.equal(publishedCustom?.service.rate,310);
// Legacy provider-created offers may not have masterServiceId persisted. The
// provider-scoped fallback must still join them to their synthesized catalogue
// definition so the Patient category can render the saved price.
const legacyProvider={...provider,id:'provider-legacy',publication:{status:'Published'},services:[{id:'provider-offer-legacy',providerDefined:true,category:'Personal care',name:'Legacy bathing support',description:'Existing saved provider offer.',rate:199.93,pricingModel:'hourly',minDuration:1,maxDuration:4,availability:[{weekday:1,start:'08:00',end:'18:00'}],active:true}]};
const legacyState={providers:[legacyProvider],homecareCatalogue:[],records:[]};
const legacyCatalogue=homecareCatalogueForState(legacyState),legacyProjected=projectHomecareCatalogue({providers:structuredClone(legacyState.providers),homecareCatalogue:structuredClone(legacyState.homecareCatalogue)},legacyState,'Patient'),legacyEntries=homecareMarketplaceEntries(legacyProjected);
assert.equal(legacyEntries.entries.length,1,'A saved legacy provider offer joins its generated definition using provider ownership.');
assert.equal(legacyEntries.entries[0].service.masterServiceId,legacyCatalogue.services[0].id);
assert.equal(legacyEntries.entries[0].service.rate,199.93);
assert.equal(legacyProjected.homecareCatalogue.services.some(value=>value.id===legacyEntries.entries[0].service.masterServiceId&&value.category==='Personal care'),true);
const patientSession={role:'Patient',accountId:'patient-custom-fixture',name:'Patient fixture'};s.profiles[patientSession.accountId]={name:patientSession.name,email:'patient@example.invalid'};const booking=act('request',{type:'Homecare',providerId:provider.id,service:customSaved.name,serviceId:customSaved.id,date:customDate,time:'10:00',duration:1,requirements:'Test booking requirements',address:'Patient service address',addressDetails:{formatted:'Parow, Cape Town',suburb:'Parow',city:'Cape Town',province:'Western Cape'},expectedTotal:310,requestKey:'patient-custom-homecare-booking'},patientSession);const customBooking=s.records.find(value=>value.id===booking.bookingId);assert(customBooking);assert.equal(customBooking.total,310);assert.equal(customBooking.payment,'Unpaid');act('pay',{id:customBooking.id,expectedTotal:310,scenario:'Success'},patientSession);assert.equal(customBooking.payment,'Paid');assert(s.notifications.some(value=>value.recipientId===provider.id&&value.recordId===customBooking.id&&value.title==='New Homecare booking received'));
act('deleteHomecareService',{id:customSaved.id});
assert.equal(provider.services.find(value=>value.id===customSaved.id).archived,true);assert.equal(customBooking.total,310);
assert(!homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient')).entries.some(value=>value.service.id===custom.id),'Archived provider sub-services are not bookable.');
act('archiveHomecareMainService',{id:extraCategory.id},admin);
assert.equal(homecareCatalogueForState(s).categories.find(value=>value.id===extraCategory.id).archived,true);
const patientAfterArchive=projectHomecareCatalogue({providers:structuredClone(s.providers)},s,'Patient');assert(!patientAfterArchive.homecareCatalogue.categories.some(value=>value.id===extraCategory.id));assert.equal(customBooking.priceSnapshot.total,310);
assert.throws(()=>act('archiveHomecareMainService',{id:'homecare-main-personal-care'},admin),/Only additional Homecare categories/);
console.log('Shared Homecare catalogue: protected standard categories, admin-managed custom categories, provider-owned sub-services, patient visibility, booking price snapshots, permissions and archive behavior passed.');
