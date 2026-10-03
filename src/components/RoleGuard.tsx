import { Navigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";
import { dashboardPathForRole, type AppRole } from "@/lib/auth-session";

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Don't redirect until Firebase has resolved the session and its Firestore role.
  if (loading || (user && !role)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Checking your account">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !role) {
    if (pathname === "/login") return null;
    return <Navigate to="/login" replace />;
  }
  if (role !== allow) {
    const destination = dashboardPathForRole(role);
    if (pathname === destination || pathname.startsWith(`${destination}/`)) return null;
    return <Navigate to={destination as never} replace />;
  }

  return <>{children}</>;
}
