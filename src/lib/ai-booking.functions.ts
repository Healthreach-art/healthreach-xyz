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

export const askBookingAssistant = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ messages: z.array(Msg).min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { reply: "", error: "Assistant is not configured yet." };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM,
        input: data.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        store: false,
        reasoning: { effort: "low" },
      }),
    });
    if (!res.ok || !res.body) {
      const msg =
        res.status === 429 ? "Too many requests, please try again shortly."
        : res.status === 402 ? "The assistant is temporarily unavailable. Please use WhatsApp."
        : "The assistant could not respond. Please use WhatsApp.";
      console.error("booking assistant", res.status, await res.text().catch(() => ""));
      return { reply: "", error: msg };
    }
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
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        } catch { /* ignore */ }
      }
    }
    return { reply: text.trim(), error: null as string | null };
  });
