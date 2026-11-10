import assert from 'node:assert/strict';
import {paymentReadiness} from '../lib/payment-readiness.mjs';

const demo=paymentReadiness({HRC_SIMULATED_PAYMENTS_ENABLED:'true'});
assert.equal(demo.demoPaymentsEnabled,true);
assert.equal(demo.livePaymentsEnabled,false);
assert.equal(demo.liveReady,false);
assert.equal(demo.provider,null);

const candidate=paymentReadiness({HRC_SIMULATED_PAYMENTS_ENABLED:'true',HRC_PAYMENT_PROVIDER:'paystack',PAYSTACK_SECRET_KEY:'secret-test-value'});
assert.equal(candidate.provider,'Paystack');
assert.equal(candidate.configuredCredentialCount,1);
assert.deepEqual(candidate.missingCredentialNames,['PAYSTACK_PUBLIC_KEY','PAYSTACK_WEBHOOK_SECRET']);
assert.equal(candidate.liveReady,false,'credentials alone must not enable live processing');
assert(!JSON.stringify(candidate).includes('secret-test-value'),'readiness projection must never disclose a secret');

const unknown=paymentReadiness({HRC_PAYMENT_PROVIDER:'unknown'});
assert.equal(unknown.provider,null);
assert.equal(unknown.livePaymentsEnabled,false);
console.log('Payment readiness checks passed: demo preserved, live charge disabled, missing setup reported, and secret values withheld.');
