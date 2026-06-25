import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Crosshair, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { autocompleteAddress, resolvePlace, reverseGeocodeOne } from "@/lib/places.functions";


export interface PickedAddress {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  value?: PickedAddress | null;
  onChange: (a: PickedAddress) => void;
  placeholder?: string;
  label?: string;
}

let mapsLoaderPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (mapsLoaderPromise) return mapsLoaderPromise;
  mapsLoaderPromise = new Promise<void>((resolve, reject) => {
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) { reject(new Error("Maps key missing")); return; }
    (window as any).__initLovableMaps = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&callback=__initLovableMaps${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.onerror = () => reject(new Error("Maps script failed"));
    document.head.appendChild(s);
  });
  return mapsLoaderPromise;
}

export function AddressPicker({ value, onChange, placeholder = "Start typing your address…", label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value?.address ?? "");
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; primary: string; secondary: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => { setText(value?.address ?? ""); }, [value?.address]);

  useEffect(() => {
    loadGoogleMaps().catch((e) => console.warn("Maps load:", e.message));
  }, []);

  useEffect(() => {
    if (!text || text.length < 3) { setSuggestions([]); return; }
    if (text === value?.address) { setSuggestions([]); return; }
    const handle = setTimeout(async () => {
      // Try client-side Google Places first
      try {
        await loadGoogleMaps();
        const places: any = await (window as any).google.maps.importLibrary("places");
        if (!sessionTokenRef.current) sessionTokenRef.current = new places.AutocompleteSessionToken();
        const { suggestions: s } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text, sessionToken: sessionTokenRef.current,
        });
        const mapped = (s ?? []).slice(0, 5).map((sg: any) => ({
          placeId: sg.placePrediction?.placeId,
          primary: sg.placePrediction?.mainText?.text ?? sg.placePrediction?.text?.text ?? "",
          secondary: sg.placePrediction?.secondaryText?.text ?? "",
        })).filter((x: any) => x.placeId);
        if (mapped.length) { setSuggestions(mapped); setOpen(true); return; }
        throw new Error("no client results");
      } catch {
        // Server fallback (works on any domain regardless of key referrer restrictions)
        try {
          const res = await autocompleteAddress({ data: { input: text } });
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
        } catch { /* silent */ }
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [text, value?.address]);

  async function pick(placeId: string, label: string) {
    setOpen(false);
    setBusy(true);
    try {
      // Server-side resolution handles both Google place IDs and OSM IDs and works on every domain
      const res = await resolvePlace({ data: { placeId } });
      const address = res.address || label;
      setText(address);
      sessionTokenRef.current = null;
      onChange({ address, lat: res.lat, lng: res.lng });
    } catch {
      // Last resort: try client SDK (only works in lovable preview / allowed origins)
      try {
        const places: any = await (window as any).google.maps.importLibrary("places");
        const place = new places.Place({ id: placeId });
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        const loc = place.location;
        const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
        const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
        const address = place.formattedAddress ?? label;
        setText(address);
        sessionTokenRef.current = null;
        onChange({ address, lat, lng });
      } catch {
        toast.error("Could not resolve address");
      }
    } finally { setBusy(false); }
  }

  function useCurrent() {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await reverseGeocodeOne({ data: { lat, lng } });
          setText(res.address);
          onChange({ address: res.address, lat, lng });
          toast.success("Current location pinned");
        } catch {
          const fallback = "Current location";
          setText(fallback);
          onChange({ address: fallback, lat, lng });
        } finally { setBusy(false); }
      },
      (err) => { toast.error(err.message); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }


  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
            <Input
              ref={inputRef}
              className="pl-9 h-11 rounded-xl border-border/70 bg-background/70 backdrop-blur focus-visible:ring-primary/40"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              onFocus={() => suggestions.length && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={useCurrent}
            disabled={busy}
            title="Use current location"
            className="h-11 px-3 rounded-xl gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            <span className="hidden sm:inline text-xs">My location</span>
          </Button>
        </div>
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-popover shadow-xl max-h-72 overflow-auto">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.placeId, `${s.primary} ${s.secondary}`)}
                className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm flex items-start gap-2 border-b last:border-b-0 border-border/40"
              >
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.primary}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.secondary}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {value?.address && (
        <div className="flex items-start gap-2 rounded-xl border border-healthcare-green/30 bg-healthcare-green/5 px-3 py-2">
          <MapPin className="h-4 w-4 text-healthcare-green mt-0.5 shrink-0" />
          <p className="text-xs text-foreground leading-relaxed">
            <span className="font-medium text-healthcare-green">Verified address</span><br />
            {value.address}
          </p>
        </div>
      )}
    </div>
  );
}

