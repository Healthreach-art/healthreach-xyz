import assert from 'node:assert/strict';
import {deliveryProgress} from '../lib/order-delivery.mjs';
import {handleRealTracking,maintainRealTracking} from '../lib/real-delivery-tracking.mjs';
const now=Date.parse('2026-10-22T12:00:00Z'),record={id:'fixture-order',type:'Order',status:'Processing',payment:'Paid',isOrder:true,patientId:'fixture-patient'},task={id:'fixture-task',recordId:record.id,driverId:'fixture-driver',status:'En route'};
const s={records:[record],deliveryTasks:[task],drivers:{'fixture-driver':{status:'Approved'}},deliveryLocations:{}};
const context={s,session:{role:'Driver',accountId:'fixture-driver'},now:new Date(now).toISOString()};
let checks=0;const check=v=>{assert(v);checks++;};
check(deliveryProgress(record,null,null,now).point===null);check(deliveryProgress(record,null,null,now).arrival==='Arrival estimate not yet confirmed');
handleRealTracking({...context,action:'shareDriverLocation',p:{taskId:task.id,latitude:-33.9,longitude:18.4,accuracy:12,consent:true}});
let point=s.deliveryLocations[task.id];check(point.latitude===-33.9);check(point.expires===now+120000);
let tracking={state:'Live',location:point,lastUpdate:point.at};check(deliveryProgress(record,task,tracking,now).point===point);check(deliveryProgress(record,task,tracking,now+120001).point===null);
handleRealTracking({...context,action:'saveDeliveryEta',p:{taskId:task.id,minutes:25}});check(task.estimatedDeliveryAt==='2026-10-22T12:25:00.000Z');check(deliveryProgress(record,task,tracking,now).arrival.includes('25 min'));check(deliveryProgress(record,task,tracking,now+26*60000).arrival.includes('needs an update'));
const snapshot=JSON.stringify(s);
for(const extra of [{session:{role:'Patient',accountId:'fixture-patient'}},{session:{role:'Driver',accountId:'other-driver'}},{p:{taskId:task.id,minutes:0}},{p:{taskId:task.id,minutes:241}}]){assert.throws(()=>handleRealTracking({...context,action:'saveDeliveryEta',p:{taskId:task.id,minutes:10},...extra}));checks++;}check(JSON.stringify(s)===snapshot);
for(const variation of [{payment:'Unpaid'},{type:'Prescription',prescriptionApproved:false},{type:'Prescription',prescriptionApproved:true,requiresDocuments:true,identity:{status:'Under review'}},{status:'Delivered'}]){Object.assign(record,variation);assert.throws(()=>handleRealTracking({...context,action:'shareDriverLocation',p:{taskId:task.id,latitude:-33.9,longitude:18.4,accuracy:12,consent:true}}));checks++;Object.assign(record,{type:'Order',status:'Processing',payment:'Paid',prescriptionApproved:undefined,requiresDocuments:false});}
record.status='Delivered';check(deliveryProgress(record,task,tracking,now).point===null);check(deliveryProgress(record,task,tracking,now).index===4);maintainRealTracking(s,now);check(Object.keys(s.deliveryLocations).length===0);
record.status='Processing';record.fulfilment='Collection';check(deliveryProgress(record,task,tracking,now).collection);check(deliveryProgress({...record,type:'Doctor'},task,tracking,now)===null);
console.log(`${checks} order progress, genuine-coordinate freshness, driver estimate, ownership and fulfilment guard assertions passed with fictional local records.`);
// Administrator map snapshots use only eligible records and genuinely saved, fresh positions.
s.providers=[];s.audit=[];record.fulfilment='Delivery';record.status='Processing';record.payment='Paid';
const adminContext={...context,session:{role:'Admin',accountId:'fixture-admin'},action:'deliveryOperations',p:{purpose:'Fixture operational review'},extra:{}};
for(const role of ['Patient','Doctor','Pharmacy','Homecare','Driver'])assert.throws(()=>handleRealTracking({...adminContext,session:{role,accountId:'outsider'}}));
assert.throws(()=>handleRealTracking({...adminContext,p:{purpose:''}}));handleRealTracking({...context,action:'shareDriverLocation',p:{taskId:task.id,latitude:-33.9,longitude:18.4,accuracy:12,consent:true}});handleRealTracking(adminContext);assert.equal(adminContext.extra.deliveryOperations.length,1);assert.equal(adminContext.extra.deliveryOperations[0].tracking.latitude,-33.9);assert.equal(s.audit.at(-1).action,'delivery-location-access');
const expired={...adminContext,extra:{},now:new Date(now+120001).toISOString()};handleRealTracking(expired);assert.equal(expired.extra.deliveryOperations[0].tracking,null);
record.payment='Unpaid';handleRealTracking(adminContext);assert.equal(adminContext.extra.deliveryOperations.length,0);record.payment='Paid';record.status='Delivered';handleRealTracking(adminContext);assert.equal(adminContext.extra.deliveryOperations.length,0);
console.log('12 administrator map permission, purpose, freshness, unpaid/ended exclusion and audit checks passed.');
