import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHARMACY_SERVICES, DOCTOR_SPECIALTIES } from "@/lib/services";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const inputSchema = z.object({
  symptoms: z.string().min(3).max(800),
  user_lat: z.number().optional().nullable(),
  user_lng: z.number().optional().nullable(),
});

const SYSTEM = `You are HEALTHREACH's triage matcher for South African patients.
Given a patient's symptoms or concern, suggest:
- 1-3 relevant DOCTOR SPECIALTIES from the allowed list.
- 1-4 relevant PHARMACY SERVICES from the allowed list.
- A list of plain-language KEYWORDS (3-10) the patient's case relates to (e.g. "sore throat", "diabetes", "back pain"). Lowercase, 1-3 words each.
For red-flag symptoms (chest pain, stroke signs, severe bleeding, breathing difficulty, suicidal thoughts), set urgent=true and add a short note to call 10177 or go to ER.
Output via the suggest_matches tool only.`;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const matchSymptoms = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { specialties: [] as string[], services: [] as string[], keywords: [] as string[], reasoning: "AI matcher not configured", urgent: false, providers: { doctors: [] as any[], pharmacies: [] as any[] } };
    }

    const tools = [{
      type: "function" as const,
      function: {
        name: "suggest_matches",
        description: "Return relevant doctor specialties, pharmacy services and search keywords for the patient's symptoms.",
        parameters: {
          type: "object",
          properties: {
            specialties: { type: "array", items: { type: "string", enum: [...DOCTOR_SPECIALTIES] } },
            services: { type: "array", items: { type: "string", enum: [...PHARMACY_SERVICES] } },
            keywords: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
            urgent: { type: "boolean" },
          },
          required: ["specialties", "services", "keywords", "reasoning", "urgent"],
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
    const keywords: string[] = Array.isArray(parsed.keywords)
      ? Array.from(new Set(parsed.keywords.map((s: any) => String(s).trim().toLowerCase()).filter((s: string) => !!s))).slice(0, 12) as string[]
      : [];
    const reasoning: string = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
    const urgent: boolean = !!parsed.urgent;

    // Query doctors: match by specialty OR subspecialties/services_tags overlap with keywords.
    let doctorsQuery = supabaseAdmin.from("doctors")
      .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count, latitude, longitude, subspecialties, services_tags")
      .eq("is_active", true).eq("is_verified", true).limit(24);

    const allTags = Array.from(new Set([...keywords, ...services.map((s) => s.toLowerCase())]));
    const orParts: string[] = [];
    if (specialties.length) orParts.push(`specialty.in.(${specialties.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")})`);
    if (allTags.length) {
      orParts.push(`subspecialties.ov.{${allTags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`);
      orParts.push(`services_tags.ov.{${allTags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`);
    }
    if (orParts.length) doctorsQuery = doctorsQuery.or(orParts.join(","));

    let pharmaciesQuery = supabaseAdmin.from("profiles")
      .select("user_id, organization_name, full_name, address, services, services_tags, latitude, longitude")
      .eq("approval_status", "approved")
      .not("organization_name", "is", null)
      .limit(24);

    const phOr: string[] = [];
    if (services.length) phOr.push(`services.ov.{${services.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")}}`);
    if (allTags.length) phOr.push(`services_tags.ov.{${allTags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`);
    if (phOr.length) pharmaciesQuery = pharmaciesQuery.or(phOr.join(","));

    const [doctorsRes, pharmaciesRes] = await Promise.all([doctorsQuery, pharmaciesQuery]);

    const annotate = <T extends { latitude?: number | null; longitude?: number | null }>(rows: T[]): (T & { distance_km: number | null })[] => {
      if (data.user_lat == null || data.user_lng == null) return rows.map((r) => ({ ...r, distance_km: null }));
      return rows.map((r) => ({
        ...r,
        distance_km: r.latitude != null && r.longitude != null
          ? Math.round(haversineKm(data.user_lat!, data.user_lng!, Number(r.latitude), Number(r.longitude)) * 10) / 10
          : null,
      })).sort((a, b) => (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9));
    };

    return {
      specialties,
      services,
      keywords,
      reasoning,
      urgent,
      providers: {
        doctors: annotate((doctorsRes.data ?? []) as any[]),
        pharmacies: annotate((pharmaciesRes.data ?? []) as any[]),
      },
    };
  });
