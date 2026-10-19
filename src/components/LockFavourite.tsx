import { useEffect, useState } from "react";
import { Heart, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { isFavourite, setFavourite, type FavouriteType } from "@/lib/favourites";

/** "Lock Favourite Provider" card from the booking journey — saves to the patient's account. */
export function LockFavourite({ uid, type, providerId, providerName }: { uid?: string; type: FavouriteType; providerId: string; providerName: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!uid) return;
    void isFavourite(uid, type, providerId).then(setOn).catch(() => undefined).finally(() => setBusy(false));
  }, [uid, type, providerId]);
  if (!uid) return null;
  const label = type === "doctor" ? "doctor" : "caregiver";
  async function toggle() {
    setBusy(true);
    try { await setFavourite(uid!, type, providerId, providerName, !on); setOn(!on); toast.success(!on ? `Saved as your preferred ${label}` : "Removed from favourites"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save favourite"); }
    finally { setBusy(false); }
  }
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left">
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-950"><Lock className="h-4 w-4 text-emerald-700" />Lock favourite {label}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-700">Save {providerName} as my preferred {label}</span>
        <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => void toggle()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
          {busy && <Loader2 className="absolute -right-6 top-0.5 h-4 w-4 animate-spin text-emerald-700" />}
        </button>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-1.5"><Heart className="h-3 w-3 text-emerald-600" />Find them first next time you book</li>
        <li className="flex items-center gap-1.5"><Heart className="h-3 w-3 text-emerald-600" />Continuity of care with someone you trust</li>
      </ul>
    </div>
  );
}
