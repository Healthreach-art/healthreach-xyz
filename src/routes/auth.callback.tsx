import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { Loader2 } from "lucide-react";
import { dashboardPathForRole, isAppRole, resolveUserRole } from "@/lib/auth-session";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing you in… — HealthReachCare" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finishing sign in…");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < 20; i++) {
        const { data } = await firestoreClient.auth.getUser();
        if (data.user) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      const { data: { user } } = await firestoreClient.auth.getUser();
      if (cancelled) return;
      if (!user) {
        navigate({ to: "/login" });
        return;
      }

      const intent = typeof window !== "undefined" ? localStorage.getItem("hr_oauth_role") : null;
      const fallbackRole = isAppRole(intent) && intent !== "admin" ? intent : "patient";
      const role = await resolveUserRole(user, { fallbackRole, repairMissing: true });
      const stored = typeof window !== "undefined" ? localStorage.getItem("hr_post_login_redirect") : null;
      const safeRedirect = stored && stored.startsWith("/") && !stored.startsWith("//") ? stored : null;
      try {
        localStorage.removeItem("hr_oauth_role");
        localStorage.removeItem("hr_post_login_redirect");
      } catch { /* ignore */ }

      if (safeRedirect) {
        window.location.assign(safeRedirect);
        return;
      }
      setMsg(`Welcome! Redirecting to your ${role} dashboard…`);
      navigate({ to: dashboardPathForRole(role) as never, replace: true });
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
