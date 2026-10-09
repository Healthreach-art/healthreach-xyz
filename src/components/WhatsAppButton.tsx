import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { askBookingAssistant } from "@/lib/ai-booking.functions";
import { useAuth } from "@/hooks/useAuth";

const WA_NUMBER = "27797285078";
const waLink = (t: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(t)}`;

type Msg = { role: "user" | "assistant"; content: string };
const GREETING: Msg = {
  role: "assistant",
  content: "Hi 👋 I'm the HealthReachCare booking assistant. What would you like to book today?",
};
const CHIPS = ["Book a doctor", "Home care for a loved one", "Order or refill medicine"];

export function WhatsAppButton() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const { user } = useAuth();
  const ask = useServerFn(askBookingAssistant);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (open && !busy) inputRef.current?.focus();
  }, [msgs, open, busy]);

  const summary = [...msgs].reverse().find((m) => m.role === "assistant" && m.content.includes("BOOKING_SUMMARY:"))
    ?.content.split("BOOKING_SUMMARY:")[1]?.trim();

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await ask({ data: { messages: next.slice(1).slice(-30) } });
      setMsgs([...next, { role: "assistant", content: r.error ?? r.reply ?? "Sorry, please try again." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Connection problem. You can continue on WhatsApp below." }]);
    } finally {
      setBusy(false);
    }
  }

  async function saveBooking() {
    if (!summary || saved) return;
    const ref = `WA-${Date.now().toString(36).toUpperCase()}`;
    setSaved(ref);
    if (!user?.id) return;
    try {
      const { fsSet } = await import("@/lib/firestore");
      const s = summary.toLowerCase();
      const service = s.includes("home care") || s.includes("homecare") ? "homecare" : s.includes("medic") || s.includes("refill") ? "medicine" : "doctor";
      await fsSet("bookings", ref, {
        reference: ref, patient_id: user.id, patient_email: user.email ?? null,
        source: "whatsapp_assistant", service, summary, status: "pending",
        created_at: new Date().toISOString(),
      }, false);
    } catch (e) { console.error("save booking", e); }
  }

  const waText = summary
    ? `Hi HealthReachCare, I'd like to book${saved ? ` (ref ${saved})` : ""}: ${summary}`
    : "Hi HealthReachCare, I'd like to make a booking.";

  return (
    <>
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[32rem] max-h-[70vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl md:bottom-24">
          <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/20 font-bold">HR</div>
            <div className="flex-1">
              <div className="font-semibold leading-tight">HealthReachCare Bookings</div>
              <div className="text-xs opacity-80">{busy ? "typing…" : "online"}</div>
            </div>
            <button aria-label="Close chat" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 p-3">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}>
                  <div className="prose prose-sm max-w-none text-inherit [&_p]:my-1">
                    <ReactMarkdown>{m.content.replace(/BOOKING_SUMMARY:.*/s, "").trim() || "✅ Booking details ready."}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {busy && <div className="w-16 rounded-2xl bg-card px-3 py-2 text-sm text-muted-foreground">•••</div>}
            {msgs.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {CHIPS.map((c) => (
                  <button key={c} onClick={() => send(c)} className="rounded-full border border-primary/40 bg-background px-3 py-1 text-xs text-primary hover:bg-primary/10">{c}</button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
          {summary && (
            <div className="space-y-2 border-t border-border bg-card p-3 text-xs">
              <div className="font-medium">Booking summary: <span className="font-normal">{summary}</span></div>
              <a href={waLink(waText)} onClick={saveBooking} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-primary py-2 text-center text-sm font-semibold text-primary-foreground">Confirm on WhatsApp</a>
              {saved && <p className="text-center text-muted-foreground">Saved — reference {saved}. See it under Activities.</p>}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-border p-2">
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message" className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
          <a href={waLink(waText)} target="_blank" rel="noopener noreferrer" className="pb-2 text-center text-xs text-muted-foreground underline">Prefer a person? Chat on WhatsApp</a>
          <p className="px-3 pb-2 text-center text-[10px] text-muted-foreground">Not for emergencies — call 10177 or 112.</p>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open HealthReachCare booking chat"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 md:bottom-6"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
