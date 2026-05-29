import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { MapPin, Sparkles, PackagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { seedCapeTownDemo, setDemoLocation, placeMockPatientOrder } from "@/lib/demo-pipeline.functions";

interface Props {
  role: "patient" | "pharmacy" | "driver";
}

/**
 * Cape Town demo controls. Lets a user with any role:
 * - Seed the mock world (pharmacies, drivers, medications)
 * - Pin a demo Cape Town location (skips browser geolocation prompt)
 * - Pharmacy only: place a mock patient order to test the full pipeline
 */
export function DemoControls({ role }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const seed = useServerFn(seedCapeTownDemo);
  const setLoc = useServerFn(setDemoLocation);
  const placeOrder = useServerFn(placeMockPatientOrder);

  async function handle(name: string, fn: () => Promise<unknown>, success: string) {
    setBusy(name);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Demo action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Cape Town Demo Mode</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Seeds 3 mock pharmacies and 6 online drivers around Cape Town so you can see the full order flow in one browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null}
          onClick={() => handle("seed", () => seed(), "Cape Town mock world ready")}>
          {busy === "seed" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Seed mock world
        </Button>
        {role !== "pharmacy" && (
          <Button size="sm" variant="outline" disabled={busy !== null}
            onClick={() => handle("loc", () => setLoc({ data: { role: role as "patient" | "driver" } }), "Demo Cape Town location pinned")}>
            {busy === "loc" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
            Use demo Cape Town location
          </Button>
        )}
        {role === "pharmacy" && (
          <Button size="sm" disabled={busy !== null}
            onClick={() => handle("order", () => placeOrder(), "Mock patient order placed")}>
            {busy === "order" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackagePlus className="h-3 w-3" />}
            Place mock patient order
          </Button>
        )}
      </div>
    </div>
  );
}
