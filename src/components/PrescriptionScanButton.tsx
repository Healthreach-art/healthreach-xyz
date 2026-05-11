import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parsePrescription } from "@/utils/ai.functions";
import { getPrescriptionFileUrl, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ScanResult {
  doctor: string | null;
  patient?: string | null;
  date?: string | null;
  notes: string | null;
  medications: { name: string; dosage: string; frequency: string; quantity: string }[];
  error?: string | null;
}

export function PrescriptionScanButton({ row }: { row: PrescriptionUpload }) {
  const parse = useServerFn(parsePrescription);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function run() {
    if (row.mime_type === "application/pdf") {
      toast.error("PDF scanning isn't supported yet", {
        description: "Please upload a JPG or PNG of the prescription instead.",
      });
      return;
    }
    setBusy(true);
    setResult(null);
    const tId = toast.loading("Scanning prescription with AI…");
    try {
      const fileUrl = await getPrescriptionFileUrl(row.file_path);
      const r = await parse({ data: { fileUrl, mimeType: row.mime_type } }) as ScanResult;
      if (r.error) {
        toast.error("AI couldn't read this prescription", { id: tId, description: r.error });
      } else if (r.medications.length === 0) {
        toast.warning("No medications detected", { id: tId, description: "Try a clearer photo with the medication list visible." });
      } else {
        toast.success(`Extracted ${r.medications.length} medication${r.medications.length === 1 ? "" : "s"}`, { id: tId });
      }
      setResult(r);
    } catch (e: any) {
      toast.error("Scan failed", { id: tId, description: e?.message || "Please check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={run} disabled={busy}>
        {busy ? <><Loader2 className="h-3 w-3 animate-spin" /> Scanning…</> : <><Sparkles className="h-3 w-3" /> Scan with AI</>}
      </Button>
      {busy && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {!busy && result && !result.error && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Sparkles className="h-3 w-3" /> AI extraction
          </div>
          {(result.doctor || result.date) && (
            <p className="text-muted-foreground">
              {result.doctor && <>Dr. {result.doctor}</>}
              {result.date && <> · {result.date}</>}
            </p>
          )}
          {result.medications.length === 0 ? (
            <p className="text-muted-foreground">No medications detected.</p>
          ) : (
            <ul className="space-y-1.5">
              {result.medications.map((m, i) => (
                <li key={i} className="rounded border border-border bg-background p-2">
                  <p className="font-semibold text-foreground">{m.name} {m.dosage && <span className="text-muted-foreground font-normal">· {m.dosage}</span>}</p>
                  {m.frequency && <p className="text-muted-foreground">{m.frequency}</p>}
                  {m.quantity && <p className="text-[10px] text-muted-foreground">Qty: {m.quantity}</p>}
                </li>
              ))}
            </ul>
          )}
          {result.notes && <p className="text-muted-foreground italic">"{result.notes}"</p>}
          <p className="text-[10px] text-muted-foreground italic">AI-generated — verify with the original.</p>
        </div>
      )}
    </div>
  );
}
