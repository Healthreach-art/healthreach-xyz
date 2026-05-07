import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing you in… — HEALTHREACH" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finishing sign in…");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Wait briefly for session hydration after OAuth redirect
      for (let i = 0; i < 20; i++) {
        const { data } = await supabase.auth.getUser();
        if (data.user) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        navigate({ to: "/login" });
        return;
      }

      // Lookup role
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      let role = roleRow?.role as string | undefined;

      // No role yet (fresh Google signup) → use stashed intent or default to patient
      if (!role) {
        const intent = (typeof window !== "undefined" && localStorage.getItem("hr_oauth_role")) || "patient";
        const allowed = ["patient", "pharmacy", "driver"];
        const chosen = allowed.includes(intent) ? intent : "patient";
        const { error: insErr } = await supabase
          .from("user_roles")
          .insert({ user_id: user.id, role: chosen as any });
        if (!insErr) role = chosen;
        else role = "patient";
        try { localStorage.removeItem("hr_oauth_role"); } catch {}
      }

      setMsg(`Welcome! Redirecting to your ${role} dashboard…`);
      navigate({ to: `/dashboard/${role}` as any });
    };
    run();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="healthcare-card p-8 text-center max-w-md">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">{msg}</p>
      </div>
    </div>
  );
}
