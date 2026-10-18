import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmHomecareBooking,
  filterHomecareRequestsForCoordinator,
  getHomecareStatusSummary,
  isHomecareServiceActive,
  isHomecareServicePriceValid,
} from "./homecare.ts";

test("booking confirmation requires verified backend payment", () => {
  assert.equal(canConfirmHomecareBooking({ status: "quote_accepted", payment_status: "pending" }), false);
  assert.equal(canConfirmHomecareBooking({ status: "confirmed" }), false);
  assert.equal(canConfirmHomecareBooking({ status: "quote_accepted", payment_status: "paid" }), false);
  assert.equal(canConfirmHomecareBooking({
    status: "quote_accepted",
    payment_status: "paid",
    payment_verified_at: "2026-10-18T12:00:00.000Z",
    payment_verified: false,
  }), false);
  assert.equal(canConfirmHomecareBooking({ status: "quote_accepted", payment_status: "paid", payment_verified_at: "2026-10-18T12:00:00.000Z" }), true);
});

test("coordinator booking filters map real request states to the correct dashboard buckets", () => {
  const requests = [
    { status: "pending_review" },
    { status: "quote_pending" },
    { status: "quote_accepted" },
    { status: "assigned" },
    { status: "completed" },
    { status: "cancelled" },
  ];

  assert.deepEqual(
    filterHomecareRequestsForCoordinator(requests, "incoming").map((request) => request.status),
    ["pending_review"],
  );
  assert.deepEqual(
    filterHomecareRequestsForCoordinator(requests, "awaiting_patient").map((request) => request.status),
    ["quote_pending"],
  );
  assert.deepEqual(
    filterHomecareRequestsForCoordinator(requests, "awaiting_coordinator").map((request) => request.status),
    ["quote_accepted"],
  );
  assert.deepEqual(
    filterHomecareRequestsForCoordinator(requests, "active").map((request) => request.status),
    ["assigned"],
  );
  assert.deepEqual(
    filterHomecareRequestsForCoordinator(requests, "past").map((request) => request.status),
    ["completed", "cancelled"],
  );
  assert.deepEqual(getHomecareStatusSummary(requests), {
    incoming: 1,
    awaitingPatient: 1,
    awaitingCoordinator: 1,
    confirmed: 1,
    active: 1,
    completed: 1,
    cancelled: 1,
  });
});

test("service entries must be valid before they are made active in the catalogue", () => {
  assert.equal(isHomecareServiceActive({ is_active: true }), true);
  assert.equal(isHomecareServiceActive({ is_active: false }), false);
  assert.equal(isHomecareServiceActive({ archived_at: "2026-10-18T00:00:00Z" }), false);
  assert.equal(isHomecareServicePriceValid(250), true);
  assert.equal(isHomecareServicePriceValid(-12), false);
  assert.equal(isHomecareServicePriceValid("250"), false);
});
