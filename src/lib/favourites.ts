import { fsDelete, fsGet, fsList, fsSet, where } from "@/lib/firestore";

export type FavouriteType = "doctor" | "caregiver";
export type Favourite = { patient_id: string; provider_type: FavouriteType; provider_id: string; provider_name: string; created_at: string };

export const favouriteId = (uid: string, type: FavouriteType, providerId: string) => `${uid}_${type}_${providerId}`;

export async function isFavourite(uid: string, type: FavouriteType, providerId: string) {
  return !!(await fsGet("patient_favourites", favouriteId(uid, type, providerId)));
}

export async function setFavourite(uid: string, type: FavouriteType, providerId: string, providerName: string, on: boolean) {
  const id = favouriteId(uid, type, providerId);
  if (!on) return fsDelete("patient_favourites", id);
  await fsSet("patient_favourites", id, {
    patient_id: uid, provider_type: type, provider_id: providerId, provider_name: providerName.slice(0, 200), created_at: new Date().toISOString(),
  }, false);
}

export async function listFavourites(uid: string, type?: FavouriteType) {
  const rows = await fsList<Favourite>("patient_favourites", where("patient_id", "==", uid));
  return type ? rows.filter((r) => r.provider_type === type) : rows;
}
