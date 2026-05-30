import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are Healthreach's AI Pharmacist Assistant for patients in South Africa.
You help patients understand:
- how to take their medication (dosage, timing, with/without food)
- common side effects and what is normal vs concerning
- what to do if a dose is missed
- potential drug-drug, drug-food, and drug-condition interactions
- general refill and adherence guidance

BE SMART AND CHALLENGE BAD INPUT:
- Sanity-check what the patient tells you. If something does not add up — adult dose for an infant, impossible age, dose 10× normal, contraindicated combinations, contradictory details — STOP and say "That doesn't look right to me — can you double-check X?" Explain why in one short sentence.
- If key info is missing (age, weight for paediatric dosing, current medications, pregnancy, kidney/liver issues), ASK before answering.

WHEN A CATALOG SNIPPET IS PROVIDED:
- Prefer the pharmacy-supplied description for indications, dosage and warnings.
- If the catalog contradicts general knowledge, flag the discrepancy and recommend the patient confirm with the pharmacist.

STRICT SAFETY RULES:
- You are NOT a doctor. Never diagnose.
- Never recommend prescription-only medication or change a prescribed dose.
- Red-flag symptoms (chest pain, severe bleeding, breathing difficulty, suicidal thoughts, anaphylaxis, stroke signs): tell the user to call 10177 or go to the nearest ER immediately.
- Outside medication guidance → politely redirect.
- Be concise, warm, plain language. Bullet points when helpful.
- End interaction warnings with: "Please confirm with your pharmacist before combining medications."`;

const chatInput = z.object({
  messages: z
    .array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    }))
    .min(1)
    .max(40),
});

const STOP_WORDS = new Set([
  "the","and","for","with","what","about","when","does","take","tell","me","my","is","are","of","to","a","an","on","in","i","im","ive","you","your","can","should","do","have","has","had","not","no","yes","this","that","it","its","or","if","at","by","be","but","there","their","they","them","we","us","he","she","his","her","get","got","how","why","who","which","than","then","so","just","like","want","need","know","good","bad","ok","okay","please","help","feel","feeling","felt"
]);

/** Extracts plausible medication keywords from the latest user message (>3 chars, alpha). */
function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 6);
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input) => chatInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "AI not configured", reply: "" };

    // Build catalog context from the latest user message — best-effort, never blocks the chat.
    let catalogContext = "";
    try {
      const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const keywords = extractKeywords(lastUser);
      if (keywords.length > 0) {
        const orFilter = keywords.map((k) => `name.ilike.%${k}%,description.ilike.%${k}%,category.ilike.%${k}%`).join(",");
        const { data: meds } = await supabaseAdmin
          .from("medications")
          .select("name, description, category, requires_prescription, pharmacy_id")
          .or(orFilter)
          .gt("stock_quantity", 0)
          .limit(8);
        if (meds && meds.length > 0) {
          const snippets = meds.map((m: any) =>
            `• ${m.name}${m.requires_prescription ? " (Rx)" : ""} — ${(m.description || "").slice(0, 220)}`
          ).join("\n");
          catalogContext = `\n\nPHARMACY CATALOG SNIPPETS (in-stock items pharmacists have described):\n${snippets}`;
        }
      }
    } catch { /* non-fatal */ }

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT + catalogContext }, ...data.messages],
      }),
    });

    if (res.status === 429) return { error: "Rate limit reached. Please try again in a moment.", reply: "" };
    if (res.status === 402) return { error: "AI credits exhausted. Please contact support.", reply: "" };
    if (!res.ok) return { error: `AI error (${res.status})`, reply: "" };

    const json = (await res.json()) as any;
    const reply: string = json?.choices?.[0]?.message?.content ?? "";
    return { error: null, reply, usedCatalog: !!catalogContext };
  });
