import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  appointment_id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string | null;
  appointmentType: "doctor" | "pharmacy";
  patientId: string;
  providerId: string;
  /** "patient" | "doctor" | "pharmacy" — role of the current user in this thread. */
  myRole: "patient" | "doctor" | "pharmacy";
  title?: string;
  subtitle?: string;
}

export function AppointmentChatDialog({
  open, onClose, appointmentId, appointmentType, patientId, providerId, myRole, title, subtitle,
}: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !appointmentId || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await firestoreClient
        .from("appointment_messages")
        .select("*")
        .eq("appointment_id", appointmentId)
        .eq("appointment_type", appointmentType)
        .order("created_at", { ascending: true });
      if (error) toast.error(error.message);
      if (!cancelled) {
        setMessages((data ?? []) as Message[]);
        setLoading(false);
      }
    })();
    const ch = firestoreClient
      .channel(`appt-msgs-${appointmentId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "appointment_messages", filter: `appointment_id=eq.${appointmentId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .subscribe();
    if (typeof window !== "undefined") (window as any).__activeChatId = appointmentId;
    return () => { cancelled = true; firestoreClient.removeChannel(ch); if (typeof window !== "undefined") (window as any).__activeChatId = null; };

  }, [open, appointmentId, appointmentType, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!body.trim() || !appointmentId || !user) return;
    setSending(true);
    const { error } = await firestoreClient.from("appointment_messages").insert({
      appointment_id: appointmentId,
      appointment_type: appointmentType,
      patient_id: patientId,
      provider_id: providerId,
      sender_id: user.id,
      sender_role: myRole,
      body: body.trim().slice(0, 2000),
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
  }

  const roleColors: Record<string, string> = {
    patient: "bg-primary/10 text-primary",
    doctor: "bg-healthcare-teal/15 text-healthcare-teal",
    pharmacy: "bg-healthcare-sky/15 text-healthcare-sky",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" /> {title ?? "Appointment chat"}
          </DialogTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        <div ref={scrollRef} className="h-80 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {!loading && messages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hello — replies appear in real time.</p>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-background border border-border text-foreground"}`}>
                  {!mine && (
                    <span className={`mb-1 inline-block text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${roleColors[m.sender_role] ?? "bg-accent"}`}>
                      {m.sender_role}
                    </span>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message..."
            rows={2}
            maxLength={2000}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button onClick={send} disabled={sending || !body.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
