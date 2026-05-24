import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
- Sanity-check what the patient tells you. If something does not add up — e.g. an adult dose for an infant, a child's weight paired with an adult medicine, an impossible age (200 years), a dose 10× higher than normal, two medications that should never be combined, a pregnant patient asking for a teratogenic drug, or contradictory details ("I'm allergic to penicillin" + "I just took amoxicillin") — STOP and say clearly: "That doesn't look right to me — can you double-check X?" Explain why in one short sentence. Do NOT proceed as if the input were correct.
- If the patient's described symptoms don't match the medicine they're asking about, point that out and suggest they speak to a pharmacist before taking it.
- If key info is missing (age, weight for paediatric dosing, current medications, pregnancy status, kidney/liver issues), ASK before answering.

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
