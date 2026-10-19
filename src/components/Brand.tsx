import logo from "@/assets/healthreach-logo.png";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="inline-flex min-w-0 items-center gap-2 text-foreground">
    <img src={logo} alt="" className={compact ? "h-6 w-6 shrink-0 object-contain" : "h-9 w-9 shrink-0 object-contain"} />
    <span className={compact ? "text-sm font-bold" : "text-base font-bold sm:text-lg"}>HealthReach<span className="text-primary">Care</span></span>
  </span>;
}