import { test } from "node:test";
import assert from "node:assert/strict";
import { validDoctorPrice } from "./doctor-price-policy.ts";

test("doctors choose their own exact rand prices without an invented default", () => {
  assert.equal(validDoctorPrice(723.45), true);
  assert.equal(validDoctorPrice(null), false);
  assert.equal(validDoctorPrice(""), false);
  assert.equal(validDoctorPrice(-1), false);
  assert.equal(validDoctorPrice(100.001), false);
});