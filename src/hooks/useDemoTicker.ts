import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { tickDemoDispatch } from "@/lib/demo-pipeline.functions";

/**
 * Polls the demo dispatch tick every 4s. Server function is a no-op when no
 * demo rows exist, so this is safe to leave running on every dashboard.
 */
export function useDemoTicker(enabled: boolean = true) {
  const tick = useServerFn(tickDemoDispatch);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = () => {
      tick().catch(() => {/* silent */});
    };
    run();
    const id = setInterval(() => {
      if (cancelled) return;
      run();
    }, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, tick]);
}
