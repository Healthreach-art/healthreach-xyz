import { test, expect } from "bun:test";
import { validDoctorPrice } from "./doctor-price-policy";

test("doctors choose their own exact rand prices without an invented default", () => {
  expect(validDoctorPrice(723.45)).toBe(true);
  expect(validDoctorPrice(null)).toBe(false);
  expect(validDoctorPrice("")).toBe(false);
  expect(validDoctorPrice(-1)).toBe(false);
  expect(validDoctorPrice(100.001)).toBe(false);
});