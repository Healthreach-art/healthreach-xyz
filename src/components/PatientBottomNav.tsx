import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, Search, User } from "lucide-react";

const ITEMS = [
  { to: "/dashboard/patient", label: "Home", icon: Home, exact: true },
  { to: "/dashboard/patient/activity", label: "Activities", icon: ClipboardList, exact: false },
  { to: "/dashboard/patient/search", label: "Search", icon: Search, exact: false },
  { to: "/dashboard/patient/account", label: "Account", icon: User, exact: false },
] as const;

export function PatientBottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname }).replace(/\/$/, "");
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map((it) => {
          const active = it.exact ? path === it.to : path.startsWith(it.to);
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <it.icon className={`h-6 w-6 ${active ? "stroke-[2.5]" : ""}`} />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
