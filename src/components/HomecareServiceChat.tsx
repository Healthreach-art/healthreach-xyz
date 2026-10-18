import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type Unsubscribe,
} from "firebase/firestore";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { getFirebase } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type HomecareMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const SENDABLE_STATUSES = new Set(["accepted", "scheduled", "in_progress"]);
const CLOSED_STATUSES = new Set(["completed", "confirmed", "declined", "cancelled"]);

export function HomecareServiceChat({
  assignmentId,
  assignmentStatus,
  counterpart,
}: {
  assignmentId: string;
  assignmentStatus: string;
  counterpart: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<HomecareMessage[]>([]);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [conversationStatus, setConversationStatus] = useState("active");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let conversationSubscription: Unsubscribe | undefined;
    let messagesSubscription: Unsubscribe | undefined;

    const subscribe = async () => {
      setLoading(true);
      setError("");
      try {
        const { auth, db } = await getFirebase();
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user) throw new Error("Sign in to open this service chat.");
        const assignmentRef = doc(db, "homecare_assignments", assignmentId);
        const assignmentSnapshot = await getDoc(assignmentRef);
        if (!assignmentSnapshot.exists()) throw new Error("This home care assignment is no longer available.");
        const assignment = assignmentSnapshot.data();
        const requestId = assignment.request_id;
        const providerId = assignment.provider_id;
        if (typeof requestId !== "string" || typeof providerId !== "string") {
          throw new Error("This service is missing its patient or provider link.");
        }
        const requestSnapshot = await getDoc(doc(db, "homecare_requests", requestId));
        if (!requestSnapshot.exists()) throw new Error("This service's patient record could not be found.");
        const patientId = requestSnapshot.data().patient_id;
        if (user.uid !== patientId) {
          const providerSnapshot = await getDoc(doc(db, "homecare_providers", providerId));
          if (!providerSnapshot.exists() || providerSnapshot.data().user_id !== user.uid) {
            throw new Error("You are not a participant in this service chat.");
          }
        }
        if (cancelled) return;
        setUserId(user.uid);

        const conversationRef = doc(db, "homecare_conversations", assignmentId);
        conversationSubscription = onSnapshot(conversationRef, (snapshot) => {
          if (cancelled) return;
          messagesSubscription?.();
          messagesSubscription = undefined;
          if (!snapshot.exists()) {
            setConversationStatus("active");
            setMessages([]);
            setLoading(false);
            return;
          }
          setConversationStatus(String(snapshot.data().status ?? "active"));
          const messagesQuery = query(
            collection(db, "homecare_conversations", assignmentId, "messages"),
            orderBy("created_at", "asc"),
          );
          messagesSubscription = onSnapshot(
            messagesQuery,
            (messageSnapshot) => {
              if (cancelled) return;
              setMessages(messageSnapshot.docs.map((item) => ({
                id: item.id,
                sender_id: String(item.data().sender_id ?? ""),
                body: String(item.data().body ?? ""),
                created_at: String(item.data().created_at ?? ""),
              })));
              setLoading(false);
            },
            (subscriptionError) => {
              if (cancelled) return;
              setError(subscriptionError.message);
              setLoading(false);
            },
          );
        }, (subscriptionError) => {
          if (cancelled) return;
          setError(subscriptionError.message);
          setLoading(false);
        });
      } catch (subscribeError) {
        if (cancelled) return;
        setError(subscribeError instanceof Error ? subscribeError.message : "Could not open this service chat.");
        setLoading(false);
      }
    };

    void subscribe();
    return () => {
      cancelled = true;
      conversationSubscription?.();
      messagesSubscription?.();
    };
  }, [assignmentId, open]);

  const closed = CLOSED_STATUSES.has(assignmentStatus) || conversationStatus === "archived";
  const canSend = SENDABLE_STATUSES.has(assignmentStatus) && !closed;

  const sendMessage = async () => {
    const body = message.trim();
    if (!body || body.length > 4000 || sending) return;
    setSending(true);
    try {
      const { auth, db } = await getFirebase();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in to send a message.");

      const assignmentRef = doc(db, "homecare_assignments", assignmentId);
      const conversationRef = doc(db, "homecare_conversations", assignmentId);
      const messageRef = doc(collection(db, "homecare_conversations", assignmentId, "messages"));
      await runTransaction(db, async (transaction) => {
        const assignmentSnapshot = await transaction.get(assignmentRef);
        if (!assignmentSnapshot.exists()) throw new Error("This home care assignment is no longer available.");
        const assignment = assignmentSnapshot.data();
        if (!SENDABLE_STATUSES.has(String(assignment.status))) {
          throw new Error("Messaging is closed for this service.");
        }
        const requestId = assignment.request_id;
        const providerId = assignment.provider_id;
        if (typeof requestId !== "string" || typeof providerId !== "string") {
          throw new Error("This service is missing its participant link.");
        }
        const requestRef = doc(db, "homecare_requests", requestId);
        const providerRef = doc(db, "homecare_providers", providerId);
        const [requestSnapshot, conversationSnapshot] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(conversationRef),
        ]);
        if (!requestSnapshot.exists()) throw new Error("This service's patient record could not be found.");
        const patientId = requestSnapshot.data().patient_id;
        if (user.uid !== patientId) {
          const providerSnapshot = await transaction.get(providerRef);
          if (!providerSnapshot.exists() || providerSnapshot.data().user_id !== user.uid) {
            throw new Error("You are not a participant in this service chat.");
          }
        }
        if (conversationSnapshot.exists() && conversationSnapshot.data().status !== "active") {
          throw new Error("Messaging is closed for this service.");
        }

        if (!conversationSnapshot.exists()) {
          transaction.set(conversationRef, {
            assignment_id: assignmentId,
            request_id: requestId,
            patient_id: patientId,
            provider_id: providerId,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        transaction.set(messageRef, {
          sender_id: user.uid,
          body,
          created_at: new Date().toISOString(),
        });
      });
      setMessage("");
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        {closed ? "View chat history" : "Open service chat"}
      </Button>
      {open && (
        <section className="space-y-3 rounded-xl border bg-background p-3" aria-label={`Service chat with ${counterpart}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Private service chat</h3>
              <p className="text-xs text-muted-foreground">Conversation with {counterpart}</p>
            </div>
            {closed && <span className="text-xs font-medium text-muted-foreground">Archived</span>}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3">
              {messages.length === 0
                ? <p className="text-center text-xs text-muted-foreground">No messages yet. Start the service conversation here.</p>
                : messages.map((item) => (
                  <article key={item.id} className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${item.sender_id === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-card"}`}>
                    <p className="whitespace-pre-wrap break-words">{item.body}</p>
                    <time className="mt-1 block text-[10px] opacity-70" dateTime={item.created_at}>
                      {Number.isNaN(Date.parse(item.created_at)) ? "" : new Date(item.created_at).toLocaleString()}
                    </time>
                  </article>
                ))}
            </div>
          )}
          {canSend ? (
            <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="space-y-2">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write a message about this service…"
                rows={2}
                maxLength={4000}
                aria-label="Message"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={sending || !message.trim()}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">This service is complete or closed. The conversation remains available as part of its history.</p>
          )}
        </section>
      )}
    </div>
  );
}
