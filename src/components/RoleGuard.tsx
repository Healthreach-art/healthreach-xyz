import { Navigate } from "@tanstack/react-router";

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

  // While auth is loading, or the user is signed in but role hasn't been
  // fetched yet (fetchUserData runs async after onAuthStateChange), show a
  // spinner instead of bouncing to /login.
  if (loading || (user && !role)) {
    return null;
  }


  if (!user || !role) return <Navigate to="/login" />;
  if (role !== allow) return <Navigate to={dashboardPathForRole(role) as never} />;

  return <>{children}</>;
}
