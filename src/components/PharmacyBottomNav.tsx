import { Home, Package, Pill, Plus, Settings } from "lucide-react";

export type PharmacyTab = "home" | "orders" | "rx" | "inventory" | "profile" | "branch" | "finance";

const ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Orders", icon: Package },
  { id: "rx", label: "New Rx", icon: Plus },
  { id: "inventory", label: "Stock", icon: Pill },
  { id: "profile", label: "Profile", icon: Settings },
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
    <nav aria-label="Pharmacy terminal" className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border/70 bg-white shadow-lg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-full max-w-4xl grid-cols-5">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          const prescriptionAction = id === "rx";
          return (
            <li key={id} className="h-full">
              <button
                type="button"
                aria-label={prescriptionAction ? "Open prescription review queue" : id === "orders" ? `Orders, ${pendingCount} pending` : label}
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(id)}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors sm:text-xs ${active ? "text-emerald-700" : "text-muted-foreground hover:text-slate-900"}`}
              >
                {active && !prescriptionAction && <span className="absolute inset-x-4 top-0 h-0.5 rounded-b bg-emerald-600" />}
                <span className="relative flex h-8 w-8 items-center justify-center">
                  {prescriptionAction ? (
                    <span className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-md transition hover:bg-emerald-700">
                      <Icon className="h-6 w-6 stroke-[2.5]" />
                    </span>
                  ) : (
                    <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                  )}
                  {id === "orders" && pendingCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
                <span className={prescriptionAction ? "-mt-1 font-semibold text-emerald-700" : ""}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
