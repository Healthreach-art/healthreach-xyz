import { Activity, Home, UserRound } from "lucide-react";

export type PharmacyTab = "home" | "orders" | "rx" | "inventory" | "profile" | "branch" | "finance";

const ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Activities", icon: Activity },
  { id: "profile", label: "Account", icon: UserRound },
] as const;

export function PharmacyBottomNav({
  activeTab,
  onChange,
  pendingCount,
}: {
  activeTab: PharmacyTab;
  onChange: (tab: PharmacyTab) => void;
  pendingCount: number;
}) {
  return (
    <nav aria-label="Pharmacy terminal" className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-white shadow-lg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-3">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <li key={id} className="h-full">
              <button
                type="button"
                aria-label={id === "orders" ? `Activities, ${pendingCount} pending orders` : label}
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(id)}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors sm:text-xs ${active ? "text-emerald-700" : "text-muted-foreground hover:text-slate-900"}`}
              >
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-emerald-600" />}
                <span className="relative flex h-8 w-8 items-center justify-center">
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
