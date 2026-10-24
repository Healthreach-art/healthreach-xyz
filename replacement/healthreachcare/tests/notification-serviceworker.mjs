import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners={},shown=[],opened=[];const self={location:{origin:'https://healthreachcare.co.za'},registration:{showNotification:async(title,payload)=>shown.push({title,payload})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,fn)=>listeners[name]=fn};vm.runInNewContext(fs.readFileSync('public/notifications-sw.js','utf8'),{self,URL});let checks=0,pending;
function check(v){assert(v);checks++;}
listeners.push({data:{json:()=>({title:'Private medical text',body:'Private patient information',tag:'fixture',url:'https://attacker.test'})},waitUntil:p=>pending=p});await pending;check(shown[0].title==='HealthReachCare');check(!JSON.stringify(shown[0]).includes('Private patient'));check(shown[0].payload.data.url==='/login');check(shown[0].payload.icon==='/brand-icon-192.png');
let closed=false;listeners.notificationclick({notification:{close(){closed=true;},data:shown[0].payload.data},waitUntil:p=>pending=p});await pending;check(closed);check(opened[0]==='https://healthreachcare.co.za/login');
for(const role of ['patient','pharmacy','doctor','homecare','driver','admin']){listeners.push({data:{json:()=>({url:'/dashboard/'+role+'/notifications'})},waitUntil:p=>pending=p});await pending;check(shown.at(-1).payload.data.url==='/dashboard/'+role+'/notifications');}
check(!fs.readFileSync('public/notifications-sw.js','utf8').includes('caches.open'));console.log(`${checks} service-worker logo, private summary, safe navigation and six-role notification destinations passed without a real device subscription.`);
