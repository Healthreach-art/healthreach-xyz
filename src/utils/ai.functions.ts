import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { readAuthorizedPrivateFile } from "@/lib/r2-storage.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

// ------- Prescription OCR -------
const ocrInput = z.object({
  fileUrl: z.string().url(),
  mimeType: z.string().min(3).max(100),
});

function assertFirebaseStorageUrl(rawUrl: string) {
  const allowedBucket = (
    process.env.FIREBASE_STORAGE_BUCKET
    ?? process.env.VITE_FIREBASE_STORAGE_BUCKET
    ?? "healthreachcare-prod.firebasestorage.app"
  ).trim();
  let target: URL;
  try { target = new URL(rawUrl); } catch { throw new Error("Invalid file URL"); }
  if (target.protocol !== "https:") throw new Error("Invalid file URL");
  const match = target.pathname.match(/^\/v0\/b\/([^/]+)\/o\/.+$/);
  if (
    target.hostname !== "firebasestorage.googleapis.com"
    || !match
    || decodeURIComponent(match[1]) !== allowedBucket
  ) {
    throw new Error("File URL must be a Firebase Storage URL");
  }
}

export const parsePrescription = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => ocrInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "AI not configured", medications: [] as any[], doctor: null, notes: null };

    // Fetch the file and convert to base64 data URL (gateway accepts image_url)
    let imageDataUrl: string | null = null;
    try {
      assertFirebaseStorageUrl(data.fileUrl);
      const r = await fetch(data.fileUrl);
      if (!r.ok) return { error: `Could not fetch file (${r.status})`, medications: [], doctor: null, notes: null };
      const buf = new Uint8Array(await r.arrayBuffer());
      // base64 encode
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      imageDataUrl = `data:${data.mimeType};base64,${b64}`;
    } catch (e: any) {
      return { error: e?.message || "Could not download prescription file", medications: [], doctor: null, notes: null };
    }

    const tools = [{
      type: "function",
      function: {
        name: "extract_prescription",
        description: "Extract prescription details from an image of a doctor's prescription.",
        parameters: {
          type: "object",
          properties: {
            doctor: { type: "string", description: "Prescribing doctor name, or empty string if unknown" },
            patient: { type: "string", description: "Patient name if visible, or empty string" },
            date: { type: "string", description: "Prescription date if visible (YYYY-MM-DD), or empty string" },
            medications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Medication name (generic or brand)" },
                  dosage: { type: "string", description: "Strength/dosage e.g. '500 mg'" },
                  frequency: { type: "string", description: "How often, e.g. 'twice daily for 7 days'" },
                  quantity: { type: "string", description: "Quantity prescribed if visible" },
                },
                required: ["name", "dosage", "frequency", "quantity"],
                additionalProperties: false,
              },
            },
            notes: { type: "string", description: "Any other instructions visible" },
          },
          required: ["doctor", "patient", "date", "medications", "notes"],
          additionalProperties: false,
        },
      },
    }];

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: "You read prescription images and extract structured data. Be conservative — leave fields blank if uncertain." },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the prescription details from this image." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "extract_prescription" } },
    };

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("AI OCR error", res.status, t);
      if (res.status === 429) return { error: "AI rate limit — try again in a moment", medications: [], doctor: null, notes: null };
      if (res.status === 402) return { error: "AI credits exhausted", medications: [], doctor: null, notes: null };
      return { error: "AI request failed", medications: [], doctor: null, notes: null };
    }
    const json: any = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { error: "AI returned no data", medications: [], doctor: null, notes: null };
    try {
      const parsed = JSON.parse(args);
      return {
        error: null as string | null,
        doctor: parsed.doctor || null,
        patient: parsed.patient || null,
        date: parsed.date || null,
        medications: Array.isArray(parsed.medications) ? parsed.medications : [],
        notes: parsed.notes || null,
      };
    } catch {
      return { error: "Could not parse AI response", medications: [], doctor: null, notes: null };
    }
  });

// ------- Drug Interactions -------
const interactionsInput = z.object({
  medications: z.array(z.string().min(1).max(200)).min(1).max(20),
});

