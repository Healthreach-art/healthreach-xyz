import assert from 'node:assert/strict';
import {logoutApplication} from '../lib/app-session.mjs';
let checks=0;
for (const role of ['Patient','Pharmacy','Doctor','Homecare','Driver','Admin']) {
    const values=new Map([['hrc-demo-session',role+'-token'],['hrc-demo-account',role],['unrelated','keep']]);
    const storage={getItem:key=>values.get(key),removeItem:key=>values.delete(key)};
    const events=[];
    await logoutApplication({storage,request:async(path,options)=>{
        assert.equal(path,'/api/workspace');assert.equal(options.headers['x-demo-session'],role+'-token');
        assert.equal(JSON.parse(options.body).action,'endDemoSession');events.push('revoked');
        return Response.json({sessionEnded:true});
    },onCleared:()=>events.push('cleared'),navigate:path=>events.push(path)});
    assert.deepEqual(events,['revoked','cleared','/']);assert.equal(values.get('unrelated'),'keep');assert(!values.has('hrc-demo-session'));assert(!values.has('hrc-demo-account'));checks+=7;
}
for (const response of [Response.json({error:'Retry'},{status:503}),Response.json({sessionEnded:false})]) {
    let changed=false;
    await assert.rejects(logoutApplication({storage:{getItem:()=> 'token',removeItem:()=>{changed=true;}},request:async()=>response,onCleared:()=>{changed=true;},navigate:()=>{changed=true;}}));
    assert.equal(changed,false);checks+=2;
}
let requested=false,path='';
await logoutApplication({storage:{getItem:()=>null,removeItem(){}},request:async()=>{requested=true;},onCleared(){},navigate:value=>{path=value;}});
assert.equal(requested,false);assert.equal(path,'/');checks+=2;
console.log(`${checks} app-only logout assertions passed (six roles, revocation failures, unrelated storage preserved).`);
