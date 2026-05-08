import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Star, Clock, MapPin, Store } from "lucide-react";
import pharmacy1 from "@/assets/pharmacy-1.jpg";
import pharmacy2 from "@/assets/pharmacy-2.jpg";
import pharmacy3 from "@/assets/pharmacy-3.jpg";
import pharmacy4 from "@/assets/pharmacy-4.jpg";

const IMGS = [pharmacy1, pharmacy2, pharmacy3, pharmacy4];
function img(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return IMGS[h % IMGS.length]; }
function meta(id: string) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const rating = Number((4.0 + ((h % 100) / 100)).toFixed(1));
  const dm = 15 + (h % 6) * 5;
  const fee = (h % 4 === 0) ? 0 : 15 + (h % 4) * 5;
  return { rating, deliveryLabel: `${dm}–${dm + 10} min`, isOpen: (h % 7) !== 0, fee };
}

interface Ph { user_id: string; organization_name: string | null; full_name: string; address: string | null; }

export const Route = createFileRoute("/dashboard/patient/pharmacies")({
  head: () => ({ meta: [{ title: "Browse Pharmacies — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><PharmaciesPage /></RoleGuard>,
});

function PharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<Ph[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "pharmacy");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data } = await supabase.from("profiles")
          .select("user_id, organization_name, full_name, address, approval_status")
          .in("user_id", ids).eq("approval_status", "approved");
        setPharmacies((data ?? []) as Ph[]);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = pharmacies.filter((p) => {
    const s = q.toLowerCase();
    if (!s) return true;
    return ((p.organization_name || p.full_name || "").toLowerCase().includes(s)) || ((p.address ?? "").toLowerCase().includes(s));
  });

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Store className="h-6 w-6 text-primary" /> Browse Pharmacies</h1>
        <p className="text-sm text-muted-foreground">All approved pharmacies on HEALTHREACH.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pharmacies or location…"
          className="w-full h-12 rounded-2xl border border-border bg-card pl-12 pr-4 text-sm shadow focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {!loading && filtered.length === 0 && (
        <div className="healthcare-card p-8 text-center text-sm text-muted-foreground">No pharmacies found.</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const m = meta(p.user_id);
          const name = p.organization_name || p.full_name;
          return (
            <Link key={p.user_id} to="/pharmacy/$id" params={{ id: p.user_id }}
              className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all">
              <div className="relative h-40 overflow-hidden">
                <img src={img(p.user_id)} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <span className={`absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-bold shadow ${m.isOpen ? "bg-healthcare-green text-white" : "bg-muted text-muted-foreground"}`}>{m.isOpen ? "Open" : "Closed"}</span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-base text-foreground line-clamp-1">{name}</h3>
                  <span className="flex items-center gap-0.5 text-sm font-semibold shrink-0"><Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> {m.rating.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {m.deliveryLabel}</span>
                  <span>•</span>
                  <span className={m.fee === 0 ? "text-healthcare-green font-medium" : ""}>{m.fee === 0 ? "Free delivery" : `R${m.fee} delivery`}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.address || "Johannesburg"}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