export const checkDrugInteractions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => interactionsInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "AI not configured", interactions: [], overall_risk: "unknown" as const };

    const tools = [{
      type: "function",
      function: {
        name: "report_interactions",
        description: "Report drug-drug interactions and warnings.",
        parameters: {
          type: "object",
          properties: {
            overall_risk: { type: "string", enum: ["none", "low", "moderate", "high"] },
            interactions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  drugs: { type: "array", items: { type: "string" }, description: "The two or more drugs involved" },
                  severity: { type: "string", enum: ["minor", "moderate", "major"] },
                  description: { type: "string", description: "Plain-language description of the interaction" },
                  recommendation: { type: "string", description: "What the patient should do" },
                },
                required: ["drugs", "severity", "description", "recommendation"],
                additionalProperties: false,
              },
            },
            general_warnings: { type: "array", items: { type: "string" }, description: "General warnings, e.g. avoid alcohol, take with food" },
          },
          required: ["overall_risk", "interactions", "general_warnings"],
          additionalProperties: false,
        },
      },
    }];

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical pharmacology assistant. Identify potentially harmful drug-drug interactions. Be cautious — always recommend consulting a pharmacist. Only flag well-known interactions; do not invent any." },
        { role: "user", content: `Check for interactions between: ${data.medications.join(", ")}` },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "report_interactions" } },
    };

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("AI interactions error", res.status, t);
      if (res.status === 429) return { error: "AI rate limit — try again in a moment", interactions: [], overall_risk: "unknown" as const };
      if (res.status === 402) return { error: "AI credits exhausted", interactions: [], overall_risk: "unknown" as const };
      return { error: "AI request failed", interactions: [], overall_risk: "unknown" as const };
    }
    const json: any = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { error: "AI returned no data", interactions: [], overall_risk: "unknown" as const };
    try {
      const parsed = JSON.parse(args);
      return {
        error: null as string | null,
        overall_risk: parsed.overall_risk ?? "unknown",
        interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
        general_warnings: Array.isArray(parsed.general_warnings) ? parsed.general_warnings : [],
      };
    } catch {
      return { error: "Could not parse AI response", interactions: [], overall_risk: "unknown" as const };
    }
  });

// ============================================================
// ADVANCED AI PRESCRIPTION VERIFICATION ENGINE
// Deep analysis: doctor info, patient info, validation,
// fraud signals, trust score. Persists results onto the
// prescription_uploads row + audit log.
// ============================================================

const verifyInput = z.object({
  uploadId: z.string().uuid(),
});

export interface VerifyResult {
  error: string | null;
  trust_score: number;            // 0-100 — AI confidence
  risk_level: "low" | "medium" | "high" | "unknown";
  summary: string;
  doctor: {
    name: string | null;
    practice_name: string | null;
    hpcsa_number: string | null;
    practice_number: string | null;
    address: string | null;
    contact: string | null;
    signature_present: boolean;
    stamp_present: boolean;
  };
  patient: {
    name: string | null;
    id_number: string | null;
    date_of_birth: string | null;
    gender: string | null;
    address: string | null;
  };
  prescription: {
    issue_date: string | null;
    expiry_estimate: string | null;
    repeats: number | null;
    is_chronic: boolean;
    is_controlled: boolean;
  };
  medications: { name: string; strength: string; quantity: string; instructions: string; route: string }[];
  validation: { check: string; passed: boolean; detail: string }[];
  fraud_signals: { label: string; detail: string; severity: "low" | "medium" | "high" }[];
  missing_fields: string[];
}

const EMPTY_RESULT: Omit<VerifyResult, "error"> = {
  trust_score: 0,
  risk_level: "unknown",
  summary: "",
  doctor: { name: null, practice_name: null, hpcsa_number: null, practice_number: null, address: null, contact: null, signature_present: false, stamp_present: false },
  patient: { name: null, id_number: null, date_of_birth: null, gender: null, address: null },
  prescription: { issue_date: null, expiry_estimate: null, repeats: null, is_chronic: false, is_controlled: false },
  medications: [],
  validation: [],
  fraud_signals: [],
  missing_fields: [],
};

