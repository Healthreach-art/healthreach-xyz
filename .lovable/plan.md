# Unify Documents into Prescription Library

## Goal
Merge the separate "My Documents" vault into the **Prescription Library** as one combined flow. When a patient (or family member) uploads a prescription, their ID + selfie + selfie-with-ID + ID number are submitted together and visible to the pharmacy for self-screening.

## Changes

### 1. Unified Prescription Library page
- Rename `/dashboard/patient/prescriptions` to be the single source for all patient identity + prescription docs.
- At the top: a single **Identity verification** card (existing `PatientVerificationCard`) — submitted once, auto-attaches to every order.
- Below: prescription uploader + library list (existing `PrescriptionPicker`/`PrescriptionUploader`).
- A single "Save & add to library" action that:
  1. Saves identity fields if dirty.
  2. Uploads the prescription.
  3. Links them in one submission.

### 2. Remove standalone "My documents" route
- Delete `/dashboard/patient/documents` route file.
- Remove its entry from `AppSidebar.tsx`.
- Anywhere we link to `/dashboard/patient/documents`, redirect to `/dashboard/patient/prescriptions`.

### 3. Family members — per-person document + prescription library
- Family member edit page already supports ID number + ID document + selfie-with-ID via `family_members` columns.
- Add a **per-family-member prescription library**: extend `prescription_uploads` with optional `family_member_id` column.
- On `/dashboard/patient/family/[memberId]` (or inline on family page), show that member's documents + their own prescriptions.
- In `PrescriptionUploader`, accept a `familyMemberId` prop; tag the upload to that family member if set.
- In checkout, when ordering for a family member, only show prescriptions where `family_member_id = member.id`, and attach the member's documents.

### 4. Pharmacy view — show all patient/recipient documents
- In pharmacy order detail / prescription review (`PharmacyReviewDialog`), when reviewing an upload:
  - Show patient `patient_verifications` (ID doc, selfie, selfie-with-ID, ID number).
  - If `family_member_id` set, also show the family member's ID doc + selfie-with-ID + ID number from `family_members`.
- RLS already permits pharmacies to view `patient_verifications` for their patients. Add RLS for pharmacies to view `family_members` rows tied to orders they receive.

## Files

**Migration:**
- Add `family_member_id uuid` to `prescription_uploads` (nullable, FK family_members).
- Add RLS policy on `family_members` allowing pharmacy to SELECT when there's a related order or prescription_upload where `pharmacy_id = auth.uid()`.

**Edit:**
- `src/routes/dashboard.patient.prescriptions.tsx` — fold in `PatientVerificationCard` at top.
- `src/components/AppSidebar.tsx` — remove "My documents" item.
- `src/components/PrescriptionVerification.tsx` (PrescriptionUploader) — accept optional `familyMemberId`, save it on insert.
- `src/components/PrescriptionPicker.tsx` — accept `familyMemberId` to filter library + tag new uploads.
- `src/routes/dashboard.patient.family.tsx` — per-member documents (already partial via `RecipientDocumentsBlock`) + prescription library section.
- `src/routes/checkout.tsx` — when family recipient is selected, pass `familyMemberId` into picker.
- `src/components/PharmacyReviewDialog.tsx` — display attached identity docs (patient + family member).

**Delete:**
- `src/routes/dashboard.patient.documents.tsx`.

## Out of scope
- No change to pricing/checkout totals.
- No change to AI verification scoring.

Reply **"go"** to apply.