import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesDoctorPayment } from "./doctor-payment-policy.js";
test("doctor confirmation requires success, exact ZAR amount and the same appointment reference", () => {
  const payment = { status: "success", reference: "ref-1", amount: 45000, currency: "ZAR", metadata: { appointment_id: "appointment-1", payment_type: "doctor_booking_fee" } };
  assert.equal(matchesDoctorPayment(payment, "ref-1", "appointment-1", 45000), true);
  assert.equal(matchesDoctorPayment({ ...payment, status: "pending" }, "ref-1", "appointment-1", 45000), false);
  assert.equal(matchesDoctorPayment(payment, "ref-1", "appointment-1", 45001), false);
  assert.equal(matchesDoctorPayment(payment, "ref-1", "appointment-2", 45000), false);
  assert.equal(matchesDoctorPayment({ ...payment, currency: "USD" }, "ref-1", "appointment-1", 45000), false);
  assert.equal(matchesDoctorPayment(payment, "ref-2", "appointment-1", 45000), false);
});