import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RoleGuard } from "@/components/RoleGuard";
import { askAssistant } from "@/lib/assistant.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Sparkles, AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/dashboard/patient/assistant")({
  head: () => ({
    meta: [
      { title: "AI Medicine Assistant — Healthreach" },
      { name: "description", content: "Ask the Healthreach AI assistant about dosage, side effects, interactions, and missed doses." },
    ],
  }),
  component: () => (
    <RoleGuard allow="patient">
      <AssistantPage />
    </RoleGuard>
  ),
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What should I do if I missed my evening dose of metformin?",
  "Are there interactions between ibuprofen and warfarin?",
  "What are common side effects of amoxicillin?",
  "Can I take paracetamol with my blood pressure medication?",
];

function AssistantPage() {
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your **AI Medicine Assistant**. Ask me about dosage, side effects, missed doses, or possible interactions. I'm not a doctor — for emergencies call **10177**.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const history = next.filter((m) => m.role === "user" || m.role === "assistant");
      const res = await ask({ data: { messages: history } });
      if (res.error) {
        setError(res.error);
        setMessages((m) => [...m, { role: "assistant", content: "Sorry — I couldn't answer that just now." }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: res.reply || "(no reply)" }]);
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link to="/dashboard/patient" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-5 w-5 text-healthcare-green" />
          AI Medicine Assistant
        </div>
      </div>

      <Card className="flex-1 overflow-hidden border-healthcare-mint/40 bg-gradient-to-b from-white to-healthcare-light/40">
        <div className="flex h-full flex-col">
          <div className="flex items-start gap-2 border-b bg-amber-50/60 px-4 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              I provide general medication info — not medical diagnosis. For emergencies call <strong>10177</strong> or go to the nearest ER.
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-healthcare-green text-white"
                      : "bg-white shadow-sm ring-1 ring-healthcare-mint/40"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length <= 1 && (
            <div className="border-t bg-white/80 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Try asking
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-healthcare-mint/60 bg-white px-3 py-1 text-xs text-foreground hover:bg-healthcare-light"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="border-t bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t bg-white p-3"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about a medication, dosage, or interaction…"
              rows={2}
              className="min-h-[44px] resize-none"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} className="bg-healthcare-green hover:bg-healthcare-green/90">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
