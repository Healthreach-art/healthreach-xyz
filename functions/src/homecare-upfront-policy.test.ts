import test from "node:test";
import assert from "node:assert/strict";
import { homecarePriceCents, careVisitsOverlap, withinCareHours } from "./homecare-upfront-policy.ts";

const provider = { approval_status: "approved", is_active: true, services: ["Elderly care"], hourly_rate: 275.50 };
test("upfront care uses the saved rate and duration, without a quotation", () => {
  assert.equal(homecarePriceCents(provider, "Elderly care", 2), 55100);
  assert.equal(homecarePriceCents({ ...provider, hourly_rate: 300 }, "Elderly care", 2), 60000);
});

test("automatic service confirmation requires explicit saved availability", () => {
  assert.equal(withinCareHours("Mon–Fri 08:00–17:00", "2026-11-02T10:00:00+02:00", 2), true);
  assert.equal(withinCareHours("Mon–Fri 08:00–17:00", "2026-11-01T10:00:00+02:00", 2), false);
  assert.equal(withinCareHours("Mon–Fri 08:00–17:00", "2026-11-02T16:00:00+02:00", 2), false);
  assert.equal(withinCareHours("Contact me", "2026-11-02T10:00:00+02:00", 2), false);
});
test("unpriced, unapproved, inactive, demo or unsupported care cannot be paid", () => {
  for (const patch of [{ hourly_rate: undefined }, { hourly_rate: 0 }, { approval_status: "pending" }, { is_active: false }, { is_demo: true }, { services: ["Other care"] }]) {
    assert.equal(homecarePriceCents({ ...provider, ...patch }, "Elderly care", 2), null);
  }
});
test("unpaid service never counts as a scheduled confirmed booking", () => {
  const visit = { preferred_at: "2026-11-01T10:00:00+02:00", duration_hours: 2, status: "awaiting_payment", reservation_expires_at: "2026-10-20T02:00:00Z" };
  assert.equal(careVisitsOverlap("2026-11-01T11:00:00+02:00", 1, visit, Date.parse("2026-10-20T01:00:00Z")), true);
  assert.equal(careVisitsOverlap("2026-11-01T11:00:00+02:00", 1, visit, Date.parse("2026-10-20T03:00:00Z")), false);
  assert.equal(careVisitsOverlap("2026-11-01T12:00:00+02:00", 1, { ...visit, status: "scheduled" }, 0), false);
  assert.equal(careVisitsOverlap("2026-11-01T11:00:00+02:00", 1, { ...visit, status: "scheduled" }, 0), true);
});