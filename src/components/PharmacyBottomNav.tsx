import { Package, Pill, FileText, MapPin, DollarSign } from "lucide-react";

export type PharmacyTab = "orders" | "inventory" | "rx" | "branch" | "finance";

const ITEMS = [
  { id: "orders", label: "Orders", description: "Incoming & Active Orders", icon: Package },
  { id: "inventory", label: "Inventory", description: "Medication & Stock", icon: Pill },
  { id: "rx", label: "Prescriptions", description: "Prescription Queue", icon: FileText },
  { id: "branch", label: "Branch", description: "Branch & Operating Hours", icon: MapPin },
  { id: "finance", label: "Finance", description: "Earnings & Payouts", icon: DollarSign },
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
    <nav aria-label="Pharmacy terminal" className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border bg-card shadow-lg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-full max-w-4xl grid-cols-5">
        {ITEMS.map(({ id, label, description, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <li key={id} className="h-full">
              <button
                type="button"
                aria-label={description}
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(id)}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors sm:text-xs ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-b bg-primary" />}
                <span className="relative">
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                  {id === "orders" && pendingCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
