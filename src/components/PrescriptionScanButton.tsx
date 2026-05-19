import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyPrescription, type VerifyResult } from "@/utils/ai.functions";
import { getPrescriptionFileUrl, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldAlert, ShieldX, Sparkles, Loader2, Check, X, User, Stethoscope, Pill, FileWarning } from "lucide-react";
import { toast } from "sonner";

export function PrescriptionScanButton({ row }: { row: PrescriptionUpload }) {
  const verify = useServerFn(verifyPrescription);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function run() {
    if (row.mime_type === "application/pdf") {
      toast.error("PDF verification not supported yet", { description: "Upload a JPG or PNG instead." });
      return;
    }
    setBusy(true); setResult(null);
    const tId = toast.loading("Running AI verification engine…", { description: "Analyzing doctor info, signature, layout, and tampering signals." });
    try {
      const fileUrl = await getPrescriptionFileUrl(row.file_path);
      const r = await verify({ data: { uploadId: row.id, fileUrl, mimeType: row.mime_type } });
      if (r.error) {
        toast.error("AI verification failed", { id: tId, description: r.error });
      } else {
        const lvl = r.risk_level;
        const fn = lvl === "low" ? toast.success : lvl === "high" ? toast.error : toast.warning;
        fn(`Trust ${r.trust_score}/100 · ${lvl} risk`, { id: tId, description: r.summary || `${r.medications.length} medication(s) detected.` });
      }
      setResult(r);
    } catch (e: any) {
      toast.error("Verification failed", { id: tId, description: e?.message || "Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={run} disabled={busy}>
        {busy ? <><Loader2 className="h-3 w-3 animate-spin" /> Verifying…</> : <><Sparkles className="h-3 w-3" /> Run AI verification</>}
      </Button>

      {busy && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!busy && result && !result.error && <VerificationReport r={result} />}
    </div>
  );
}

function VerificationReport({ r }: { r: VerifyResult }) {
  const trustMeta = r.risk_level === "low"
    ? { Icon: ShieldCheck, cls: "text-healthcare-green border-healthcare-green/30 bg-healthcare-green/10", label: "Low risk — appears authentic" }
    : r.risk_level === "high"
    ? { Icon: ShieldX, cls: "text-destructive border-destructive/40 bg-destructive/10", label: "High risk — likely invalid" }
    : { Icon: ShieldAlert, cls: "text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10", label: "Medium risk — pharmacist review" };
  const TIcon = trustMeta.Icon;

  return (
    <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-3">
      {/* Trust score header */}
      <div className={`rounded-md border px-3 py-2 ${trustMeta.cls}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <TIcon className="h-4 w-4" />
            AI trust score {r.trust_score}/100
          </div>
          <span className="text-[11px] font-medium">{trustMeta.label}</span>
        </div>
        <Progress value={r.trust_score} className="mt-2 h-1.5" />
        {r.summary && <p className="mt-1.5 text-[11px] opacity-90 leading-snug">{r.summary}</p>}
      </div>

      {/* Doctor info */}
      <Section icon={Stethoscope} title="Doctor">
        <Field k="Name" v={r.doctor.name} />
        <Field k="Practice" v={r.doctor.practice_name} />
        <Field k="HPCSA #" v={r.doctor.hpcsa_number} />
        <Field k="Practice #" v={r.doctor.practice_number} />
        {r.doctor.contact && <Field k="Contact" v={r.doctor.contact} />}
        {r.doctor.address && <Field k="Address" v={r.doctor.address} />}
        <div className="col-span-2 flex gap-3 pt-1">
          <BoolBadge label="Signature" ok={r.doctor.signature_present} />
          <BoolBadge label="Stamp" ok={r.doctor.stamp_present} />
        </div>
      </Section>

      {/* Patient info */}
      <Section icon={User} title="Patient">
        <Field k="Name" v={r.patient.name} />
        {r.patient.id_number && <Field k="ID #" v={r.patient.id_number} />}
        {r.patient.date_of_birth && <Field k="DOB" v={r.patient.date_of_birth} />}
        {r.patient.gender && <Field k="Gender" v={r.patient.gender} />}
      </Section>

      {/* Prescription meta */}
      <Section icon={FileWarning} title="Prescription">
        <Field k="Issued" v={r.prescription.issue_date} />
        <Field k="Expires" v={r.prescription.expiry_estimate} />
        <Field k="Repeats" v={r.prescription.repeats != null ? String(r.prescription.repeats) : null} />
        <div className="col-span-2 flex gap-2 pt-1">
          {r.prescription.is_chronic && <span className="rounded bg-healthcare-sky/15 text-healthcare-sky px-1.5 py-0.5 text-[10px] font-medium">Chronic</span>}
          {r.prescription.is_controlled && <span className="rounded bg-destructive/15 text-destructive px-1.5 py-0.5 text-[10px] font-medium">Controlled substance</span>}
        </div>
      </Section>

      {/* Medications */}
      {r.medications.length > 0 && (
        <Section icon={Pill} title={`Medications (${r.medications.length})`}>
          <ul className="col-span-2 space-y-1.5">
            {r.medications.map((m, i) => (
              <li key={i} className="rounded border border-border bg-muted/30 p-2">
                <p className="font-semibold text-foreground">{m.name} {m.strength && <span className="font-normal text-muted-foreground">· {m.strength}</span>}</p>
                {m.instructions && <p className="text-muted-foreground">{m.instructions}</p>}
                <p className="text-[10px] text-muted-foreground">{[m.quantity && `Qty: ${m.quantity}`, m.route].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Validation checks */}
      {r.validation.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Validation checks</p>
          <ul className="space-y-0.5">
            {r.validation.map((v, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px]">
                {v.passed
                  ? <Check className="h-3 w-3 mt-0.5 text-healthcare-green shrink-0" />
                  : <X className="h-3 w-3 mt-0.5 text-destructive shrink-0" />}
                <span><span className="font-medium">{v.check}</span> — <span className="text-muted-foreground">{v.detail}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fraud / tampering signals */}
      {r.fraud_signals.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <p className="text-[11px] font-semibold text-destructive mb-1 flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Tampering / fraud signals</p>
          <ul className="space-y-0.5 text-[11px]">
            {r.fraud_signals.map((s, i) => (
              <li key={i}>
                <span className={`font-medium ${s.severity === "high" ? "text-destructive" : s.severity === "medium" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                  [{s.severity}] {s.label}
                </span>
                <span className="text-muted-foreground"> — {s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing fields */}
      {r.missing_fields.length > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          <span className="font-semibold">Missing:</span> {r.missing_fields.join(", ")}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border">
        AI assessment — always confirm with the original prescription before dispensing.
      </p>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {title}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{children}</div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="text-[11px]">
      <span className="text-muted-foreground">{k}:</span> <span className="text-foreground font-medium">{v}</span>
    </div>
  );
}

function BoolBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${ok ? "bg-healthcare-green/15 text-healthcare-green" : "bg-destructive/15 text-destructive"}`}>
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {label}
    </span>
  );
}
