import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://maps.googleapis.com";

// Portable: uses your own Google key (GOOGLE_MAPS_DIRECT_KEY) if set,
// otherwise free OpenStreetMap. No Lovable dependency.
function authHeaders(): Record<string, string> | null {
  return null;
}

export const autocompleteAddress = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ input: z.string().min(1).max(300), sessionToken: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const headers = authHeaders();
    // Try Google Places via Lovable gateway first
    if (headers) {
      try {
        const url = new URL(`${GATEWAY_URL}/maps/api/place/autocomplete/json`);
        url.searchParams.set("input", data.input);
        url.searchParams.set("components", "country:za");
        if (data.sessionToken) url.searchParams.set("sessiontoken", data.sessionToken);
        const res = await fetch(url.toString(), { headers });
        if (res.ok) {
          const j = (await res.json()) as { predictions?: Array<{ place_id: string; structured_formatting?: { main_text?: string; secondary_text?: string }; description?: string }> };
          const suggestions = (j.predictions ?? []).slice(0, 6).map((p) => ({
            placeId: p.place_id,
            primary: p.structured_formatting?.main_text ?? p.description ?? "",
            secondary: p.structured_formatting?.secondary_text ?? "",
            source: "google" as const,
          }));
          if (suggestions.length) return { suggestions };
        }
      } catch { /* fall through */ }
    }
    // Fallback: OSM Nominatim
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", data.input);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "6");
      url.searchParams.set("countrycodes", "za");
      const res = await fetch(url.toString(), { headers: { "User-Agent": "HealthReachCare/1.0" } });
      if (!res.ok) return { suggestions: [] };
      const arr = (await res.json()) as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
      return {
        suggestions: arr.map((r) => {
          const parts = r.display_name.split(",");
          return {
            placeId: `osm:${r.place_id}:${r.lat}:${r.lon}`,
            primary: parts[0]?.trim() ?? r.display_name,
            secondary: parts.slice(1).join(",").trim(),
            source: "osm" as const,
          };
        }),
      };
    } catch {
      return { suggestions: [] };
    }
  });

export const resolvePlace = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ placeId: z.string().min(1).max(300), sessionToken: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    // OSM-coded placeId carries the coordinates directly
    if (data.placeId.startsWith("osm:")) {
      const [, , lat, lon] = data.placeId.split(":");
      const latN = Number(lat);
      const lngN = Number(lon);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("lat", lat);
        url.searchParams.set("lon", lon);
        url.searchParams.set("format", "json");
        const res = await fetch(url.toString(), { headers: { "User-Agent": "HealthReachCare/1.0" } });
        const j = res.ok ? ((await res.json()) as { display_name?: string }) : null;
        return { address: j?.display_name ?? `${latN}, ${lngN}`, lat: latN, lng: lngN };
      } catch {
        return { address: `${latN}, ${lngN}`, lat: latN, lng: lngN };
      }
    }
    const headers = authHeaders();
    if (!headers) throw new Error("Maps gateway not configured");
    const url = new URL(`${GATEWAY_URL}/maps/api/place/details/json`);
    url.searchParams.set("place_id", data.placeId);
    url.searchParams.set("fields", "geometry,formatted_address");
    if (data.sessionToken) url.searchParams.set("sessiontoken", data.sessionToken);
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error("Place details failed");
    const j = (await res.json()) as { result?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string } };
    const loc = j.result?.geometry?.location;
    if (!loc) throw new Error("No location");
    return { address: j.result?.formatted_address ?? "", lat: loc.lat, lng: loc.lng };
  });

export const reverseGeocodeOne = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ lat: z.number(), lng: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const headers = authHeaders();
    if (headers) {
      try {
        const res = await fetch(
          `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}`,
          { headers },
        );
        if (res.ok) {
          const j = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
          const address = j.results?.[0]?.formatted_address;
          if (address) return { address };
        }
      } catch { /* fall through */ }
    }
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(data.lat));
      url.searchParams.set("lon", String(data.lng));
      url.searchParams.set("format", "json");
      const res = await fetch(url.toString(), { headers: { "User-Agent": "HealthReachCare/1.0" } });
      const j = res.ok ? ((await res.json()) as { display_name?: string }) : null;
      return { address: j?.display_name ?? `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}` };
    } catch {
      return { address: `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}` };
    }
  });
