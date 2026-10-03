import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { firestoreAdmin } from "./firestore-admin";
import { requireFirebaseAuth } from "./firebase-auth-middleware";

export const firestoreActionNames = [
  "get_order_group_timeline",
  "hide_order_group_for_patient",
  "clear_patient_order_history",
  "admin_set_pharmacy_document_review",
  "accept_pharmacy_offer",
  "decline_pharmacy_offer",
  "pharmacy_resubmit_document",
  "find_homecare_near",
  "get_order_driver_contact",
  "log_admin_action",
  "invite_admin",
] as const;
export type FirestoreActionName = (typeof firestoreActionNames)[number];

const actionInput = z.object({
  name: z.enum(firestoreActionNames),
  args: z.record(z.string(), z.unknown()).default({}),
});

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`Missing or invalid "${key}".`);
  return value;
}

function numberArg(args: Record<string, unknown>, key: string, fallback?: number): number {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined && value === undefined) return fallback;
  throw new Error(`Missing or invalid "${key}".`);
}

async function rows<T>(query: PromiseLike<{ data: T | null; error: Error | null }>): Promise<T> {
  const result = await query;
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("Firestore returned no data.");
  return result.data;
}

async function requireAdmin(userId: string) {
  const roleRows = await rows(
    firestoreAdmin.from("user_roles").select("role").eq("user_id", userId),
  );
  if (!(roleRows as Array<{ role: string }>).some((row) => row.role === "admin")) {
    throw new Response("Admin role required.", { status: 403 });
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const runFirestoreAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => actionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { name, args } = data;
    const now = new Date().toISOString();

    switch (name) {
      case "get_order_group_timeline": {
        const groupId = stringArg(args, "_group_id");
        const [groups, deliveries] = await Promise.all([
          rows(firestoreAdmin.from("order_groups").select("patient_id, pharmacy_id").eq("id", groupId)),
          rows(firestoreAdmin.from("deliveries").select("driver_id").eq("order_group_id", groupId)),
        ]);
        const group = (groups as Array<{ patient_id: string; pharmacy_id: string | null }>)[0];
        const isAdmin = await firestoreAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", context.userId)
          .eq("role", "admin")
          .maybeSingle();
        const isParticipant =
          group?.patient_id === context.userId ||
          group?.pharmacy_id === context.userId ||
          (deliveries as Array<{ driver_id: string }>).some((delivery) => delivery.driver_id === context.userId);
        if (!isParticipant && !isAdmin.data) throw new Response("Not authorized.", { status: 403 });
        return rows(firestoreAdmin.from("order_group_events").select("*")
          .eq("order_group_id", groupId).order("at", { ascending: true }));
      }
      case "hide_order_group_for_patient": {
        const groupId = stringArg(args, "_group_id");
        const groups = await rows(firestoreAdmin.from("order_groups").select("id, patient_id")
          .eq("id", groupId));
        const group = (groups as Array<{ id: string; patient_id: string }>)[0];
        if (!group) {
          const { data: order, error } = await firestoreAdmin.from("orders")
            .select("id, patient_id, status").eq("id", groupId).maybeSingle();
          if (error) throw error;
          if (order?.patient_id === context.userId &&
              ["delivered", "cancelled", "rejected"].includes(order.status)) {
            const { error: updateError } = await firestoreAdmin.from("orders")
              .update({ hidden_for_patient_at: now }).eq("id", groupId);
            if (updateError) throw updateError;
          }
          return { ok: true, mode: "order" };
        }
        if (group.patient_id !== context.userId) throw new Response("Not your order.", { status: 403 });
        const { error: groupError } = await firestoreAdmin.from("order_groups")
          .update({ hidden_for_patient_at: now }).eq("id", groupId);
        if (groupError) throw groupError;
        const orders = await rows(firestoreAdmin.from("orders").select("id").eq("order_group_id", groupId));
        for (const order of orders as Array<{ id: string }>) {
          const { error } = await firestoreAdmin.from("orders")
            .update({ hidden_for_patient_at: now }).eq("id", order.id);
          if (error) throw error;
        }
        return { ok: true, mode: "group" };
      }
      case "clear_patient_order_history": {
        const [orders, groups] = await Promise.all([
          rows(firestoreAdmin.from("orders").select("id").eq("patient_id", context.userId)
            .in("status", ["delivered", "cancelled", "rejected"])),
          rows(firestoreAdmin.from("order_groups").select("id").eq("patient_id", context.userId)
            .in("status", ["delivered", "cancelled", "rejected"])),
        ]);
        for (const order of orders as Array<{ id: string }>) {
          const { error } = await firestoreAdmin.from("orders")
            .update({ hidden_for_patient_at: now }).eq("id", order.id);
          if (error) throw error;
        }
        for (const group of groups as Array<{ id: string }>) {
          const { error } = await firestoreAdmin.from("order_groups")
            .update({ hidden_for_patient_at: now }).eq("id", group.id);
          if (error) throw error;
        }
        return { ok: true, groups: groups.length, orders: orders.length };
      }
      case "admin_set_pharmacy_document_review": {
        await requireAdmin(context.userId);
        const pharmacyId = stringArg(args, "_pharmacy_id");
        const key = stringArg(args, "_doc_key");
        const status = stringArg(args, "_status");
        const notes = typeof args._notes === "string" ? args._notes : "";
        const validKeys = new Set([
          "license_path", "pharmacist_cert_path", "business_reg_path",
          "tax_cert_path", "proof_of_address_path", "bank_confirmation_path",
        ]);
        if (!validKeys.has(key)) throw new Error("Invalid document key.");
        if (!["approved", "rejected", "under_review"].includes(status)) {
          throw new Error("Invalid review status.");
        }
        const { data: document, error: readError } = await firestoreAdmin
          .from("pharmacy_documents").select("id, document_reviews")
          .eq("pharmacy_id", pharmacyId).maybeSingle();
        if (readError) throw readError;
        const entry = { status, notes, reviewed_at: now, reviewed_by: context.userId };
        const documentReviews = {
          ...((document?.document_reviews as Record<string, unknown> | null) ?? {}),
          [key]: entry,
        };
        const { error } = document
          ? await firestoreAdmin.from("pharmacy_documents")
            .update({ document_reviews: documentReviews, updated_at: now }).eq("id", document.id)
          : await firestoreAdmin.from("pharmacy_documents").insert({
            pharmacy_id: pharmacyId, document_reviews: documentReviews, submitted_at: now,
            created_at: now, updated_at: now,
          });
        if (error) throw error;
        return { ok: true, entry };
      }
      case "accept_pharmacy_offer":
      case "decline_pharmacy_offer": {
        const offerId = stringArg(args, "_offer_id");
        const { data: offer, error } = await firestoreAdmin.from("pharmacy_offers")
          .select("id, order_id, pharmacy_id, status, expires_at")
          .eq("id", offerId).maybeSingle();
        if (error) throw error;
        if (!offer) throw new Error("Offer not found.");
        if (offer.pharmacy_id !== context.userId) throw new Response("Not your offer.", { status: 403 });
        if (offer.status !== "open") throw new Error("Offer no longer open.");
        if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
          await firestoreAdmin.from("pharmacy_offers").update({ status: "expired" }).eq("id", offerId);
          throw new Error("Offer expired.");
        }
        if (name === "decline_pharmacy_offer") {
          const { error: updateError } = await firestoreAdmin.from("pharmacy_offers")
            .update({ status: "declined", responded_at: now }).eq("id", offerId);
          if (updateError) throw updateError;
          return null;
        }
        const { data: order, error: orderError } = await firestoreAdmin.from("orders")
          .select("id, pharmacy_id").eq("id", offer.order_id).maybeSingle();
        if (orderError) throw orderError;
        if (!order || order.pharmacy_id) throw new Error("Order already assigned to another pharmacy.");
        const { error: assignError } = await firestoreAdmin.from("orders").update({
          pharmacy_id: offer.pharmacy_id, pharmacy_assigned_at: now, status: "preparing", updated_at: now,
        }).eq("id", offer.order_id);
        if (assignError) throw assignError;
        const { error: acceptError } = await firestoreAdmin.from("pharmacy_offers")
          .update({ status: "accepted", responded_at: now }).eq("id", offerId);
        if (acceptError) throw acceptError;
        const siblingOffers = await rows(firestoreAdmin.from("pharmacy_offers").select("id")
          .eq("order_id", offer.order_id).eq("status", "open"));
        for (const sibling of siblingOffers as Array<{ id: string }>) {
          if (sibling.id === offerId) continue;
          const { error: siblingError } = await firestoreAdmin.from("pharmacy_offers")
            .update({ status: "expired" }).eq("id", sibling.id);
          if (siblingError) throw siblingError;
        }
        return offer.order_id;
      }
      case "pharmacy_resubmit_document": {
        const key = stringArg(args, "_doc_key");
        const validKeys = new Set([
          "license_path", "pharmacist_cert_path", "business_reg_path",
          "tax_cert_path", "proof_of_address_path", "bank_confirmation_path",
        ]);
        if (!validKeys.has(key)) throw new Error("Invalid document key.");
        const { data: document, error } = await firestoreAdmin.from("pharmacy_documents")
          .select("id, document_reviews").eq("pharmacy_id", context.userId).maybeSingle();
        if (error) throw error;
        if (document) {
          const reviews = { ...((document.document_reviews as Record<string, unknown> | null) ?? {}) };
          delete reviews[key];
          const { error: updateError } = await firestoreAdmin.from("pharmacy_documents")
            .update({ document_reviews: reviews, submitted_at: now, reviewed_at: null, updated_at: now })
            .eq("id", document.id);
          if (updateError) throw updateError;
        }
        const { error: profileError } = await firestoreAdmin.from("profiles")
          .update({ approval_status: "under_review", updated_at: now })
          .eq("user_id", context.userId);
        if (profileError) throw profileError;
        return { ok: true };
      }
      case "find_homecare_near": {
        const latitude = numberArg(args, "_lat");
        const longitude = numberArg(args, "_lng");
        const maxKm = numberArg(args, "_max_km", 100);
        const { data: providers, error } = await firestoreAdmin.from("homecare_providers")
          .select("id, provider_type, business_name, full_name, address, services, service_areas, hourly_rate, operating_hours, latitude, longitude, approval_status, is_active")
          .eq("approval_status", "approved").eq("is_active", true);
        if (error) throw error;
        return (providers ?? []).flatMap((provider) => {
          if (provider.latitude == null || provider.longitude == null) return [];
          const distance = haversineKm(latitude, longitude, provider.latitude, provider.longitude);
          if (distance > maxKm) return [];
          return [{
            id: provider.id,
            provider_type: provider.provider_type,
            display_name: provider.business_name || provider.full_name || "",
            city: String(provider.address ?? "").split(",")[0] ?? "",
            address: provider.address,
            services: provider.services,
            service_areas: provider.service_areas,
            hourly_rate: provider.hourly_rate,
            operating_hours: provider.operating_hours,
            latitude: provider.latitude,
            longitude: provider.longitude,
            distance_km: Math.round(distance * 10) / 10,
          }];
        }).sort((first, second) => first.distance_km - second.distance_km);
      }
      case "get_order_driver_contact": {
        const orderId = stringArg(args, "_order_id");
        const [{ data: order, error: orderError }, deliveries, roleRows] = await Promise.all([
          firestoreAdmin.from("orders").select("patient_id, pharmacy_id").eq("id", orderId).maybeSingle(),
          rows(firestoreAdmin.from("deliveries").select("driver_id").eq("order_id", orderId)),
          rows(firestoreAdmin.from("user_roles").select("role").eq("user_id", context.userId)),
        ]);
        if (orderError) throw orderError;
        const isParticipant =
          order?.patient_id === context.userId || order?.pharmacy_id === context.userId ||
          (deliveries as Array<{ driver_id: string }>).some(({ driver_id }) => driver_id === context.userId);
        const isAdmin = (roleRows as Array<{ role: string }>).some(({ role }) => role === "admin");
        if (!isParticipant && !isAdmin) throw new Response("Not authorized.", { status: 403 });
        const driverId = (deliveries as Array<{ driver_id: string }>)[0]?.driver_id;
        if (!driverId) return [];
        const { data: profile, error } = await firestoreAdmin.from("profiles")
          .select("user_id, full_name, avatar_url, phone").eq("user_id", driverId).maybeSingle();
        if (error) throw error;
        return profile ? [profile] : [];
      }
      case "log_admin_action": {
        await requireAdmin(context.userId);
        const action = stringArg(args, "_action");
        const { data: profile, error: profileError } = await firestoreAdmin.from("profiles")
          .select("email").eq("user_id", context.userId).maybeSingle();
        if (profileError) throw profileError;
        const { data, error } = await firestoreAdmin.from("admin_audit_log").insert({
          admin_id: context.userId,
          admin_email: profile?.email ?? (context.claims.email as string | undefined) ?? null,
          action,
          target_type: typeof args._target_type === "string" ? args._target_type : null,
          target_id: typeof args._target_id === "string" ? args._target_id : null,
          payload: args._payload ?? {},
          created_at: now,
        }).select("id").single();
        if (error) throw error;
        return data?.id ?? null;
      }
      case "invite_admin": {
        await requireAdmin(context.userId);
        const email = stringArg(args, "_email").trim().toLowerCase();
        const note = typeof args._note === "string" ? args._note : null;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email.");
        const { data: profile, error: profileError } = await firestoreAdmin.from("profiles")
          .select("user_id, email").eq("email", email).maybeSingle();
        if (profileError) throw profileError;
        const callerProfile = await firestoreAdmin.from("profiles").select("email")
          .eq("user_id", context.userId).maybeSingle();
        if (callerProfile.error) throw callerProfile.error;
        const callerEmail = callerProfile.data?.email ?? (context.claims.email as string | undefined) ?? null;
        if (profile) {
          const { error } = await firestoreAdmin.from("user_roles").upsert({
            id: `${profile.user_id}_admin`, user_id: profile.user_id, role: "admin",
          }, { onConflict: "id" });
          if (error) throw error;
          await firestoreAdmin.from("admin_audit_log").insert({
            admin_id: context.userId, admin_email: callerEmail, action: "admin.grant_existing",
            target_type: "user", target_id: profile.user_id, payload: { email }, created_at: now,
          });
          return { ok: true, granted: true, user_id: profile.user_id };
        }
        const { error: inviteError } = await firestoreAdmin.from("admin_invites").upsert({
          id: email, email, invited_by: context.userId, invited_by_email: callerEmail,
          note, used_at: null, used_by: null, created_at: now,
        }, { onConflict: "email" });
        if (inviteError) throw inviteError;
        const { error: auditError } = await firestoreAdmin.from("admin_audit_log").insert({
          admin_id: context.userId, admin_email: callerEmail, action: "admin.invite",
          target_type: "email", target_id: email, payload: { email, note }, created_at: now,
        });
        if (auditError) throw auditError;
        return { ok: true, invited: true };
      }
    }
  });
