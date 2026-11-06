import assert from 'node:assert/strict';
import {requiresAdminReauthentication,reauthenticateAndRetryAdminAction} from '../lib/admin-action-reauth.mjs';

const expired='Confirm your sign-in again before changing administrator access.';
assert(requiresAdminReauthentication(expired));
assert(requiresAdminReauthentication('API error: '+expired));
assert(!requiresAdminReauthentication('This action is not permitted for your account.'));

const pendingAction={action:'setMedicinePrice',payload:{productKey:'fixture-product',price:125},message:'Shared price published'};
let retries=0,confirmedPassword='';
await assert.rejects(()=>reauthenticateAndRetryAdminAction({password:'wrong',pendingAction,reauthenticate:async password=>{confirmedPassword=password;throw Error('invalid-credential');},retry:async()=>{retries++;}}),/invalid-credential/);
assert.equal(retries,0,'A rejected sign-in must not retry the administrator action.');

const outcome=await reauthenticateAndRetryAdminAction({password:'correct-fixture-password',pendingAction,reauthenticate:async password=>{confirmedPassword=password;},retry:async saved=>{retries++;assert.deepEqual(saved,pendingAction);return {published:true};}});
assert.equal(confirmedPassword,'correct-fixture-password');
assert.equal(retries,1,'A confirmed sign-in retries the exact pending action once.');
assert.equal(outcome.retried,true);
assert.deepEqual(outcome.value,{published:true});
console.log('Admin action reauthentication preserves the requested action, blocks retries after failed confirmation and retries once after fresh sign-in.');
