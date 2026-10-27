import assert from 'node:assert/strict';
import {discoverDoctors,handleDoctorOperations} from '../lib/doctor-operations.mjs';
import {doctorHasSavedAvailability,refreshConnectedPublication} from '../lib/service-categories.mjs';
import {candidateTimes} from '../lib/appointment-calendar.mjs';
import {validateSlot} from '../lib/completion.mjs';

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


// Multiple periods persist independently; a gap between periods never becomes bookable.
const splitSchedule=structuredClone(state);splitSchedule.providers[0].durationMinutes=60;splitSchedule.providers[0].calendar={rules:[
 {mode:'All',weekdays:[1],start:'13:00',end:'14:00'},
 {mode:'All',weekdays:[1],start:'15:00',end:'19:00'}],breaks:[],blocks:[]};
const monday=new Date(Date.parse(tomorrow+'T12:00:00Z'));while(monday.getUTCDay()!==1)monday.setUTCDate(monday.getUTCDate()+1);const mondayDate=monday.toISOString().slice(0,10);
assert.deepEqual(candidateTimes(splitSchedule.providers[0],mondayDate,'In-person'),['13:00','15:00','16:00','17:00','18:00']);
assert.throws(()=>validateSlot(splitSchedule,'doctor-fixture',mondayDate,'14:00',undefined,'In-person'),/configured future appointment slot/);
assert.doesNotThrow(()=>validateSlot(splitSchedule,'doctor-fixture',mondayDate,'15:00',undefined,'In-person'));

const overlapping=structuredClone(state);const overlapExtra={};
await assert.rejects(()=>handleDoctorOperations({s:overlapping,p:{durationMinutes:30,rules:[
 {mode:'All',weekdays:[1],start:'09:00',end:'12:00'},
 {mode:'All',weekdays:[1],start:'11:00',end:'13:00'}],breaks:[]},session:{role:'Doctor',accountId:'doctor-fixture'},action:'saveDoctorCalendar',now:new Date().toISOString(),id:'fixture-id',check(){},extra:overlapExtra}),/cannot overlap/);

// Discovery returns aggregate counts for an accurate empty state without leaking profiles.
const discoveryExtra={};
await handleDoctorOperations({s:state,p:{specialty:'General Consultation',mode:'In-person',date:tomorrow},session:{role:'Patient',accountId:'patient'},action:'discoverDoctors',now:new Date().toISOString(),id:'fixture-id',check(){},extra:discoveryExtra});
assert.deepEqual(discoveryExtra.doctorDiscoverySummary,{registeredDoctors:1,eligibleDoctors:1,matchingDoctors:1});

console.log('Doctor discovery and publication tests passed: GP matching, no-pin browsing, verified coordinates, profile-only results, approval gates, schedule publication, split periods, overlap protection and safe aggregate empty-state counts.');
