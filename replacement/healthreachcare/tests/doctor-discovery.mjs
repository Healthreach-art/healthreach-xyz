import assert from 'node:assert/strict';
import {discoverDoctors,handleDoctorOperations} from '../lib/doctor-operations.mjs';
import {doctorHasSavedAvailability,doctorServiceCategories,doctorServiceCatalog,refreshConnectedPublication} from '../lib/service-categories.mjs';
import {handleConnectedCommerce} from '../lib/connected-commerce.mjs';

const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const provider={id:'doctor-fixture',type:'Doctor',status:'Approved',professionalVerified:true,acceptingOrders:true,publication:{status:'Draft'},name:'Dr Fixture',speciality:'GP',qualifications:'Fixture qualification',registration:'TEST-REG',location:'Fixture practice, Cape Town',languages:'English',fee:350,modes:['In-person','Online demo'],durationMinutes:30,matchingEnabled:true,deliveryRadiusKm:20,coordinates:{latitude:-33.9,longitude:18.6},weekdays:[0,1,2,3,4,5,6],slots:['09:00','09:30'],openTime:'09:00',closeTime:'10:00'};
const state={providers:[structuredClone(provider)],accountControls:{},applications:{},records:[],profiles:{patient:{address:'15 Williams Street, Parow',addresses:[{id:'typed-address',formatted:'15 Williams Street, Parow',source:'manual',geocodingStatus:'Unverified'}],selectedAddressId:'typed-address'}}};

const unverified=structuredClone(provider);unverified.professionalVerified=false;unverified.publication={status:'Draft'};refreshConnectedPublication(unverified);assert.equal(unverified.professionalVerified,false);assert.equal(unverified.publication.status,'Draft');
assert.equal(doctorHasSavedAvailability(state.providers[0]),true);
refreshConnectedPublication(state.providers[0]);
assert.equal(state.providers[0].publication.status,'Published');
assert.equal(state.providers[0].availabilityConfigured,true);

// A service category query recognises a GP and does not require a patient pin.
const matches=discoverDoctors(state,{accountId:'patient'}, {specialty:'General Consultation',mode:'In-person',date:tomorrow});
assert.equal(matches.length,1);
assert.equal(matches[0].id,'doctor-fixture');
assert.equal(matches[0].distanceKm,null);
assert.ok(matches[0].nextAvailable);

// Typed street text stays useful for browsing, but is never treated as coordinates.
const typed=discoverDoctors(state,{accountId:'patient'}, {specialty:'General Consultation',mode:'In-person',addressDetails:{formatted:'15 Williams Street, Parow'},date:tomorrow});
assert.equal(typed.length,1);
assert.equal(typed[0].distanceKm,null);

// A genuine coordinate can be used for service-area matching, and online stays independent.
const outside=discoverDoctors(state,{accountId:'patient'}, {specialty:'General Consultation',mode:'In-person',addressDetails:{formatted:'Fixture address',latitude:-26.2,longitude:28.0},date:tomorrow});
assert.equal(outside.length,0);
const online=discoverDoctors(state,{accountId:'patient'}, {specialty:'General Consultation',mode:'Online demo',addressDetails:{formatted:'Fixture address',latitude:-26.2,longitude:28.0},date:tomorrow});
assert.equal(online.length,1);

// No returned slot does not hide a valid doctor profile from discovery.
const profileOnly=structuredClone(state);
profileOnly.providers[0].availableDates=['1999-01-01'];
const noSlot=discoverDoctors(profileOnly,{accountId:'patient'}, {specialty:'General Consultation',mode:'In-person',date:tomorrow});
assert.equal(noSlot.length,1);
assert.equal(noSlot[0].nextAvailable,null);

// A verified profile remains visible even when no bookable schedule is saved.
const noSchedule={...structuredClone(provider),publication:{status:'Draft'},weekdays:[],slots:[]};
refreshConnectedPublication(noSchedule);
assert.equal(noSchedule.publication.status,'Published');
assert.equal(noSchedule.availabilityConfigured,false);
const directoryOnly={...state,providers:[noSchedule]};
const directoryResult=discoverDoctors(directoryOnly,{accountId:'patient'},{specialty:'General Consultation',mode:'In-person',date:tomorrow});
assert.equal(directoryResult.length,1);
assert.equal(directoryResult[0].nextAvailable,null);

// Unapproved/unpublished doctors remain excluded.
const pending=structuredClone(state);
pending.providers[0].status='Pending Review';
assert.equal(discoverDoctors(pending,{accountId:'patient'}, {specialty:'General Consultation',date:tomorrow}).length,0);

// Saving the existing doctor calendar now updates publication from the actual schedule.
const scheduled=structuredClone(state);
scheduled.providers[0].publication={status:'Draft'};
const extra={};
await handleDoctorOperations({s:scheduled,p:{durationMinutes:30,rules:[{mode:'All',weekdays:[0,1,2,3,4,5,6],start:'09:00',end:'12:00'}],breaks:[]},session:{role:'Doctor',accountId:'doctor-fixture'},action:'saveDoctorCalendar',now:new Date().toISOString(),id:'fixture-id',check(){},extra});
assert.equal(scheduled.providers[0].availabilityConfigured,true);
assert.equal(scheduled.providers[0].publication.status,'Published');

