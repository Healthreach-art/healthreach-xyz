import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, MapPin, Video, Phone, User as UserIcon, CalendarCheck, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { bookDoctorAppointment, markDoctorAppointmentPaid } from "@/lib/doctors.functions";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";
import { toast } from "sonner";

const PAYSTACK_PUBLIC_KEY = "pk_test_d1b55c54edcc82e952942340a77d0ca85cda7d9a";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: {
        key: string; email: string; amount: number; currency?: string; ref?: string;
        callback: (resp: { reference: string }) => void; onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

function loadPaystack(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.PaystackPop) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js"; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Failed to load Paystack"));
    document.head.appendChild(s);
  });
}

export const Route = createFileRoute("/dashboard/patient/doctors/$id")({
  head: () => ({ meta: [{ title: "Doctor — HealthReachCare" }] }),
  validateSearch: (s: Record<string, unknown>): { when?: string } =>
    typeof s.when === "string" ? { when: s.when } : {},
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Doctor {
  id: string; hospital_id: string; full_name: string; specialty: string; qualifications: string;
  practice_number: string; bio: string; photo_url: string;
  consultation_fee: number; accepted_medical_aids: string[]; languages: string[];
  online_available: boolean; in_person_available: boolean; phone_available: boolean;
  city: string; address: string; rating_avg: number; rating_count: number;
}

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const book = useServerFn(bookDoctorAppointment);
  const markPaid = useServerFn(markDoctorAppointmentPaid);
  const verify = useServerFn(verifyPaystackTransaction);

  const [doc, setDoc] = useState<Doctor | null>(null);
  const [reviews, setReviews] = useState<{ stars: number; comment: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [when, setWhen] = useState(() => {
    const w = search.when;
    if (!w) return "";
    const d = new Date(w);
    if (Number.isNaN(d.getTime())) return "";
    // datetime-local needs YYYY-MM-DDTHH:mm in local time
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [mode, setMode] = useState<"in_person" | "video" | "phone">("in_person");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: r }] = await Promise.all([
        supabase.from("doctors").select("*").eq("id", id).maybeSingle(),
        supabase.from("doctor_reviews").select("stars, comment, created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      setDoc(d as Doctor); setReviews(r ?? []); setLoading(false);
    })();
  }, [id, user]);

  async function confirmBooking() {
    if (!user) return toast.error("Please sign in");
    if (!doc) return;
    if (!when) return toast.error("Pick a date & time");
    setBusy(true);
    try {
      const { appointmentId, platformFeeCents } = await book({
        data: {
          doctorId: doc.id, scheduledAt: when, mode, reason: reason.trim(),
        },
      });
      await loadPaystack();
      if (!window.PaystackPop) throw new Error("Paystack failed to load");
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: user.email || "patient@healthreach.app",
        amount: platformFeeCents,
        currency: "ZAR",
        callback: (resp) => {
          (async () => {
            try {
              const v = await verify({ data: { reference: resp.reference } });
              if (!v.verified) throw new Error("Payment not verified");
              await markPaid({ data: { appointmentId, reference: resp.reference } });
              toast.success("Appointment confirmed!");
              navigate({ to: "/dashboard/patient/consultations" });
            } catch (e: any) { toast.error(e?.message || "Could not confirm payment"); }
            finally { setBusy(false); }
          })();
        },
        onClose: () => { setBusy(false); toast("Payment cancelled — appointment kept as pending."); },
      });
      handler.openIframe();
    } catch (e: any) {
      toast.error(e?.message || "Booking failed");
      setBusy(false);
    }
  }

  if (loading) return <div className="container-narrow px-4 sm:px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  if (!doc) return <div className="container-narrow px-4 sm:px-6 py-8 text-sm text-muted-foreground">Doctor not found.</div>;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col sm:flex-row gap-5 shadow-sm">
        <div className="h-24 w-24 rounded-2xl bg-healthcare-mint/30 flex items-center justify-center shrink-0 overflow-hidden">
          {doc.photo_url ? <img src={doc.photo_url} alt="" className="h-full w-full object-cover" /> : <UserIcon className="h-10 w-10 text-healthcare-teal" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Dr. {doc.full_name}</h1>
          <p className="text-sm text-healthcare-teal font-medium">{doc.specialty}</p>
          <p className="text-xs text-muted-foreground mt-1">{doc.qualifications}</p>
          {doc.practice_number && <p className="text-[11px] text-muted-foreground">Practice no. {doc.practice_number}</p>}
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
            <MapPin className="h-3 w-3" /> {doc.city}{doc.address ? ` · ${doc.address}` : ""}
            {doc.rating_count > 0 && (
              <span className="ml-2 flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{doc.rating_avg.toFixed(1)} ({doc.rating_count})
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {doc.in_person_available && <Pill>In-person</Pill>}
            {doc.online_available && <Pill><Video className="h-3 w-3" /> Video</Pill>}
            {doc.phone_available && <Pill><Phone className="h-3 w-3" /> Phone</Pill>}
            
          </div>
          {doc.bio && <p className="text-sm text-foreground/80 mt-3">{doc.bio}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Consultation</p>
          <p className="text-2xl font-bold text-primary">R{doc.consultation_fee.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground">+ R15 booking fee</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <h2 className="font-bold text-foreground flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Book appointment</h2>
        <p className="text-xs text-muted-foreground">You are booking with a <span className="font-semibold text-healthcare-teal">Doctor</span></p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Date & time</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div><Label>Consultation type</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {doc.in_person_available && <SelectItem value="in_person">In-person</SelectItem>}
                {doc.online_available && <SelectItem value="video">Video call</SelectItem>}
                {doc.phone_available && <SelectItem value="phone">Phone call</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Reason for visit</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. Annual check-up, persistent headache…" /></div>
        <p className="text-[11px] text-muted-foreground">
          You pay only the R15 booking fee now. Settle the consultation fee directly with the doctor.
        </p>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Pay now</p>
            <p className="text-xl font-bold text-foreground">R15.00</p>
          </div>
          <Button onClick={confirmBooking} disabled={busy} className="bg-primary text-primary-foreground">
            {busy ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>) : "Confirm & pay R15"}
          </Button>
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
          <h2 className="font-bold text-foreground">Reviews</h2>
          {reviews.map((r, i) => (
            <div key={i} className="border-b border-border last:border-0 pb-2 last:pb-0">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className={`h-3.5 w-3.5 ${k < r.stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                ))}
                <span className="text-[10px] text-muted-foreground ml-2">{new Date(r.created_at).toLocaleDateString("en-ZA")}</span>
              </div>
              {r.comment && <p className="text-sm text-foreground/80 mt-1">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ children, tone = "mint" }: { children: React.ReactNode; tone?: "mint" | "sky" }) {
  const c = tone === "sky" ? "bg-healthcare-sky/15 text-healthcare-sky" : "bg-healthcare-mint/30 text-healthcare-teal";
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${c}`}>{children}</span>;
}
