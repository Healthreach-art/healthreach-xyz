import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `You are the HealthReachCare booking assistant (South Africa), chatting like a friendly WhatsApp agent.
You help people book: 1) Doctor consultations (in-person or video), 2) Home Care providers (nursing, elderly care, post-op, companionship), 3) Pharmacy medicine orders and refills.
HealthReachCare connects people with independent, admin-verified providers; it does not give medical advice. For emergencies tell them to call 10177 or 112 immediately.
Collect step by step, one or two short questions at a time: service type, full name, suburb/city, preferred date and time, and service details (specialty, care type and duration, or medicine names; note prescription medicines need a valid prescription).
Keep replies short, warm, plain English. Never invent provider names, prices or availability.
When you have all details, give a clear summary and end your reply with exactly one line:
BOOKING_SUMMARY: <one-line summary with service, name, suburb, date/time, details>`;

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });
const WHATSAPP_FALLBACK = "Hi! To book a doctor, home care, or medication right now, tap the 'Chat on WhatsApp' button below and our team will confirm your booking immediately.";

function fallbackReply() {
  return { reply: WHATSAPP_FALLBACK, error: null };
}

export const askBookingAssistant = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ messages: z.array(Msg).min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const openAiKey = process.env["OPENAI_API_KEY"];
    const geminiKey = process.env["GEMINI_API_KEY"];
    if (!lovableKey && !openAiKey && !geminiKey) return fallbackReply();

    try {
      if (lovableKey) {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "fetch" },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: SYSTEM,
            input: data.messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
            store: false,
            reasoning: { effort: "low" },
          }),
        });
        if (!res.ok || !res.body) return fallbackReply();
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const event = JSON.parse(payload);
              if (event.type === "response.output_text.delta") text += event.delta ?? "";
            } catch { /* Ignore malformed stream events. */ }
          }
        }
        return text.trim() ? { reply: text.trim(), error: null } : fallbackReply();
      }

      if (openAiKey) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: SYSTEM }, ...data.messages.map((m) => ({ role: m.role, content: m.content }))],
            temperature: 0.7,
          }),
        });
        if (!res.ok) return fallbackReply();
        const json = await res.json() as { choices?: { message?: { content?: string } }[] };
        const reply = json.choices?.[0]?.message?.content?.trim();
        return reply ? { reply, error: null } : fallbackReply();
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: data.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { temperature: 0.7 },
        }),
      });
      if (!res.ok) return fallbackReply();
      const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const reply = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      return reply ? { reply, error: null } : fallbackReply();
    } catch (error) {
      console.error("booking assistant", error);
      return fallbackReply();
    }
  });
