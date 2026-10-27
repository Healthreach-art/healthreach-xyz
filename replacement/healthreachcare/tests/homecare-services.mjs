import assert from 'node:assert/strict';
import {handleConnectedCommerce,commerceActions} from '../lib/connected-commerce.mjs';
import {careBookingPrice} from '../lib/matching.mjs';

const provider={id:'provider-fixture',type:'Homecare',name:'Existing provider fixture',status:'Approved',services:[],weekdays:[0,1,2,3,4,5,6],openTime:'00:00',closeTime:'23:59'};
const s={providers:[provider],records:[],notifications:[],products:[],connectedAccounts:true,homecarePolicy:{mode:'marketplace'},marketPolicy:{commissionBps:0,processingBps:0}};
const session={role:'Homecare',accountId:provider.id,name:'Provider fixture'};
function act(action,payload,as=session){const context={s,p:payload,session:as,action,now:'2026-10-26T12:00:00.000Z',id:crypto.randomUUID(),extra:{},check:roles=>{if(!roles.includes(as.role))throw Error('Permission denied');}};assert.equal(handleConnectedCommerce(context),true);return context.extra;}
assert(commerceActions.includes('homecareServices'));
act('homecareServices',{services:[
 {id:'personal-care',name:'Personal care',description:'Support with daily care.',category:'Personal care',rate:150,pricingModel:'hourly',minDuration:1,maxDuration:8,noticeHours:0,active:true},
 {id:'bathing',name:'Bathing assistance',description:'Support with bathing.',category:'Personal care',parentId:'personal-care',rate:300,caregiverFee:180,pricingModel:'per-visit',minDuration:1,maxDuration:4,noticeHours:2,active:true}
]});
assert.equal(provider.services.length,2);assert.equal(provider.services[1].parentId,'personal-care');assert.equal(provider.services[1].pricingModel,'per-visit');assert.equal(provider.services[1].staffRate,180);assert.equal(provider.services[1].caregiverFee,180);
assert.throws(()=>act('homecareServices',{services:provider.services}, {role:'Patient',accountId:'patient'}),/Permission denied/);
assert.throws(()=>act('homecareServices',{services:[{...provider.services[1],parentId:'missing'}]}),/main service/);
const savedServices=provider.services;act('homecareServices',{services:[{...provider.services[0],rate:0}]});assert.equal(provider.services[0].rate,0);provider.services=savedServices;
provider.services[1].minDuration=1;provider.services[1].maxDuration=4;
const bookingDate=new Date(Date.now()+3*86400000).toISOString().slice(0,10);const price=careBookingPrice(s,provider,{serviceId:'bathing',date:bookingDate,time:'10:00',duration:3});
assert.equal(price.total,300);assert.equal(price.pricingModel,'per-visit');assert.equal(price.duration,3);
assert.throws(()=>careBookingPrice(s,provider,{serviceId:'bathing',date:bookingDate,time:'10:00',duration:5}),/valid future/);
provider.services[1].noticeHours=720;
assert.throws(()=>careBookingPrice(s,provider,{serviceId:'bathing',date:bookingDate,time:'10:00',duration:2}),/booking notice/);
console.log('Homecare service API: role restriction, saved main/sub-services, category/parent validation, fixed pricing models, duration and notice rules passed.');
