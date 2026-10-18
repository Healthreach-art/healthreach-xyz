import assert from "node:assert/strict";
import test from "node:test";
import {
  googleAuthErrorMessage,
  roleAfterLookupFailure,
  roleFromRows,
  roleToRepair,
} from "./auth-session-policy.ts";

test("persisted role selection prioritizes only known elevated roles", () => {
  assert.equal(roleFromRows(["doctor", "admin"]), "admin");
  assert.equal(roleFromRows(["patient", "homecare_operations"]), "homecare_operations");
  assert.equal(roleFromRows(["unrecognized", "doctor"]), "doctor");
  assert.equal(roleFromRows(["unrecognized"]), null);
});

test("role lookup failures use the least-privileged role and never repair admin or operations", () => {
  assert.equal(roleAfterLookupFailure(), "patient");
  assert.equal(roleToRepair("pharmacy"), "pharmacy");
  assert.equal(roleToRepair("admin"), "patient");
  assert.equal(roleToRepair("homecare_operations"), "patient");
});

test("Google sign-in errors identify Firebase configuration requirements", () => {
  assert.match(
    googleAuthErrorMessage({ code: "auth/unauthorized-domain" }, "sign-in"),
    /Authorized domains/,
  );
  assert.match(
    googleAuthErrorMessage({ code: "auth/operation-not-allowed" }, "sign-up"),
    /Enable the Google provider/,
  );
  assert.match(
    googleAuthErrorMessage(new Error("Firebase API key is not configured"), "sign-in"),
    /Firebase API key/,
  );
});
