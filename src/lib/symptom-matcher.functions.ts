import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHARMACY_SERVICES, DOCTOR_SPECIALTIES } from "@/lib/services";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const inputSchema = z.object({
  symptoms: z.string().min(3).max(800),
});

const SYSTEM = `You are HEALTHREACH's triage matcher for South African patients.
Given a patient's symptoms or concern, suggest the most relevant DOCTOR SPECIALTIES and PHARMACY SERVICES from the provided lists.
- Be conservative; pick 1-3 specialties and 1-4 pharmacy services.
- For red-flag symptoms (chest pain, stroke signs, severe bleeding, breathing difficulty, suicidal thoughts), set urgent=true and add a short note telling the patient to call 10177 or go to ER.
- Output via the suggest_matches tool only.`;

export const matchSymptoms = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { specialties: [], services: [], reasoning: "AI matcher not configured", urgent: false, providers: { doctors: [], pharmacies: [] } };
    }

    const tools = [{
      type: "function" as const,
      function: {
        name: "suggest_matches",
        description: "Return relevant doctor specialties and pharmacy services for the patient's symptoms.",
        parameters: {
          type: "object",
          properties: {
            specialties: { type: "array", items: { type: "string", enum: [...DOCTOR_SPECIALTIES] } },
            services: { type: "array", items: { type: "string", enum: [...PHARMACY_SERVICES] } },
            reasoning: { type: "string" },
            urgent: { type: "boolean" },
          },
          required: ["specialties", "services", "reasoning", "urgent"],
          additionalProperties: false,
        },
      },
    }];

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Symptoms: ${data.symptoms}\n\nSpecialties allowed: ${DOCTOR_SPECIALTIES.join(", ")}\nServices allowed: ${PHARMACY_SERVICES.join(", ")}` },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "suggest_matches" } },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI is busy — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please top up.");
      throw new Error(`AI error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try { parsed = JSON.parse(call?.function?.arguments ?? "{}"); } catch { /* noop */ }
    const specialties: string[] = Array.isArray(parsed.specialties) ? parsed.specialties : [];
    const services: string[] = Array.isArray(parsed.services) ? parsed.services : [];
    const reasoning: string = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
    const urgent: boolean = !!parsed.urgent;

    // Fetch matching providers
    const [doctorsRes, pharmaciesRes] = await Promise.all([
      specialties.length
        ? supabaseAdmin.from("doctors")
            .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count")
            .eq("is_active", true)
            .in("specialty", specialties)
            .limit(12)
        : Promise.resolve({ data: [] as any[] }),
      services.length
        ? supabaseAdmin.from("profiles")
            .select("user_id, organization_name, full_name, address, services")
            .eq("approval_status", "approved")
            .not("organization_name", "is", null)
            .overlaps("services", services)
            .limit(12)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      specialties,
      services,
      reasoning,
      urgent,
      providers: {
        doctors: (doctorsRes.data ?? []) as any[],
        pharmacies: (pharmaciesRes.data ?? []) as any[],
      },
    };
  });
