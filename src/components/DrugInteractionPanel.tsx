import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkDrugInteractions } from "@/utils/ai.functions";
import { AlertTriangle, ShieldCheck, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Interaction {
  drugs: string[];
  severity: "minor" | "moderate" | "major";
  description: string;
  recommendation: string;
}

const SEV_STYLES: Record<string, string> = {
  minor: "bg-healthcare-sky/15 text-healthcare-sky border-healthcare-sky/30",
  moderate: "bg-orange-50 text-orange-700 border-orange-200",
  major: "bg-destructive/10 text-destructive border-destructive/30",
};

export function DrugInteractionPanel({ medications }: { medications: string[] }) {
  const check = useServerFn(checkDrugInteractions);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    overall_risk: string;
    interactions: Interaction[];
    general_warnings?: string[];
    error?: string | null;
  } | null>(null);

  const key = medications.slice().sort().join("|").toLowerCase();

  function runCheck() {
    if (medications.length < 1) { setData(null); return Promise.resolve(); }
    setLoading(true);
    return check({ data: { medications } })
      .then((r: any) => {
        setData(r);
        if (r?.error) toast.error("Safety check incomplete", { description: r.error });
        else if (r?.interactions?.some((i: Interaction) => i.severity === "major")) {
          toast.warning("Major interaction detected", { description: "Review the AI Safety Check below." });
        }
      })
      .catch((e: any) => {
        setData({ overall_risk: "unknown", interactions: [], error: "AI safety check failed" });
        toast.error("Couldn't run safety check", { description: e?.message || "Please try again in a moment." });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    runCheck().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (medications.length < 1) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">AI Safety Check</h3>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {!loading && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => runCheck()}>
            <RefreshCw className="h-3 w-3" /> Recheck
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!loading && data?.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {data.error}
        </div>
      )}


      {!loading && data && !data.error && (
        <>
          {data.interactions.length === 0 && data.overall_risk === "none" && (
            <div className="flex items-start gap-2 text-xs text-healthcare-green">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <p>No known interactions detected between these medications.</p>
            </div>
          )}

          {data.interactions.map((it, i) => (
            <div key={i} className={`rounded-lg border p-2.5 mb-2 ${SEV_STYLES[it.severity] ?? SEV_STYLES.moderate}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase">
                <AlertTriangle className="h-3 w-3" />
                {it.severity} · {it.drugs.join(" + ")}
              </div>
              <p className="text-xs mt-1 text-foreground">{it.description}</p>
              <p className="text-[11px] mt-1 text-muted-foreground"><span className="font-semibold">Action:</span> {it.recommendation}</p>
            </div>
          ))}

          {data.general_warnings && data.general_warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground list-disc list-inside">
              {data.general_warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <p className="text-[10px] text-muted-foreground mt-3 italic">
            AI-generated guidance — always confirm with your pharmacist.
          </p>
        </>
      )}
    </div>
  );
}
