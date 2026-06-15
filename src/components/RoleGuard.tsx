import { Navigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";
import { dashboardPathForRole } from "@/lib/auth-session";

type AppRole = "patient" | "pharmacy" | "hospital" | "driver" | "admin" | "doctor";

interface Props {
  allow: AppRole;
  children: ReactNode;
}

/**
 * Strict role gate. Renders children only when the signed-in user's role
 * matches `allow`. Mismatched roles are redirected to their own dashboard
 * so a pharmacy user can never see patient data and vice versa.
 */
export function RoleGuard({ allow, children }: Props) {
  const { user, role, loading } = useAuth();

  // While auth is loading, or the user is signed in but role hasn't been
  // fetched yet (fetchUserData runs async after onAuthStateChange), show a
  // spinner instead of bouncing to /login.
  if (loading || (user && !role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card w-full max-w-sm p-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Preparing your dashboard</p>
          <p className="mt-1 text-xs text-muted-foreground">Confirming your account and access level…</p>
        </div>
      </div>
    );
  }

  if (!user || !role) return <Navigate to="/login" />;
  if (role !== allow) return <Navigate to={dashboardPathForRole(role) as never} />;

  return <>{children}</>;
}
