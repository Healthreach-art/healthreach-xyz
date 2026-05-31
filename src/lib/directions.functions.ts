import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  pickup: z.string().min(2).max(500),
  dropoff: z.string().min(2).max(500),
});

type Coord = [number, number]; // [lat, lng]

const MAPBOX = "https://api.mapbox.com";

async function geocodeMapbox(addr: string, token: string): Promise<Coord | null> {
  const url = `${MAPBOX}/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?limit=1&country=za&access_token=${token}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = (await r.json()) as { features?: Array<{ center: [number, number] }> };
  const c = j.features?.[0]?.center;
  return c ? [c[1], c[0]] : null;
}

async function geocodeOSM(addr: string): Promise<Coord | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=za&q=${encodeURIComponent(addr)}`,
      { headers: { "User-Agent": "healthreach-app" } },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (!j.length) return null;
    return [parseFloat(j[0].lat), parseFloat(j[0].lon)];
  } catch {
    return null;
  }
}

/**
 * Geocode pickup + dropoff and return a real driving route polyline (GeoJSON).
 * Uses Mapbox when MAPBOX_ACCESS_TOKEN is set, otherwise falls back to a
 * straight line between OSM-geocoded points.
 */
export const getDirections = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;

    const [pickup, dropoff] = await Promise.all([
      token ? geocodeMapbox(data.pickup, token).then((c) => c ?? geocodeOSM(data.pickup)) : geocodeOSM(data.pickup),
      token ? geocodeMapbox(data.dropoff, token).then((c) => c ?? geocodeOSM(data.dropoff)) : geocodeOSM(data.dropoff),
    ]);

    if (!pickup || !dropoff) {
      return { pickup, dropoff, route: null, distance_km: null, duration_min: null, error: "Could not locate address" };
    }

    if (!token) {
      return { pickup, dropoff, route: [pickup, dropoff] as Coord[], distance_km: null, duration_min: null, error: null };
    }

    const url = `${MAPBOX}/directions/v5/mapbox/driving/${pickup[1]},${pickup[0]};${dropoff[1]},${dropoff[0]}?geometries=geojson&overview=full&access_token=${token}`;
    const r = await fetch(url);
    if (!r.ok) {
      return { pickup, dropoff, route: [pickup, dropoff] as Coord[], distance_km: null, duration_min: null, error: `directions_${r.status}` };
    }
    const j = (await r.json()) as { routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }> };
    const route = j.routes?.[0];
    if (!route) {
      return { pickup, dropoff, route: [pickup, dropoff] as Coord[], distance_km: null, duration_min: null, error: "no_route" };
    }
    const coords: Coord[] = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    return {
      pickup,
      dropoff,
      route: coords,
      distance_km: Math.round((route.distance / 1000) * 10) / 10,
      duration_min: Math.round(route.duration / 60),
      error: null,
    };
  });
