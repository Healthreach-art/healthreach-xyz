import assert from 'node:assert/strict';
import {handleConnectedCommerce,commerceActions} from '../lib/connected-commerce.mjs';
import {careBookingPrice} from '../lib/matching.mjs';
import {homecareCatalogueForState,homecareProviderOfferList,projectHomecareCatalogue} from '../lib/homecare-catalogue.mjs';
import {homecareMarketplaceEntries} from '../lib/homecare-marketplace.mjs';
import {homecareServiceCategories} from '../lib/service-categories.mjs';

const provider={id:'provider-fixture',type:'Homecare',name:'Existing provider fixture',location:'Saved provider area',status:'Approved',acceptingOrders:true,availabilityConfigured:true,publication:{status:'Published'},services:[],weekdays:[0,1,2,3,4,5,6],openTime:'00:00',closeTime:'23:59'};
const s={providers:[provider],records:[],notifications:[],products:[],connectedAccounts:true,homecarePolicy:{mode:'marketplace'},marketPolicy:{commissionBps:0,processingBps:0}};
const owner={role:'Homecare',accountId:provider.id,name:'Provider fixture'},admin={role:'Admin',accountId:'admin-fixture',name:'Admin fixture'};
function act(action,payload,as=owner){const context={s,p:payload,session:as,action,now:'2026-10-26T12:00:00.000Z',id:crypto.randomUUID(),extra:{},check:roles=>{if(!roles.includes(as.role))throw Error('Permission denied');}};assert.equal(handleConnectedCommerce(context),true);return context.extra;}
assert(commerceActions.includes('homecareServices'));
assert.deepEqual(homecareServiceCategories.map(value=>value.name),['Personal care','Elderly care','Mobility assistance','Post-surgery care']);

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

assert.throws(()=>act('homecareServices',{services:[{id:'new-service',name:'Unsupported provider-created service',description:'Should not be accepted',category:'Personal care',rate:100,availability:[{weekday,start:'08:00',end:'17:00'}],active:true}]}),/shared Homecare catalogue/);
assert.throws(()=>act('providerProfile',{services:[{name:'Another service'}]}),/shared Services & Pricing catalogue/);
assert.throws(()=>act('homecareServices',{services:provider.services.map(value=>value.masterServiceId==='master-bathing'?{...value,rate:0,active:true}:value)}),/valid price before publishing/);
assert.throws(()=>act('homecareServices',{services:provider.services.map(value=>value.masterServiceId==='master-bathing'?{...value,availability:[],active:true}:value)}),/available day and time/);
assert.throws(()=>act('homecareServices',{services:provider.services},{role:'Patient',accountId:'patient-fixture'}),/Permission denied/);

// An admin can hide/remove a master service from new patient booking without
// deleting its definition or changing a confirmed booking.
catalogue=homecareCatalogueForState(s);
act('homecareCatalogue',{services:catalogue.services.map(value=>value.id==='master-bathing'?{...value,active:false,archived:true}:value)},admin);
assert.equal(provider.services.find(value=>value.masterServiceId==='master-bathing').active,true,'Archiving the shared definition should preserve provider publication for a future restore.');
assert.equal(homecareMarketplaceEntries(projectHomecareCatalogue({providers:structuredClone(s.providers),homecareCatalogue:structuredClone(s.homecareCatalogue)},s,'Patient')).entries.length,0);
assert.equal(savedRecord.priceSnapshot.total,360);
assert.equal(homecareCatalogueForState(s).services.find(value=>value.id==='master-bathing').archived,true);
console.log('Shared Homecare catalogue: four fixed categories, saved sub-service migration, provider price publishing, patient visibility, future price updates, immutable booking snapshots, permission checks and safe catalogue retirement passed.');
