import { Calendar, Clock, FileText, Stethoscope, Wallet } from "lucide-react";

const NAV = [
  { id: "appointments", label: "Bookings", icon: Calendar },
  { id: "availability", label: "Schedule", icon: Clock },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "profile", label: "Practice", icon: Stethoscope },
  { id: "docs", label: "Documents", icon: FileText },
] as const;

export type DoctorTab = typeof NAV[number]["id"];

export function DoctorBottomNav({ activeTab, onChange }: { activeTab: DoctorTab; onChange: (t: DoctorTab) => void }) {
  return (
    <nav aria-label="Doctor terminal" className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border bg-card shadow-lg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-full max-w-4xl grid-cols-5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <li key={id} className="h-full">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(id)}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors sm:text-xs ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-b bg-primary" />}
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
