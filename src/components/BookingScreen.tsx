import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import mark from "@/assets/healthreach-mark.png";

/** Phone-style booking screen shell matching the HealthReachCare booking journey design. */
export function BookingScreen({ onBack, backTo, children }: { onBack?: () => void; backTo?: "/dashboard/patient"; children: ReactNode }) {
  const back = <ChevronLeft className="h-5 w-5" />;
  return (
    <section className="mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-[0_20px_50px_-25px_rgba(4,120,87,0.45)]">
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center px-4 pt-4 pb-2">
        {onBack ? <button type="button" onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-emerald-50">{back}</button>
          : backTo ? <Link to={backTo} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-emerald-50">{back}</Link> : <span />}
        <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-800"><img src={mark} alt="" className="h-5 w-5 object-contain" />HealthReachCare</p>
        <Link to="/dashboard/patient/notifications" aria-label="Notifications" className="flex h-9 w-9 items-center justify-center justify-self-end rounded-full text-emerald-800 hover:bg-emerald-50"><Bell className="h-5 w-5" /></Link>
      </div>
      <div className="px-5 pb-6">{children}</div>
    </section>
  );
}

export function ScreenTitle({ title, sub }: { title: string; sub?: string }) {
  return <div className="mb-4 mt-1"><h1 className="text-2xl font-bold text-emerald-950">{title}</h1>{sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}</div>;
}

export function ServiceRow({ icon: Icon, title, sub, onClick, selected }: { icon: typeof Bell; title: string; sub: string; onClick: () => void; selected?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0 ${selected ? "bg-emerald-50" : ""}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-emerald-950">{title}</span><span className="block text-xs text-slate-500">{sub}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}

export function StepLabel({ n, label }: { n: number; label: string }) {
  return <p className="mx-auto mb-3 flex max-w-md items-center gap-2 text-sm font-semibold text-emerald-950"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">{n}</span>{label}</p>;
}
