import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

// ------- Prescription OCR -------
const ocrInput = z.object({
  fileUrl: z.string().url(),
  mimeType: z.string().min(3).max(100),
});

export const parsePrescription = createServerFn({ method: "POST" })
  .inputValidator((input) => ocrInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "AI not configured", medications: [] as any[], doctor: null, notes: null };

    // Fetch the file and convert to base64 data URL (gateway accepts image_url)
    let imageDataUrl: string | null = null;
    try {
      const r = await fetch(data.fileUrl);
      if (!r.ok) return { error: `Could not fetch file (${r.status})`, medications: [], doctor: null, notes: null };
      const buf = new Uint8Array(await r.arrayBuffer());
      // base64 encode
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      imageDataUrl = `data:${data.mimeType};base64,${b64}`;
    } catch (e) {
      return { error: "Could not download prescription file", medications: [], doctor: null, notes: null };
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
