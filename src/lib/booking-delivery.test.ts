import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentCalendar } from "./appointment-calendar.ts";
import { deliveryBelongsToOrder, hasDeliveryCoordinates } from "./delivery-policy.ts";

test("calendar uses the booked 60-minute slot rather than a fixed half hour", () => {
  const result = appointmentCalendar({ id: "appointment-42", scheduledAt: "2026-10-20T10:00:00+02:00", durationMinutes: 60, doctor: "Doctor A", location: "Clinic, Room; 1" }, new Date("2026-10-19T21:30:00Z"));
  assert.ok(result.includes("DTSTART:20261020T080000Z\r\nDTEND:20261020T090000Z"));
  assert.ok(result.includes("UID:appointment-42@healthreachcare.co.za"));
  assert.ok(result.includes("LOCATION:Clinic\\, Room\\; 1"));
});
test("delivery accepts zero coordinates and rejects missing or out-of-range locations", () => {
  assert.equal(hasDeliveryCoordinates({ lat: 0, lng: 18 }), true);
  assert.equal(hasDeliveryCoordinates({ lat: -26, lng: 0 }), true);
  assert.equal(hasDeliveryCoordinates({ lat: null, lng: 18 }), false);
  assert.equal(hasDeliveryCoordinates({ lat: -91, lng: 18 }), false);
});
test("tracking matches a sibling medicine in the same package but not another patient's package", () => {
  const order = { id: "medicine-1", order_group_id: "package-1" };
  assert.equal(deliveryBelongsToOrder({ order_id: "medicine-2", order_group_id: "package-1" }, order), true);
  assert.equal(deliveryBelongsToOrder({ order_id: "medicine-2", order_group_id: "package-2" }, order), false);
  assert.equal(deliveryBelongsToOrder({ order_id: "medicine-1" }, order), true);
});