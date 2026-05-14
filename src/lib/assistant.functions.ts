import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are Healthreach's AI Medicine Assistant for patients in South Africa.
You help patients understand:
- how to take their medication (dosage, timing, with/without food)
- common side effects and what is normal vs concerning
- what to do if a dose is missed
- potential drug-drug or drug-food interactions
- general refill and adherence guidance

STRICT SAFETY RULES:
- You are NOT a doctor. Never diagnose conditions.
- Never recommend prescription-only medication or change a prescribed dose.
- For red-flag symptoms (chest pain, severe bleeding, difficulty breathing, suicidal thoughts, anaphylaxis, stroke signs) tell the user to call 10177 (SA emergency) or go to the nearest ER immediately.
- If asked about something outside medication guidance, politely redirect.
- Be concise, warm, and use plain language. Use bullet points when helpful.
- Always end interaction-warning answers with: "Please confirm with your pharmacist before combining medications."`;

const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input) => chatInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "AI not configured", reply: "" };

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages],
      }),
    });

    if (res.status === 429) return { error: "Rate limit reached. Please try again in a moment.", reply: "" };
    if (res.status === 402) return { error: "AI credits exhausted. Please contact support.", reply: "" };
    if (!res.ok) return { error: `AI error (${res.status})`, reply: "" };

    const json = (await res.json()) as any;
    const reply: string = json?.choices?.[0]?.message?.content ?? "";
    return { error: null, reply };
  });