export const verifyPrescription = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => verifyInput.parse(input))
  .handler(async ({ data, context }): Promise<VerifyResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ...EMPTY_RESULT, error: "AI not configured" };
    const { data: upload, error: uploadError } = await firestoreAdmin
      .from("prescription_uploads")
      .select("id, patient_id, file_path, mime_type")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload || upload.patient_id !== context.userId) {
      throw new Response("Prescription was not found.", { status: 404 });
    }
    if (upload.mime_type === "application/pdf") {
      return { ...EMPTY_RESULT, error: "PDF verification not supported yet — upload JPG/PNG." };
    }
    if (upload.mime_type !== "image/jpeg" && upload.mime_type !== "image/png") {
      return { ...EMPTY_RESULT, error: "AI extraction supports JPEG and PNG files only." };
    }

    // Resolve the exact stored file only after checking its authenticated owner.
    let imageDataUrl: string;
    try {
      const file = await readAuthorizedPrivateFile({
        userId: context.userId,
        email: typeof context.claims.email === "string" ? context.claims.email : null,
        authorization: `Bearer ${context.idToken}`,
      }, "prescriptions", upload.file_path);
      const responseType = file.contentType?.split(";")[0];
      if (responseType !== upload.mime_type) {
        return { ...EMPTY_RESULT, error: "Stored prescription file type does not match its record." };
      }
      const buf = new Uint8Array(file.body);
      if (buf.length > 8 * 1024 * 1024) {
        return { ...EMPTY_RESULT, error: "Prescription file is larger than the supported size." };
      }
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      imageDataUrl = `data:${upload.mime_type};base64,${btoa(bin)}`;
    } catch (e: any) {
      return { ...EMPTY_RESULT, error: e?.message || "Could not download prescription file" };
    }

    const tool = {
      type: "function",
      function: {
        name: "verify_prescription",
        description: "Extract visible information from a South African prescription and report uncertain fields or review signals. This output is advisory and is not an approval.",
        parameters: {
          type: "object",
          properties: {
            trust_score: { type: "number", description: "0-100 confidence in the extraction and visible document features, not proof of authenticity or validity" },
            risk_level: { type: "string", enum: ["low", "medium", "high"] },
            summary: { type: "string", description: "One-paragraph pharmacist-style assessment" },
            doctor: {
              type: "object",
              properties: {
                name: { type: "string" }, practice_name: { type: "string" },
                hpcsa_number: { type: "string", description: "HPCSA registration number (e.g. MP0123456) — empty if not visible" },
                practice_number: { type: "string", description: "Practice/BHF number — empty if not visible" },
                address: { type: "string" }, contact: { type: "string" },
                signature_present: { type: "boolean" }, stamp_present: { type: "boolean" },
              },
              required: ["name","practice_name","hpcsa_number","practice_number","address","contact","signature_present","stamp_present"],
              additionalProperties: false,
            },
            patient: {
              type: "object",
              properties: {
                name: { type: "string" }, id_number: { type: "string" },
                date_of_birth: { type: "string" }, gender: { type: "string" }, address: { type: "string" },
              },
              required: ["name","id_number","date_of_birth","gender","address"],
              additionalProperties: false,
            },
            prescription: {
              type: "object",
              properties: {
                issue_date: { type: "string", description: "YYYY-MM-DD if visible" },
                expiry_estimate: { type: "string", description: "YYYY-MM-DD — issue + 6 months for chronic, 30 days for acute" },
                repeats: { type: "number" },
                is_chronic: { type: "boolean" },
                is_controlled: { type: "boolean", description: "Schedule 5/6 controlled substance" },
              },
              required: ["issue_date","expiry_estimate","repeats","is_chronic","is_controlled"],
              additionalProperties: false,
            },
            medications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" }, strength: { type: "string" },
                  quantity: { type: "string" }, instructions: { type: "string" },
                  route: { type: "string", description: "Oral / Topical / IV / etc." },
                },
                required: ["name","strength","quantity","instructions","route"],
                additionalProperties: false,
              },
            },
            validation: {
              type: "array",
              description: "Structural checks: signature exists, practice number present, date valid, repeats sane, medicines recognized, antibiotic-no-repeat, controlled-substance handling, layout consistency, image clarity",
              items: {
                type: "object",
                properties: { check: { type: "string" }, passed: { type: "boolean" }, detail: { type: "string" } },
                required: ["check","passed","detail"],
                additionalProperties: false,
              },
            },
            fraud_signals: {
              type: "array",
              description: "Tampering or fraud indicators: edited PDF, photoshop artifacts, inconsistent fonts, cropped script, screenshot tampering, AI-generated look, missing signature/stamp, invalid HPCSA, blurry/illegible",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" }, detail: { type: "string" },
                  severity: { type: "string", enum: ["low","medium","high"] },
                },
                required: ["label","detail","severity"],
                additionalProperties: false,
              },
            },
            missing_fields: { type: "array", items: { type: "string" } },
          },
          required: ["trust_score","risk_level","summary","doctor","patient","prescription","medications","validation","fraud_signals","missing_fields"],
          additionalProperties: false,
        },
      },
    };

    const system = `You are an assistive document-extraction tool for South African pharmacy staff, not a verifier or prescriber.
You understand how legitimate medical prescriptions are structured: doctor header (name, HPCSA number, practice number, address, contact), patient block, medication list (name, strength, quantity, sig, route, repeats), date, signature, and stamp.
Report only visible features and extraction confidence. Do not claim that a prescription is authentic, valid, safe, approved, or suitable for dispensing; a licensed pharmacist must independently review it.
Flag visible issues for pharmacist attention, such as illegible/cropped content or apparently missing signature/stamp. Do not infer tampering, invalidity, or medicine risk without clear evidence. Leave uncertain fields empty rather than fabricating.
The risk level is a triage hint only: low = fewer visible extraction concerns, medium = review recommended, high = prominent visible concerns; none of these levels establish authenticity or replace pharmacy review.`;

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: [
          { type: "text", text: "Verify this prescription. Extract every structural field and flag anything suspicious." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ]},
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "verify_prescription" } },
    };

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 429) return { ...EMPTY_RESULT, error: "AI rate limit — try again in a moment" };
      if (res.status === 402) return { ...EMPTY_RESULT, error: "AI credits exhausted" };
      return { ...EMPTY_RESULT, error: `AI request failed (${res.status})` };
    }
    const json: any = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { ...EMPTY_RESULT, error: "AI returned no data" };

    let parsed: any;
    try { parsed = JSON.parse(args); } catch { return { ...EMPTY_RESULT, error: "Could not parse AI response" }; }

    const result: VerifyResult = {
      error: null,
      trust_score: Math.max(0, Math.min(100, Number(parsed.trust_score) || 0)),
      risk_level: parsed.risk_level ?? "unknown",
      summary: parsed.summary || "",
      doctor: { ...EMPTY_RESULT.doctor, ...(parsed.doctor || {}) },
      patient: { ...EMPTY_RESULT.patient, ...(parsed.patient || {}), id_number: null },
      prescription: { ...EMPTY_RESULT.prescription, ...(parsed.prescription || {}) },
      medications: Array.isArray(parsed.medications) ? parsed.medications : [],
      validation: Array.isArray(parsed.validation) ? parsed.validation : [],
      fraud_signals: Array.isArray(parsed.fraud_signals) ? parsed.fraud_signals : [],
      missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
    };

    // Persist extraction as assistive metadata only; pharmacy status is untouched.
    const aiFraud = 100 - result.trust_score;
    const { data: existing, error: existingError } = await firestoreAdmin
      .from("prescription_uploads")
      .select("patient_id, fraud_score, fraud_signals")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || existing.patient_id !== context.userId) {
      throw new Response("Prescription was not found.", { status: 404 });
    }
    const prevScore = Number(existing.fraud_score ?? 0);
    const prevSignals = Array.isArray(existing.fraud_signals) ? existing.fraud_signals as Array<{ label: string }> : [];
    const aiSignals = result.fraud_signals.map((signal) => ({
      label: `ai_${signal.label}`.toLowerCase().replace(/\s+/g, "_"),
      detail: signal.detail,
    }));
    const mergedSignals = [...prevSignals.filter((signal) => !String(signal.label).startsWith("ai_")), ...aiSignals];
    const { error: persistError } = await firestoreAdmin
      .from("prescription_uploads")
      .update({
        fraud_score: Math.max(prevScore, aiFraud),
        fraud_signals: mergedSignals,
        ai_trust_score: result.trust_score,
        ai_risk_level: result.risk_level,
        ai_summary: result.summary,
        ai_processed_at: new Date().toISOString(),
        ai_extraction: {
          doctor_name: result.doctor.name,
          practice_name: result.doctor.practice_name,
          hpcsa_number: result.doctor.hpcsa_number,
          issue_date: result.prescription.issue_date,
          expiry_estimate: result.prescription.expiry_estimate,
          repeats: result.prescription.repeats,
          signature_present: result.doctor.signature_present,
          medications: result.medications,
        },
      })
      .eq("id", data.uploadId);
    if (persistError) throw new Error("Could not save prescription extraction results.");
    const { error: auditError } = await firestoreAdmin.from("prescription_audit_log").insert({
      prescription_upload_id: data.uploadId,
      actor_id: context.userId,
      action: "ai_verification",
      notes: `AI trust ${result.trust_score}/100 · ${result.risk_level} risk · ${result.fraud_signals.length} flags`,
    });
    if (auditError) throw new Error("Could not record prescription extraction audit event.");

    return result;
  });
