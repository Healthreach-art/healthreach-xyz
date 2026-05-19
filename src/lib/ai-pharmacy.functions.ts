import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ problem: z.string().min(3).max(2000) });

interface PharmacyMatch {
  pharmacy_id: string;
  name: string;
  address: string;
  match_reason: string;
  confidence: number;
}

export const findPharmaciesForProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load all approved pharmacies
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "pharmacy");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return { matches: [] as PharmacyMatch[], summary: "No pharmacies available yet." };
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, organization_name, address")
      .in("user_id", ids)
      .eq("approval_status", "approved");

    const pharmacies = (profs ?? []).map((p: any) => ({
      id: p.user_id,
      name: p.organization_name || "Pharmacy",
      address: p.address || "",
    }));
    if (!pharmacies.length) return { matches: [], summary: "No approved pharmacies available." };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      // Fallback: return all
      return {
        summary: "Here are pharmacies near you. (AI matching unavailable)",
        matches: pharmacies.slice(0, 6).map((p) => ({
          pharmacy_id: p.id, name: p.name, address: p.address,
          match_reason: "Available pharmacy in your area", confidence: 70,
        })),
      };
    }

    const sys = `You are a healthcare matching assistant for a South African pharmacy platform.
A patient describes a health problem. From a list of pharmacies, choose up to 5 that are most relevant,
considering location, name hints (e.g. "clinic", "specialty"), and general availability.
Always include reasoning. Never give medical diagnosis — only suggest pharmacies for consultation.`;

    const userMsg = `PATIENT PROBLEM:\n${data.problem}\n\nPHARMACIES (JSON):\n${JSON.stringify(pharmacies)}`;

    const tools = [{
      type: "function",
      function: {
        name: "recommend_pharmacies",
        description: "Recommend pharmacies for this patient's problem.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief friendly summary for the patient (max 2 sentences, no diagnosis)" },
            matches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  pharmacy_id: { type: "string" },
                  match_reason: { type: "string", description: "Short reason this pharmacy fits, max 1 sentence" },
                  confidence: { type: "number", description: "0-100" },
                },
                required: ["pharmacy_id", "match_reason", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["summary", "matches"],
          additionalProperties: false,
        },
      },
    }];

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
          tools,
          tool_choice: { type: "function", function: { name: "recommend_pharmacies" } },
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = await res.json();
      const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : { summary: "", matches: [] };
      const byId = Object.fromEntries(pharmacies.map((p) => [p.id, p]));
      const matches: PharmacyMatch[] = (parsed.matches ?? [])
        .map((m: any) => {
          const ph = byId[m.pharmacy_id];
          if (!ph) return null;
          return { pharmacy_id: ph.id, name: ph.name, address: ph.address, match_reason: m.match_reason, confidence: Math.round(m.confidence ?? 70) };
        })
        .filter(Boolean) as PharmacyMatch[];
      return { summary: parsed.summary || "Here are pharmacies that may help.", matches };
    } catch (e) {
      return {
        summary: "Here are pharmacies near you.",
        matches: pharmacies.slice(0, 6).map((p) => ({
          pharmacy_id: p.id, name: p.name, address: p.address,
          match_reason: "Available pharmacy", confidence: 60,
        })),
      };
    }
  });
