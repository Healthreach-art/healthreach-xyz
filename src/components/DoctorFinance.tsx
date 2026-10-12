import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, Clock, Receipt } from "lucide-react";

type Appt = {
  id: string; status: string; scheduled_at: string; mode: string;
  consultation_fee?: number | null; payment_status?: string | null;
  use_medical_aid?: boolean | null; medical_aid_provider?: string | null;
  completed_at?: string | null;
};

const zar = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DoctorFinance({ appts, defaultFee }: { appts: Appt[]; defaultFee: number }) {
  const fee = (a: Appt) => Number(a.consultation_fee ?? defaultFee ?? 0);
  const completed = appts.filter((a) => a.status === "completed");
  const upcoming = appts.filter((a) => a.status === "confirmed" || a.status === "pending");
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const thisMonth = completed.filter((a) => new Date(a.completed_at ?? a.scheduled_at) >= monthStart);
  const sum = (rows: Appt[]) => rows.reduce((s, a) => s + fee(a), 0);
  const medAid = completed.filter((a) => a.use_medical_aid);

  const stats = [
    { label: "Earned (all time)", value: zar(sum(completed)), sub: `${completed.length} consultations`, icon: Wallet },
    { label: "This month", value: zar(sum(thisMonth)), sub: `${thisMonth.length} completed`, icon: CheckCircle2 },
    { label: "Booked value", value: zar(sum(upcoming)), sub: `${upcoming.length} pending/confirmed`, icon: Clock },
    { label: "Medical aid claims", value: String(medAid.length), sub: zar(sum(medAid)), icon: Receipt },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {label}<Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-lg font-bold sm:text-xl">{value}</div>
            <div className="text-[11px] text-muted-foreground">{sub}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Consultation ledger</h3>
          <span className="text-[11px] text-muted-foreground">Last 50 bookings</span>
        </div>
        {completed.length === 0 && upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No consultations yet. Earnings appear here once patients book and you complete visits.</p>
        ) : (
          <div className="divide-y">
            {[...completed, ...upcoming]
              .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{new Date(a.scheduled_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</div>
                    <div className="truncate text-xs capitalize text-muted-foreground">
                      {a.mode.replace("_", " ")} · {a.use_medical_aid ? `Medical aid${a.medical_aid_provider ? ` (${a.medical_aid_provider})` : ""}` : "Private pay"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{zar(fee(a))}</div>
                    <Badge variant={a.status === "completed" ? "default" : "secondary"} className="text-[10px] capitalize">{a.status}</Badge>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Consultation fees are settled directly between you and the patient (or their medical aid). Patients pay HealthReachCare only the booking fee, so no payout is held by the platform.
      </p>
    </div>
  );
}
