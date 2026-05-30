import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { MapPin, PackagePlus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { setDemoLocation, placeMockPatientOrder } from "@/lib/demo-pipeline.functions";

interface Props {
  role: "patient" | "pharmacy" | "driver";
}

const PIN_KEY = "healthreach.demoLocationPinned";

/**
 * Cape Town demo controls. Lets a user with any role:
 * - Pin a demo Cape Town location (persists across sessions, re-applies on load)
 * - Pharmacy only: place a mock patient order to test the full pipeline
 */
export function DemoControls({ role }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const setLoc = useServerFn(setDemoLocation);
  const placeOrder = useServerFn(placeMockPatientOrder);

  // Restore pinned location automatically on every mount
  useEffect(() => {
    if (role === "pharmacy") return;
    const saved = typeof window !== "undefined" && localStorage.getItem(PIN_KEY) === role;
    if (saved) {
      setPinned(true);
      setLoc({ data: { role: role as "patient" | "driver" } }).catch(() => {/* silent */});
    }
  }, [role, setLoc]);

  async function handle(name: string, fn: () => Promise<unknown>, success: string) {
    setBusy(name);
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Demo action failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function togglePin() {
    if (pinned) {
      localStorage.removeItem(PIN_KEY);
      setPinned(false);
      toast.message("Demo location unpinned");
      return;
    }
    const ok = await handle(
      "loc",
      () => setLoc({ data: { role: role as "patient" | "driver" } }),
      "Demo Cape Town location pinned permanently",
    );
    if (ok) {
      localStorage.setItem(PIN_KEY, role);
      setPinned(true);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Cape Town Demo Mode</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Pin a Cape Town location so you can test orders and dispatches without sharing your real GPS.
      </p>
      <div className="flex flex-wrap gap-2">
        {role !== "pharmacy" && (
          <Button
            size="sm"
            variant={pinned ? "default" : "outline"}
            disabled={busy !== null}
            onClick={togglePin}
          >
            {busy === "loc" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : pinned ? (
              <Check className="h-3 w-3" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
            {pinned ? "Demo location active — tap to unpin" : "Use demo Cape Town location"}
          </Button>
        )}
        {role === "pharmacy" && (
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => handle("order", () => placeOrder(), "Mock patient order placed")}
          >
            {busy === "order" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackagePlus className="h-3 w-3" />}
            Place mock patient order
          </Button>
        )}
      </div>
    </div>
  );
}
