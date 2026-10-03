import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";

const input = z.object({ problem: z.string().min(3).max(2000) });

interface PharmacyMatch {
  pharmacy_id: string;
  name: string;
  address: string;
  match_reason: string;
  confidence: number;
  relevant_meds: { name: string; price: number; requires_prescription: boolean }[];
}

export const findPharmaciesForProblem = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((i) => input.parse(i))
  .handler(async ({ data, context }) => {
    const { data: roles } = await firestoreAdmin.from("user_roles").select("user_id").eq("role", "pharmacy");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return { matches: [] as PharmacyMatch[], summary: "No pharmacies available yet." };
    const { data: profs } = await firestoreAdmin
      .from("profiles")
      .select("user_id, organization_name, address")
      .in("user_id", ids)
      .eq("approval_status", "approved");

    const approved = (profs ?? []).map((p: any) => ({
      id: p.user_id,
      name: p.organization_name || "Pharmacy",
      address: p.address || "",
    }));
    if (!approved.length) return { matches: [], summary: "No approved pharmacies available." };

    // Pull catalog with description so AI matches based on what each pharmacy actually stocks
    const { data: meds } = await firestoreAdmin
      .from("medications")
      .select("pharmacy_id, name, description, category, price, requires_prescription, stock_quantity")
      .in("pharmacy_id", approved.map((p) => p.id))
      .gt("stock_quantity", 0)
      .limit(800);

    const medsByPh = new Map<string, { name: string; description: string; category: string; price: number; rx: boolean }[]>();
    for (const m of meds ?? []) {
      const arr = medsByPh.get(m.pharmacy_id) ?? [];
      arr.push({
        name: m.name,
        description: (m.description || "").slice(0, 240),
        category: m.category || "",
        price: Number(m.price ?? 0),
        rx: !!m.requires_prescription,
      });
      medsByPh.set(m.pharmacy_id, arr);
    }

    const pharmacies = approved.map((p) => ({
      ...p,
      // cap to top 12 meds per pharmacy to keep prompt size reasonable
      meds: (medsByPh.get(p.id) ?? []).slice(0, 12),
    }));

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        summary: "Here are pharmacies near you. (AI matching unavailable)",
        matches: pharmacies.slice(0, 6).map((p) => ({
          pharmacy_id: p.id, name: p.name, address: p.address,
          match_reason: "Available pharmacy", confidence: 60,
          relevant_meds: p.meds.slice(0, 3).map((m) => ({ name: m.name, price: m.price, requires_prescription: m.rx })),
        })),
      };
    }

    const sys = `You are a healthcare matching assistant for a South African pharmacy platform.
A patient describes a health problem. You receive a JSON list of approved pharmacies, each with up to 12 in-stock medications and their descriptions (indications, dosage, side effects).
Pick up to 5 pharmacies most likely to help, based primarily on whether their catalog contains medication relevant to the patient's symptoms.
For each match, also list up to 3 specific medications from that pharmacy's catalog that match the problem (use the medication "name" field verbatim).
Never give a diagnosis. Never recommend prescription-only meds as a self-treatment — just note "needs a pharmacist review".`;

    const userMsg = `PATIENT PROBLEM:\n${data.problem}\n\nPHARMACIES (JSON):\n${JSON.stringify(pharmacies)}`;

    const tools = [{
      type: "function",
      function: {
        name: "recommend_pharmacies",
        description: "Recommend pharmacies and relevant in-stock medications for this patient's problem.",
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
                  match_reason: { type: "string", description: "Short reason this pharmacy fits, max 1 sentence — reference catalog when possible" },
                  confidence: { type: "number", description: "0-100" },
                  med_names: {
                    type: "array",
                    items: { type: "string" },
                    description: "Up to 3 medication names from this pharmacy's catalog that match the problem",
                  },
                },
                required: ["pharmacy_id", "match_reason", "confidence", "med_names"],
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
          const wantedNames: string[] = Array.isArray(m.med_names) ? m.med_names : [];
          const relevant_meds = ph.meds
            .filter((med: { name: string }) => wantedNames.some((n) => n.toLowerCase() === med.name.toLowerCase()))
            .slice(0, 3)
            .map((med: { name: string; price: number; rx: boolean }) => ({ name: med.name, price: med.price, requires_prescription: med.rx }));
          return {
            pharmacy_id: ph.id,
            name: ph.name,
            address: ph.address,
            match_reason: m.match_reason,
            confidence: Math.round(m.confidence ?? 70),
            relevant_meds,
          };
        })
        .filter(Boolean) as PharmacyMatch[];
      return { summary: parsed.summary || "Here are pharmacies that may help.", matches };
    } catch {
      return {
        summary: "Here are pharmacies near you.",
        matches: pharmacies.slice(0, 6).map((p) => ({
          pharmacy_id: p.id, name: p.name, address: p.address,
          match_reason: "Available pharmacy", confidence: 60,
          relevant_meds: p.meds.slice(0, 3).map((m) => ({ name: m.name, price: m.price, requires_prescription: m.rx })),
        })),
      };
    }
  });
