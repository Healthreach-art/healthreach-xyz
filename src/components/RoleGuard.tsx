import { Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";
import { dashboardPathForRole, type AppRole } from "@/lib/auth-session";

interface Props {
  allow: AppRole;
  children: ReactNode;
}

export function RoleGuard({ allow, children }: Props) {
  const { user, role, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  if (loading || (user && !role)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user || !role) {
    if (pathname === "/login") return null;
    return <Navigate to="/login" replace />;
  }

  if (role !== allow) {
    const target = dashboardPathForRole(role);
    if (pathname === target || pathname.startsWith(`${target}/`)) return null;
    return <Navigate to={target as never} replace />;
  }

  return <>{children}</>;
}
