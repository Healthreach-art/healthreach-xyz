import { ClipboardList, FileText, Home, Settings, Users } from "lucide-react";

const NAV = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "assignments", label: "Visits", icon: ClipboardList },
  { id: "staff", label: "Team", icon: Users },
  { id: "documents", label: "Credentials", icon: FileText },
  { id: "profile", label: "Settings", icon: Settings },
] as const;

export type HomecareTerminalTab = typeof NAV[number]["id"];

export function HomecareBottomNav({
  activeTab,
  onChange,
  showTeam = true,
}: {
  activeTab: HomecareTerminalTab;
  onChange: (tab: HomecareTerminalTab) => void;
  showTeam?: boolean;
}) {
  const items = NAV.filter((item) => showTeam || item.id !== "staff");
  return (
    <nav aria-label="Home care terminal" className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border bg-card shadow-lg pb-[env(safe-area-inset-bottom)]">
      <ul className={`mx-auto grid h-full max-w-4xl ${showTeam ? "grid-cols-5" : "grid-cols-4"}`}>
        {items.map(({ id, label, icon: Icon }) => {
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
