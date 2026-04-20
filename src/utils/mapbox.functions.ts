import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  pickup: z.string().min(3).max(500),
  dropoff: z.string().min(3).max(500),
});

const MAPBOX_BASE = "https://api.mapbox.com";

async function geocode(address: string, token: string): Promise<[number, number] | null> {
  const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: Array<{ center: [number, number] }> };
  return json.features?.[0]?.center ?? null;
}

export const getMapboxDistance = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      return { distance_km: null, duration_min: null, error: "Mapbox token not configured" };
    }
    try {
      const [from, to] = await Promise.all([geocode(data.pickup, token), geocode(data.dropoff, token)]);
      if (!from || !to) {
        return { distance_km: null, duration_min: null, error: "Could not geocode address" };
      }
      const url = `${MAPBOX_BASE}/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?access_token=${token}&overview=false`;
      const res = await fetch(url);
      if (!res.ok) {
        return { distance_km: null, duration_min: null, error: `Directions API ${res.status}` };
      }
      const json = (await res.json()) as { routes?: Array<{ distance: number; duration: number }> };
      const route = json.routes?.[0];
      if (!route) {
        return { distance_km: null, duration_min: null, error: "No route found" };
      }
      return {
        distance_km: Math.round((route.distance / 1000) * 10) / 10,
        duration_min: Math.round(route.duration / 60),
        error: null,
      };
    } catch (e) {
      console.error("Mapbox error:", e);
      return { distance_km: null, duration_min: null, error: "Mapbox request failed" };
    }
  });
