import { test } from "node:test";
import assert from "node:assert/strict";
import { availableDoctorSlots } from "./doctor-slots.js";
test("doctor availability is Johannesburg time and excludes overlapping reservations", () => {
  const rows = [{ day_of_week: 2, start_hour: 9, end_hour: 11, slot_minutes: 60, is_active: true }];
  const slots = availableDoctorSlots(rows, [{ scheduled_at: "2026-10-20T07:30:00Z", duration_minutes: 30, status: "pending" }], Date.parse("2026-10-19T21:30:00Z"));
  assert.equal(slots.some(slot => slot.scheduledAt === "2026-10-20T07:00:00.000Z"), false);
  assert.deepEqual(slots[0], { scheduledAt: "2026-10-20T08:00:00.000Z", durationMinutes: 60 });
  assert.equal(availableDoctorSlots([], [], Date.now()).length, 0);
});
test("cancelled appointments do not block a real listed slot", () => {
  const slots = availableDoctorSlots([{ day_of_week: 2, start_hour: 9, end_hour: 10, slot_minutes: 60, is_active: true }], [{ scheduled_at: "2026-10-20T07:00:00Z", duration_minutes: 60, status: "cancelled" }], Date.parse("2026-10-19T21:30:00Z"));
  assert.equal(slots[0]?.scheduledAt, "2026-10-20T07:00:00.000Z");
});