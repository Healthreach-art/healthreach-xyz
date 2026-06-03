import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PHARMACY_SERVICES, DOCTOR_SPECIALTIES } from "@/lib/services";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const inputSchema = z.object({
  text: z.string().min(3).max(8000),
  kind: z.enum(["pharmacy", "doctor"]),
});

const SYSTEM = `You normalize free-form service descriptions written by South African healthcare providers into structured tags so patients can find them.
Return via the normalize_services tool only.
- "services": pick from the allowed list (closest matches). For pharmacies use PHARMACY_SERVICES. For doctors leave services empty and use "subspecialties" instead.
- "subspecialties": short condition / focus tags (e.g. "diabetes", "asthma", "child immunisations", "anxiety"). Lowercase, 1-4 words, max 25 items, deduplicated.
- "keywords": symptom / condition keywords a patient might search for (e.g. "sore throat", "back pain", "depression"). Lowercase, 1-4 words, max 30 items.
Be inclusive: if the provider mentions 1000 things, capture them all (within limits). Never invent services they did not mention.`;

export const normalizeServices = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { services: [] as string[], subspecialties: [] as string[], keywords: [] as string[], error: "AI not configured" };
    }

    const allowedServices = data.kind === "pharmacy" ? [...PHARMACY_SERVICES] : [];

    const tools = [{
      type: "function" as const,
      function: {
        name: "normalize_services",
        description: "Convert free-form provider descriptions into searchable tags.",
        parameters: {
          type: "object",
          properties: {
            services: allowedServices.length
              ? { type: "array", items: { type: "string", enum: allowedServices } }
              : { type: "array", items: { type: "string" } },
            subspecialties: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
          },
          required: ["services", "subspecialties", "keywords"],
          additionalProperties: false,
        },
      },
    }];

    const userMsg = data.kind === "pharmacy"
      ? `Pharmacy free-form description:\n${data.text}\n\nAllowed pharmacy services: ${PHARMACY_SERVICES.join(", ")}`
      : `Doctor free-form description:\n${data.text}\n\nDoctor specialties (for context): ${DOCTOR_SPECIALTIES.join(", ")}`;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
        tools,
        tool_choice: { type: "function", function: { name: "normalize_services" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI is busy — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please top up.");
      const text = await res.text().catch(() => "");
      throw new Error(`AI error ${res.status}: ${text.slice(0, 200)}`);
    }
    const json: any = await res.json();
    let parsed: any = {};
    try { parsed = JSON.parse(json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}"); } catch { /* noop */ }

    const norm = (arr: any, max: number) => Array.isArray(arr)
      ? Array.from(new Set(arr.map((s) => String(s).trim().toLowerCase()).filter((s) => s.length > 0 && s.length <= 60))).slice(0, max)
      : [];
    const services = Array.isArray(parsed.services)
      ? Array.from(new Set(parsed.services.map((s: any) => String(s).trim()).filter((s: string) => allowedServices.length === 0 || allowedServices.includes(s as any))))
      : [];

    return {
      services: services as string[],
      subspecialties: norm(parsed.subspecialties, 25),
      keywords: norm(parsed.keywords, 30),
      error: null as string | null,
    };
  });
