import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesMarketplacePayment, canDeliverPaidOrder } from "./marketplace-payment-policy.ts";

test("each accepted quotation requires its own exact successful ZAR Paystack payment", () => {
  const expected = { reference: "HC-123", amount: 98765, patientId: "patient", targetId: "quote", kind: "homecare" };
  const proof = { status: "success", currency: "ZAR", reference: "HC-123", amount: 98765, metadata: { patient_id: "patient", target_id: "quote", payment_kind: "homecare" } };
  assert.equal(matchesMarketplacePayment(proof, expected), true);
  for (const patch of [{ amount: 1 }, { currency: "USD" }, { status: "pending" }, { reference: "other" }, { metadata: { ...proof.metadata, patient_id: "other" } }, { metadata: { ...proof.metadata, target_id: "other" } }]) {
    assert.equal(matchesMarketplacePayment({ ...proof, ...patch }, expected), false);
  }
});
test("medication delivery requires both pharmacy readiness and verified payment", () => {
  assert.equal(canDeliverPaidOrder({ status: "ready", payment_status: "paid", payment_reference: "PAY-123" }), true);
  assert.equal(canDeliverPaidOrder({ status: "ready", payment_status: "pending" }), false);
  assert.equal(canDeliverPaidOrder({ status: "accepted", payment_status: "paid", payment_reference: "PAY-123" }), false);
  assert.equal(canDeliverPaidOrder({ status: "ready", payment_status: "paid" }), false);
});