// Discovery returns aggregate counts for an accurate empty state without leaking profiles.
const discoveryExtra={};
await handleDoctorOperations({s:state,p:{specialty:'General Consultation',mode:'In-person',date:tomorrow},session:{role:'Patient',accountId:'patient'},action:'discoverDoctors',now:new Date().toISOString(),id:'fixture-id',check(){},extra:discoveryExtra});
assert.deepEqual(discoveryExtra.doctorDiscoverySummary,{registeredDoctors:1,approvedDoctors:1,professionallyReviewedDoctors:1,eligibleDoctors:1,matchingDoctors:1});


// Per-service prices drive patient discovery, rather than a single practice-wide fee.
const priced=structuredClone(state),pricedDoctor=priced.providers[0];pricedDoctor.categories=['doctor-general','doctor-womens-health'];pricedDoctor.servicePrices=[{serviceId:'doctor-general',price:275,active:true},{serviceId:'doctor-womens-health',price:640,active:true}];pricedDoctor.fee=275;pricedDoctor.speciality='Family medicine';
const women=discoverDoctors(priced,{accountId:'patient'},{specialty:"Women's Health",mode:'In-person',date:tomorrow});assert.equal(women.length,1);assert.equal(women[0].fee,640);assert.equal(women[0].serviceId,'doctor-womens-health');
const general=discoverDoctors(priced,{accountId:'patient'},{specialty:'General Consultation',mode:'In-person',date:tomorrow});assert.equal(general[0].fee,275);
const archived=structuredClone(priced);archived.doctorServiceCatalog=doctorServiceCategories.map(v=>({...v,active:v.id!=='doctor-womens-health'}));assert.equal(discoverDoctors(archived,{accountId:'patient'},{specialty:"Women's Health",mode:'In-person',date:tomorrow}).length,0);

// Doctor profile submission saves an independent rand amount for every selected shared service.
const profileState=structuredClone(priced),profileProvider=profileState.providers[0];await handleConnectedCommerce({s:profileState,p:{name:profileProvider.name,description:'Updated service prices',location:profileProvider.location,acceptingOrders:true,weekdays:[0,1,2,3,4,5,6],openTime:'09:00',closeTime:'17:00',speciality:'Family medicine',qualifications:profileProvider.qualifications,registration:profileProvider.registration,durationMinutes:30,modes:['In-person'],categories:['doctor-general','doctor-womens-health'],servicePrices:[{serviceId:'doctor-general',price:290},{serviceId:'doctor-womens-health',price:675}]},session:{role:'Doctor',accountId:profileProvider.id},action:'providerProfile',now:new Date().toISOString(),id:'doctor-profile-save',check(){},extra:{}});assert.deepEqual(profileProvider.servicePrices.map(v=>v.price),[290,675]);assert.equal(profileProvider.fee,290);assert.equal(profileProvider.professionalVerified,true,'ordinary profile and price edits must retain prior professional review');assert.equal(profileProvider.publication.status,'Published');

// Admin changes affect the shared catalogue; removing an ID archives it instead of erasing it.
const adminState=structuredClone(priced),adminExtra={};await handleConnectedCommerce({s:adminState,p:{services:doctorServiceCategories.map(({id,name,description,keywords})=>({id,name,description,keywords,active:id!=='doctor-child-health'}))},session:{role:'Admin',accountId:'admin'},action:'saveDoctorServiceCatalog',now:new Date().toISOString(),id:'catalog-audit',check(){},extra:adminExtra});assert.equal(doctorServiceCatalog(adminState).some(v=>v.id==='doctor-child-health'),false);assert.equal(doctorServiceCatalog(adminState,{includeInactive:true}).some(v=>v.id==='doctor-child-health'),true);

// Reservation stores the selected service and exact saved price in its immutable price snapshot.
const bookingState=structuredClone(priced),bookingExtra={};await handleConnectedCommerce({s:bookingState,p:{type:'Doctor',doctorId:'doctor-fixture',serviceId:'doctor-womens-health',specialty:"Women's Health",date:tomorrow,time:'09:00',mode:'In-person',expectedFee:640,address:'Parow',addressDetails:{formatted:'15 Williams Street, Parow',latitude:-33.9,longitude:18.6},bookingKey:'service-price-fixture'},session:{role:'Patient',accountId:'patient'},action:'request',now:new Date().toISOString(),id:'appointment-service-price',demoPayments:true,extra:bookingExtra,canAccess:()=>true,event:(record,status,note)=>{record.status=status;record.history.push({status,note});},check(){}});const saved=bookingState.records.find(v=>v.id==='appointment-service-price');assert.equal(saved.title,"Women's Health");assert.equal(saved.total,640);assert.equal(saved.serviceSnapshot.price,640);assert.equal(saved.serviceId,'doctor-womens-health');

console.log('Doctor discovery and pricing tests passed: Cape Town visibility, service-specific prices, admin catalogue archive, profile-only results, and price snapshots.');
