import assert from "node:assert/strict";
import test from "node:test";
import {
  isIdentityVerified,
  isValidIdentityNumber,
  isVerificationComplete,
} from "./patient-verification.ts";
import { isPrescriptionRefillEligible, prescriptionValidity } from "./prescription-eligibility.ts";
import { isOwnerPrivateFilePath, validatePrivateFile } from "./private-file-policy.ts";

test("identity number format checks accept valid SA IDs and passport-like values", () => {
  assert.equal(isValidIdentityNumber("8001015009087"), true);
  assert.equal(isValidIdentityNumber("A1234567"), true);
  assert.equal(isValidIdentityNumber("8002315009087"), false);
  assert.equal(isValidIdentityNumber("1234567890123"), false);
  assert.equal(isValidIdentityNumber("12345678901234"), false);
  assert.equal(isValidIdentityNumber("12345"), false);
});

test("submitted identity steps are not treated as verified until backend status is approved", () => {
  const submitted = {
    id_document_path: "patient/identity/id.jpg",
    selfie_path: "patient/identity/selfie.jpg",
    selfie_with_id_path: "patient/identity/selfie-id.jpg",
    id_number: "A1234567",
    status: "pending",
  };
  assert.equal(isVerificationComplete(submitted), true);
  assert.equal(isIdentityVerified(submitted), false);
  assert.equal(isIdentityVerified({ ...submitted, status: "approved" }), true);
  assert.equal(isIdentityVerified({ ...submitted, id_document_path: null, status: "approved" }), false);
});

test("refill eligibility requires approval, non-expiry, repeats, and acceptable risk", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  const approved = {
    status: "approved",
    expires_at: "2026-10-20T12:00:00Z",
    repeats_total: 3,
    repeats_used: 2,
    fraud_score: 20,
  };
  assert.equal(isPrescriptionRefillEligible(approved, now), true);
  assert.equal(prescriptionValidity(approved, now).state, "expiring");
  assert.equal(isPrescriptionRefillEligible({ ...approved, status: "pending" }, now), false);
  assert.equal(isPrescriptionRefillEligible({ ...approved, expires_at: "2026-10-16T12:00:00Z" }, now), false);
  assert.equal(isPrescriptionRefillEligible({ ...approved, repeats_used: 3 }, now), false);
  assert.equal(isPrescriptionRefillEligible({ ...approved, fraud_score: 75 }, now), false);
  assert.equal(isPrescriptionRefillEligible({ ...approved, expires_at: "not-a-date" }, now), false);
});

test("private upload paths are restricted to the authenticated owner", () => {
  assert.equal(isOwnerPrivateFilePath("prescriptions", "patient-a/file.jpg", "patient-a"), true);
  assert.equal(isOwnerPrivateFilePath("prescriptions", "patient-b/file.jpg", "patient-a"), false);
  assert.equal(isOwnerPrivateFilePath("documents", "documents/patient-a/id.pdf", "patient-a"), true);
});

test("prescription files require the allowed size, declared type, and matching file signature", async () => {
  const validJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "rx.jpg", { type: "image/jpeg" });
  const spoofedJpeg = new File(["not an image"], "rx.jpg", { type: "image/jpeg" });
  const webp = new File(["RIFF"], "rx.webp", { type: "image/webp" });
  const tooLarge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "rx.jpg", { type: "image/jpeg" });
  assert.equal(await validatePrivateFile(validJpeg, "prescriptions"), null);
  assert.match(await validatePrivateFile(spoofedJpeg, "prescriptions") ?? "", /contents do not match/);
  assert.match(await validatePrivateFile(webp, "prescriptions") ?? "", /must be PDF, JPEG, or PNG/);
  assert.match(await validatePrivateFile(tooLarge, "prescriptions") ?? "", /no larger than 8 MB/);
});
