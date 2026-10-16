import { createHash } from "node:crypto";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";

export { mcpData, mcpOAuth } from "./mcp-oauth.js";

async function createHomecareNotification(
  userId: string,
  requestId: string,
  status: string,
  title: string,
  body: string,
  link: string,
) {
  if (!userId) return;
  const notificationId = createHash("sha256")
    .update(`${requestId}:${status}:${userId}`)
    .digest("hex");
  await db.collection("notifications").doc(notificationId).set({
    user_id: userId,
    category: "system",
    title,
    body,
    link,
    created_at: new Date().toISOString(),
    read: false,
  });
}

export const notifyHomecareWorkflowChanges = onDocumentUpdated(
  "homecare_requests/{requestId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const requestId = event.params.requestId;
    if (!before || !after || before.status === after.status) return;

    if (before.status === "pending_review" && after.status === "quote_pending") {
      await createHomecareNotification(
        String(after.patient_id ?? ""),
        requestId,
        "quote_pending",
        "Your home care quote is ready",
        "Review the quote and accept or decline it in your home care requests.",
        "/dashboard/patient/homecare",
      );
      return;
    }

    if (before.status === "quote_pending" && ["quote_accepted", "quote_declined"].includes(String(after.status))) {
      const operations = await db.collection("user_roles")
        .where("role", "in", ["admin", "homecare_operations"])
        .get();
      const status = String(after.status);
      const recipients = new Map<string, string>();
      for (const role of operations.docs) {
        const userId = String(role.get("user_id") ?? "");
        if (!userId) continue;
        const isAdminRole = role.get("role") === "admin";
        const existing = recipients.get(userId);
        if (!existing || isAdminRole) {
          recipients.set(userId, isAdminRole ? "/dashboard/admin/homecare" : "/dashboard/homecare_operations");
        }
      }
      await Promise.all([...recipients].map(([userId, link]) =>
        createHomecareNotification(
          userId,
          requestId,
          status,
          status === "quote_accepted" ? "Home care quote accepted" : "Home care quote declined",
          `A patient ${status === "quote_accepted" ? "accepted" : "declined"} the quote. Review the request in the operations workspace.`,
          link,
        ),
      ));
      return;
    }

    if (before.status === "quote_accepted" && after.status === "assigned") {
      const providerId = String(after.provider_id ?? "");
      const provider = providerId ? await db.collection("homecare_providers").doc(providerId).get() : null;
      const providerUserId = String(provider?.get("user_id") ?? "");
      await Promise.all([
        createHomecareNotification(
          String(after.patient_id ?? ""),
          requestId,
          "assigned",
          "Home care visit coordinated",
          "The coordinator recorded the approved provider and visit details. Review your home care request for the latest status.",
          "/dashboard/patient/homecare",
        ),
        createHomecareNotification(
          providerUserId,
          requestId,
          "assigned",
          "New home care assignment",
          "A home care visit has been coordinated. Open your provider dashboard to review the assignment.",
          "/dashboard/homecare_company",
        ),
      ]);
    }
  },
);

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);
const paystackSecret = defineSecret("PAYSTACK_SECRET_KEY");
const paymentWebhookSecret = defineSecret("PAYMENT_WEBHOOK_SECRET");
const BOOTSTRAP_ADMIN_EMAIL = "admin@healthreachcare.co.za";
const CAPE_TOWN_LAT = -33.9020;
const CAPE_TOWN_LNG = 18.4200;

class ActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Identity = { uid: string; email: string | null; emailVerified?: boolean };
type ActionArgs = Record<string, unknown>;

const DOCTOR_PLATFORM_FEE_CENTS = 1500;
const SLOT_CLAIM_COLLECTION = "doctor_slot_claims";

function stringArg(args: ActionArgs, key: string) {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new ActionError(`Missing or invalid "${key}".`);
  return value;
}

function integerArg(args: ActionArgs, key: string, fallback?: number, min = 1, max = 2_000_000) {
  const value = args[key] ?? fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ActionError(`Missing or invalid "${key}".`);
  }
  return value;
}

async function hasRole(uid: string, role: string) {
  const snapshot = await db.collection("user_roles").where("user_id", "==", uid).get();
  return snapshot.docs.some((document) => document.get("role") === role);
}

async function isAdmin(identity: Identity) {
  return identity.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL || hasRole(identity.uid, "admin");
}

async function requireRole(identity: Identity, role: string) {
  if (!(await hasRole(identity.uid, role))) {
    throw new ActionError(`${role} role required.`, 403);
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function asMillis(value: unknown) {
  if (typeof value !== "string") return 0;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function southAfricanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdays[values.weekday ?? ""] ?? -1,
  };
}

function slotClaimId(doctorId: string, scheduledAt: string) {
  return createHash("sha256").update(`${doctorId}:${scheduledAt}`).digest("hex");
}

function transactionQuery<T extends DocumentData>(
  transaction: Transaction,
  query: Query<T>,
) {
  return transaction.get(query);
}

async function verifiedPaystackTopUp(identity: Identity, reference: string, expectedCents: number) {
  const key = paystackSecret.value().trim();
  if (!key) throw new ActionError("Paystack is not configured.", 503);
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const payload = await response.json().catch(() => null) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      reference?: string;
      amount?: number;
      currency?: string;
      customer?: { email?: string };
    };
  } | null;
  if (!response.ok || !payload?.status || payload.data?.status !== "success") {
    throw new ActionError(payload?.message ?? "Paystack transaction could not be verified.", 402);
  }
  if (
    payload.data.reference !== reference
    || payload.data.amount !== expectedCents
    || payload.data.currency !== "ZAR"
  ) {
    throw new ActionError("Verified payment details do not match the wallet top-up.", 402);
  }
  const paymentEmail = payload.data.customer?.email?.trim().toLowerCase();
  if (!identity.email || !paymentEmail || paymentEmail !== identity.email.toLowerCase()) {
    throw new ActionError("The verified payment does not belong to this account.", 403);
  }
}

async function walletCredit(identity: Identity, args: ActionArgs) {
  const userId = stringArg(args, "_user_id");
  if (userId !== identity.uid) throw new ActionError("Cannot credit another user's wallet.", 403);
  const amountCents = integerArg(args, "_amount_cents");
  const reason = stringArg(args, "_reason");
  if (reason !== "topup") throw new ActionError("Unsupported wallet credit reason.", 400);
  const reference = stringArg(args, "_paystack_reference");
  const note = typeof args._note === "string" ? args._note : null;

  const previousTransactions = await db.collection("wallet_transactions")
    .where("paystack_reference", "==", reference)
    .limit(1)
    .get();
  if (!previousTransactions.empty) {
    if (previousTransactions.docs[0].get("user_id") !== userId) {
      throw new ActionError("Payment reference has already been used.", 409);
    }
    return { ok: true, duplicate: true };
  }

  await verifiedPaystackTopUp(identity, reference, amountCents);
  const wallets = db.collection("wallets");
  const transactions = db.collection("wallet_transactions");
  const referenceId = createHash("sha256").update(reference).digest("hex");
  const transactionRef = transactions.doc(`paystack_${referenceId}`);
  const existingTransactionQuery = transactions.where("paystack_reference", "==", reference).limit(1);
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const [walletSnapshot, duplicateSnapshot] = await Promise.all([
      transactionQuery(transaction, wallets.where("user_id", "==", userId)),
      transactionQuery(transaction, existingTransactionQuery),
    ]);
    if (!duplicateSnapshot.empty) return { ok: true, duplicate: true };
    if (walletSnapshot.size > 1) throw new ActionError("Multiple wallets are configured for this account.", 409);

    const walletRef = walletSnapshot.docs[0]?.ref ?? wallets.doc(userId);
    const current = Number(walletSnapshot.docs[0]?.get("balance_cents") ?? 0);
    const next = current + amountCents;
    if (!Number.isSafeInteger(next)) throw new ActionError("Wallet balance exceeds the supported range.", 409);
    transaction.set(walletRef, {
      user_id: userId,
      balance_cents: next,
      currency: walletSnapshot.docs[0]?.get("currency") ?? "ZAR",
      created_at: walletSnapshot.docs[0]?.get("created_at") ?? now,
      updated_at: now,
    }, { merge: true });
    transaction.create(transactionRef, {
      wallet_id: walletRef.id,
      user_id: userId,
      direction: "credit",
      amount_cents: amountCents,
      reason,
      order_id: typeof args._order_id === "string" ? args._order_id : null,
      paystack_reference: reference,
      balance_after_cents: next,
      note,
      created_at: now,
    });
    return {
      ok: true,
      transaction_id: transactionRef.id,
      balance_cents: next,
    };
  });
}

async function walletDebit(identity: Identity, args: ActionArgs) {
  const userId = stringArg(args, "_user_id");
  if (userId !== identity.uid) throw new ActionError("Cannot debit another user's wallet.", 403);
  const amountCents = integerArg(args, "_amount_cents", undefined, 1, Number.MAX_SAFE_INTEGER);
  const reason = stringArg(args, "_reason");
  if (reason !== "order_payment") throw new ActionError("Unsupported wallet debit reason.", 400);
  const orderId = typeof args._order_id === "string" ? args._order_id : null;
  const note = typeof args._note === "string" ? args._note : null;
  const walletQuery = db.collection("wallets").where("user_id", "==", userId);
  const orderRef = orderId ? db.collection("orders").doc(orderId) : null;
  const transactionRef = db.collection("wallet_transactions").doc();
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const walletSnapshot = await transactionQuery(transaction, walletQuery);
    const orderSnapshot = orderRef ? await transaction.get(orderRef) : null;
    if (walletSnapshot.size !== 1) throw new ActionError("Wallet not found.", 404);
    if (orderSnapshot && (!orderSnapshot.exists || orderSnapshot.get("patient_id") !== userId)) {
      throw new ActionError("Order not found for this account.", 403);
    }

    const wallet = walletSnapshot.docs[0];
    const balance = Number(wallet.get("balance_cents") ?? 0);
    if (balance < amountCents) throw new ActionError("Insufficient wallet balance.", 409);
    const next = balance - amountCents;
    transaction.update(wallet.ref, { balance_cents: next, updated_at: now });
    transaction.create(transactionRef, {
      wallet_id: wallet.id,
      user_id: userId,
      direction: "debit",
      amount_cents: amountCents,
      reason,
      order_id: orderId,
      paystack_reference: null,
      balance_after_cents: next,
      note,
      created_at: now,
    });
    return {
      ok: true,
      transaction_id: transactionRef.id,
      balance_cents: next,
    };
  });
}

async function completeMockPayment(identity: Identity, args: ActionArgs) {
  const paymentId = stringArg(args, "_payment_id");
  const outcome = stringArg(args, "_outcome");
  if (outcome !== "completed" && outcome !== "failed") {
    throw new ActionError("Invalid payment outcome.");
  }
  const paymentRef = db.collection("payments").doc(paymentId);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const paymentSnapshot = await transaction.get(paymentRef);
    if (!paymentSnapshot.exists || paymentSnapshot.get("patient_id") !== identity.uid) {
      throw new ActionError("Payment not found.", 404);
    }
    if (paymentSnapshot.get("status") !== "pending") {
      throw new ActionError("Payment is not pending.", 409);
    }
    const orderId = paymentSnapshot.get("order_id");
    const orderRef = typeof orderId === "string" ? db.collection("orders").doc(orderId) : null;
    const orderSnapshot = orderRef ? await transaction.get(orderRef) : null;
    if (!orderSnapshot?.exists || !orderRef) throw new ActionError("Order not found.", 404);
    const medicationId = orderSnapshot.get("medication_id");
    const medicationRef = typeof medicationId === "string" ? db.collection("medications").doc(medicationId) : null;
    const medicationSnapshot = medicationRef ? await transaction.get(medicationRef) : null;
    const pharmacyId = orderSnapshot.get("pharmacy_id");
    const pharmacySnapshot = typeof pharmacyId === "string"
      ? await transactionQuery(transaction, db.collection("profiles").where("user_id", "==", pharmacyId))
      : null;
    transaction.update(paymentRef, {
      status: outcome,
      updated_at: now,
      ...(outcome === "failed" ? { failure_reason: "Gateway declined card" } : {}),
    });
    if (outcome === "completed") {
      if (orderSnapshot.get("status") === "pending") {
        transaction.update(orderRef, { status: "preparing", updated_at: now });
      }
      const pharmacy = pharmacySnapshot?.docs[0]?.data() ?? {};
      transaction.create(db.collection("deliveries").doc(), {
        order_id: orderRef.id,
        status: "assigned",
        pickup_address: pharmacy.address || pharmacy.organization_name || "Pharmacy pickup point",
        delivery_address: orderSnapshot.get("delivery_address") ?? "",
        estimated_time: "30-45 minutes",
        created_at: now,
        updated_at: now,
      });
      if (medicationRef && medicationSnapshot?.exists) {
        const stock = medicationSnapshot.get("stock_quantity");
        if (typeof stock === "number") {
          const quantity = Number(orderSnapshot.get("quantity") ?? 1);
          transaction.update(medicationRef, { stock_quantity: Math.max(0, stock - quantity) });
        }
      }
    }
    transaction.create(db.collection("notifications").doc(), {
      user_id: identity.uid,
      category: "payment",
      title: `Payment ${outcome}`,
      body: outcome === "completed"
        ? `Payment of R ${paymentSnapshot.get("total_paid") ?? paymentSnapshot.get("amount") ?? 0} received.`
        : "Payment failed: Gateway declined card.",
      link: "/dashboard/patient#orders",
      created_at: now,
      read: false,
    });
    return { ok: true, status: outcome };
  });
}

type DriverOfferResult = {
  ok: boolean;
  inserted?: number;
  waiting?: boolean;
  assigned?: boolean;
  round?: number;
  reason?: string;
};

async function dispatchOrder(
  identity: Identity,
  orderId: string,
  maxDrivers: number,
  radiusKm: number,
  adminOverride = false,
): Promise<DriverOfferResult> {
  const orderRef = db.collection("orders").doc(orderId);
  const now = new Date();
  const nowIso = now.toISOString();
  const tenMinutesFromNow = new Date(now.getTime() + 10 * 60_000).toISOString();

  return db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) throw new ActionError("Order not found.", 404);
    const order = orderSnapshot.data() ?? {};
    const pharmacyId = typeof order.pharmacy_id === "string" ? order.pharmacy_id : null;
    if (!pharmacyId) throw new ActionError("Order has no pharmacy assigned.", 409);
    if (!adminOverride && pharmacyId !== identity.uid && !(await isAdmin(identity))) {
      throw new ActionError("Not authorized to dispatch this order.", 403);
    }
    if (["delivered", "cancelled", "out_for_delivery"].includes(String(order.status))) {
      return { ok: false, reason: "order_not_dispatchable" };
    }

    const [deliverySnapshot, offerSnapshot, onlineSnapshot, approvedSnapshot, roleSnapshot, documentsSnapshot, locationsSnapshot, activeDeliverySnapshot, pharmacySnapshot] = await Promise.all([
      transactionQuery(transaction, db.collection("deliveries").where("order_id", "==", orderId)),
      transactionQuery(transaction, db.collection("delivery_offers").where("order_id", "==", orderId)),
      transactionQuery(transaction, db.collection("driver_status").where("status", "==", "online")),
      transactionQuery(transaction, db.collection("profiles").where("approval_status", "==", "approved")),
      transactionQuery(transaction, db.collection("user_roles").where("role", "==", "driver")),
      transactionQuery(transaction, db.collection("driver_documents")),
      transactionQuery(transaction, db.collection("driver_locations")),
      transactionQuery(transaction, db.collection("deliveries").where("status", "in", ["assigned", "picked_up", "in_transit"])),
      transactionQuery(transaction, db.collection("profiles").where("user_id", "==", pharmacyId)),
    ]);
    const activeForOrder = deliverySnapshot.docs.some((document) => {
      const driverId = document.get("driver_id");
      return typeof driverId === "string"
        && ["assigned", "picked_up", "in_transit"].includes(String(document.get("status")));
    });
    if (activeForOrder) return { ok: true, assigned: true, inserted: 0 };

    const existingOffers = offerSnapshot.docs.map((document) => ({ ref: document.ref, data: document.data() }));
    const expiredOffers = existingOffers.filter(({ data }) =>
      data.status === "open" && asMillis(data.expires_at) <= now.getTime(),
    );
    for (const offer of expiredOffers) transaction.update(offer.ref, { status: "expired", updated_at: nowIso });
    if (existingOffers.some(({ data }) => data.status === "open" && asMillis(data.expires_at) > now.getTime())) {
      return { ok: true, waiting: true, inserted: 0 };
    }

    const pharmacy = pharmacySnapshot.docs[0]?.data() ?? {};
    const pickupLat = Number(order.pickup_lat ?? pharmacy.latitude ?? -33.9249);
    const pickupLng = Number(order.pickup_lng ?? pharmacy.longitude ?? 18.4241);
    const driverRoles = new Set(roleSnapshot.docs.map((document) => String(document.get("user_id"))));
    const approvedProfiles = new Map(
      approvedSnapshot.docs.map((document) => [String(document.get("user_id")), document.data()]),
    );
    const documentsByDriver = new Map<string, DocumentData[]>();
    for (const document of documentsSnapshot.docs) {
      const driverId = document.get("driver_id");
      if (typeof driverId === "string") {
        documentsByDriver.set(driverId, [...(documentsByDriver.get(driverId) ?? []), document.data()]);
      }
    }
    const locations = new Map(
      locationsSnapshot.docs.map((document) => [String(document.get("driver_id")), document.data()]),
    );
    const activeDrivers = new Set(
      activeDeliverySnapshot.docs.map((document) => document.get("driver_id")).filter((id): id is string => typeof id === "string"),
    );
    const eligibleStatuses = new Map(
      onlineSnapshot.docs.map((document) => [String(document.get("driver_id")), document.data()]),
    );
    const previousByDriver = new Map<string, DocumentData[]>();
    for (const { data } of existingOffers) {
      if (typeof data.target_driver_id === "string") {
        previousByDriver.set(data.target_driver_id, [...(previousByDriver.get(data.target_driver_id) ?? []), data]);
      }
    }

    const candidates = [...eligibleStatuses.entries()].flatMap(([driverId, status]) => {
      const profile = approvedProfiles.get(driverId);
      const driverDocs = documentsByDriver.get(driverId) ?? [];
      const hasDocuments = driverDocs.some((document) =>
        document.submitted_at
        && document.selfie_path
        && document.id_document_path
        && document.license_path,
      );
      const lastPing = asMillis(status.last_ping_at);
      if (
        !profile
        || !driverRoles.has(driverId)
        || !hasDocuments
        || !lastPing
        || now.getTime() - lastPing > 30 * 60_000
        || activeDrivers.has(driverId)
      ) return [];
      const previousOffers = previousByDriver.get(driverId) ?? [];
      const hasDeclinedOrAccepted = previousOffers.some((offer) =>
        ["accepted", "declined"].includes(String(offer.status))
        || ((offer.declined_by as string[] | undefined) ?? []).includes(driverId),
      );
      if (hasDeclinedOrAccepted) return [];
      const location = locations.get(driverId);
      const driverLat = Number(location?.lat ?? profile.latitude ?? CAPE_TOWN_LAT);
      const driverLng = Number(location?.lng ?? profile.longitude ?? CAPE_TOWN_LNG);
      const distance = haversineKm(pickupLat, pickupLng, driverLat, driverLng);
      const locationUpdated = asMillis(location?.updated_at ?? profile.updated_at ?? status.last_ping_at);
      return distance <= radiusKm ? [{ driverId, distance, locationUpdated }] : [];
    }).sort((first, second) =>
      first.distance - second.distance || second.locationUpdated - first.locationUpdated,
    ).slice(0, maxDrivers);

    const round = Math.max(0, ...existingOffers.map(({ data }) => Number(data.offer_round) || 0)) + 1;
    const medication = String(order.medication_name ?? "Delivery");
    const quantity = Number(order.quantity ?? 1);
    for (const candidate of candidates) {
      const offerRef = db.collection("delivery_offers").doc();
      const distance = Math.round(candidate.distance * 10) / 10;
      transaction.create(offerRef, {
        order_id: orderId,
        pharmacy_id: pharmacyId,
        target_driver_id: candidate.driverId,
        offer_round: round,
        distance_km: candidate.distance,
        message: `${medication} × ${quantity} · ${distance.toFixed(1)} km pickup`,
        expires_at: tenMinutesFromNow,
        status: "open",
        declined_by: [],
        accepted_by: null,
        is_demo: false,
        created_at: nowIso,
        updated_at: nowIso,
      });
      const notificationRef = db.collection("notifications").doc();
      transaction.create(notificationRef, {
        user_id: candidate.driverId,
        category: "delivery",
        title: "New delivery nearby",
        body: "A pharmacy broadcasted a delivery request. Open the driver dashboard to accept.",
        link: "/dashboard/driver#offers",
        created_at: nowIso,
        read: false,
      });
    }

    if (!deliverySnapshot.empty) {
      const delivery = deliverySnapshot.docs[0];
      transaction.update(delivery.ref, {
        pickup_address: delivery.get("pickup_address") || pharmacy.address || pharmacy.organization_name || "Pharmacy pickup point",
        delivery_address: delivery.get("delivery_address") || order.delivery_address || "",
        updated_at: nowIso,
      });
    } else {
      const deliveryRef = db.collection("deliveries").doc();
      transaction.create(deliveryRef, {
        order_id: orderId,
        driver_id: null,
        status: "assigned",
        pickup_address: pharmacy.address || pharmacy.organization_name || "Pharmacy pickup point",
        delivery_address: order.delivery_address ?? "",
        estimated_time: "30-45 minutes",
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
    if (order.status !== "delivered" && order.status !== "cancelled" && order.status !== "out_for_delivery") {
      transaction.update(orderRef, { status: "ready", updated_at: nowIso });
    }
    return { ok: true, inserted: candidates.length || 1, round };
  });
}

async function rebroadcastOrders(identity: Identity, args: ActionArgs) {
  const admin = await isAdmin(identity);
  const pharmacy = await hasRole(identity.uid, "pharmacy");
  if (!admin && !pharmacy) throw new ActionError("Pharmacy or admin role required.", 403);
  const maxOrders = integerArg(args, "_max_orders", 25, 1, 50);
  const maxDrivers = integerArg(args, "_max_drivers", 30, 1, 100);
  const radiusKm = integerArg(args, "_radius_km", 20, 1, 60);
  const orders = await db.collection("orders").where("status", "in", ["accepted", "preparing", "ready"]).get();
  const dispatchable = orders.docs
    .filter((order) =>
      typeof order.get("pharmacy_id") === "string"
      && (admin || order.get("pharmacy_id") === identity.uid),
    )
    .sort((first, second) => asMillis(first.get("updated_at")) - asMillis(second.get("updated_at")))
    .slice(0, maxOrders);
  let inserted = 0;
  let processed = 0;
  for (const order of dispatchable) {
    const result = await dispatchOrder(identity, order.id, maxDrivers, radiusKm, admin);
    processed += 1;
    inserted += result.inserted ?? 0;
  }
  return { ok: true, processed, inserted };
}

async function acceptDeliveryOffer(identity: Identity, offerId: string) {
  await requireRole(identity, "driver");
  const offerRef = db.collection("delivery_offers").doc(offerId);
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const offerSnapshot = await transaction.get(offerRef);
    if (!offerSnapshot.exists) throw new ActionError("Offer not found.", 404);
    const offer = offerSnapshot.data() ?? {};
    if (offer.status !== "open" || asMillis(offer.expires_at) <= Date.now()) {
      throw new ActionError("Offer is no longer available.", 409);
    }
    if (offer.target_driver_id && offer.target_driver_id !== identity.uid) {
      throw new ActionError("This offer is for another driver.", 403);
    }
    if (((offer.declined_by as string[] | undefined) ?? []).includes(identity.uid)) {
      throw new ActionError("Offer already declined.", 409);
    }

    const orderId = String(offer.order_id ?? "");
    const orderRef = db.collection("orders").doc(orderId);
    const [orderSnapshot, deliveriesSnapshot, siblingsSnapshot, pharmacySnapshot, driverLocationSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transactionQuery(transaction, db.collection("deliveries").where("order_id", "==", orderId)),
      transactionQuery(transaction, db.collection("delivery_offers").where("order_id", "==", orderId)),
      transactionQuery(transaction, db.collection("profiles").where("user_id", "==", String(offer.pharmacy_id))),
      transactionQuery(transaction, db.collection("driver_locations").where("driver_id", "==", identity.uid)),
    ]);
    if (!orderSnapshot.exists) throw new ActionError("Order not found.", 404);
    const existingDelivery = deliveriesSnapshot.docs.find((delivery) =>
      typeof delivery.get("driver_id") === "string"
      && ["assigned", "picked_up", "in_transit"].includes(String(delivery.get("status"))),
    );
    if (existingDelivery) throw new ActionError("Too late — another driver took it.", 409);
    if (deliveriesSnapshot.size > 1) throw new ActionError("Multiple deliveries exist for this order.", 409);
    const order = orderSnapshot.data() ?? {};
    const pharmacy = pharmacySnapshot.docs[0]?.data() ?? {};
    const pickupAddress = pharmacy.address || pharmacy.organization_name || "Pharmacy pickup point";

    transaction.update(offerRef, { status: "accepted", accepted_by: identity.uid, updated_at: now });
    for (const sibling of siblingsSnapshot.docs) {
      if (sibling.id !== offerId && sibling.get("status") === "open") {
        transaction.update(sibling.ref, { status: "expired", updated_at: now });
      }
    }
    const delivery = deliveriesSnapshot.docs[0];
    if (delivery) {
      transaction.update(delivery.ref, {
        driver_id: identity.uid,
        status: "assigned",
        pickup_address: delivery.get("pickup_address") || pickupAddress,
        delivery_address: delivery.get("delivery_address") || order.delivery_address || "",
        updated_at: now,
      });
    } else {
      const deliveryRef = db.collection("deliveries").doc();
      transaction.create(deliveryRef, {
        order_id: orderId,
        driver_id: identity.uid,
        status: "assigned",
        pickup_address: pickupAddress,
        delivery_address: order.delivery_address ?? "",
        estimated_time: "30-45 minutes",
        created_at: now,
        updated_at: now,
      });
    }
    for (const location of driverLocationSnapshot.docs) {
      transaction.update(location.ref, { order_id: orderId, updated_at: now });
    }
    if (!["delivered", "cancelled", "out_for_delivery"].includes(String(order.status))) {
      transaction.update(orderRef, { status: "ready", updated_at: now });
    }
    for (const [userId, title, body, link] of [
      [String(order.patient_id ?? ""), "Driver assigned", "A driver accepted your order and is heading to the pharmacy.", "/dashboard/patient#orders"],
      [String(offer.pharmacy_id ?? ""), "Driver assigned", `A driver accepted ${String(order.medication_name ?? "the order")}.`, "/dashboard/pharmacy#deliveries"],
    ]) {
      if (!userId) continue;
      transaction.create(db.collection("notifications").doc(), {
        user_id: userId, category: "delivery", title, body, link, created_at: now, read: false,
      });
    }
    return { ok: true, order_id: orderId };
  });
}

async function declineDeliveryOffer(identity: Identity, offerId: string) {
  await requireRole(identity, "driver");
  const offerRef = db.collection("delivery_offers").doc(offerId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(offerRef);
    if (!snapshot.exists) throw new ActionError("Offer not found.", 404);
    const offer = snapshot.data() ?? {};
    if (offer.target_driver_id && offer.target_driver_id !== identity.uid) {
      throw new ActionError("This offer is for another driver.", 403);
    }
    const declinedBy = (offer.declined_by as string[] | undefined) ?? [];
    transaction.update(offerRef, {
      declined_by: FieldValue.arrayUnion(identity.uid),
      ...(offer.target_driver_id === identity.uid ? { status: "declined" } : {}),
      updated_at: new Date().toISOString(),
    });
    return { ok: true, already_declined: declinedBy.includes(identity.uid) };
  });
}

async function availableDoctorSlots(identity: Identity, args: ActionArgs) {
  if (!identity.emailVerified) throw new ActionError("Verify your email before booking an appointment.", 403);
  const doctorId = stringArg(args, "_doctor_id");
  const doctorRef = db.collection("doctors").doc(doctorId);
  const [doctorSnapshot, availabilitySnapshot, claimsSnapshot, appointmentsSnapshot] = await Promise.all([
    doctorRef.get(),
    db.collection("doctor_availability").where("doctor_id", "==", doctorId).where("is_active", "==", true).get(),
    db.collection(SLOT_CLAIM_COLLECTION).where("doctor_id", "==", doctorId).get(),
    db.collection("doctor_appointments").where("doctor_id", "==", doctorId).get(),
  ]);
  if (!doctorSnapshot.exists) throw new ActionError("Doctor not found.", 404);
  const doctor = doctorSnapshot.data() ?? {};
  if (!doctor.is_active || !doctor.is_verified || doctor.is_demo) {
    throw new ActionError("This doctor is not currently accepting bookings.", 409);
  }

  const appointments = appointmentsSnapshot.docs
    .map((appointment) => appointment.data())
    .filter((appointment) => ["pending", "confirmed", "scheduled"].includes(String(appointment.status)));
  const activeAppointmentIds = new Set(
    appointmentsSnapshot.docs
      .filter((appointment) => ["pending", "confirmed", "scheduled"].includes(String(appointment.get("status"))))
      .map((appointment) => appointment.id),
  );
  const claimed = new Set(
    claimsSnapshot.docs
      .filter((claim) =>
        !["cancelled", "released"].includes(String(claim.get("status")))
        && activeAppointmentIds.has(String(claim.get("appointment_id"))),
      )
      .map((claim) => String(claim.get("scheduled_at") ?? "")),
  );
  const now = Date.now();
  const today = southAfricanDateParts(new Date(now));
  const windows = availabilitySnapshot.docs.map((snapshot) => snapshot.data());
  const slots: Array<{ scheduledAt: string; durationMinutes: number }> = [];

  for (let offset = 0; offset < 60; offset += 1) {
    const calendarDate = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = calendarDate.getUTCDay();
    for (const window of windows) {
      if (Number(window.day_of_week) !== weekday) continue;
      const startMinute = Math.round(Number(window.start_hour) * 60);
      const endMinute = Math.round(Number(window.end_hour) * 60);
      const durationMinutes = Number(window.slot_minutes);
      if (
        !Number.isSafeInteger(startMinute) ||
        !Number.isSafeInteger(endMinute) ||
        !Number.isSafeInteger(durationMinutes) ||
        startMinute < 0 ||
        endMinute > 24 * 60 ||
        durationMinutes < 30 ||
        durationMinutes > 120 ||
        durationMinutes % 30 !== 0
      ) continue;

      for (let minute = startMinute; minute + durationMinutes <= endMinute; minute += durationMinutes) {
        const localHour = Math.floor(minute / 60);
        const localMinute = minute % 60;
        const utcMillis = Date.UTC(
          calendarDate.getUTCFullYear(),
          calendarDate.getUTCMonth(),
          calendarDate.getUTCDate(),
          localHour - 2,
          localMinute,
        );
        if (utcMillis <= now) continue;
        const scheduledAt = new Date(utcMillis).toISOString();
        const endAt = utcMillis + durationMinutes * 60_000;
        const isClaimed = Array.from({ length: durationMinutes / 30 }, (_, index) => {
          const bucket = new Date(utcMillis + index * 30 * 60_000).toISOString();
          return claimed.has(bucket);
        }).some(Boolean);
        const overlapsAppointment = appointments.some((appointment) => {
          const appointmentStart = asMillis(appointment.scheduled_at);
          const appointmentDuration = Math.max(30, Number(appointment.duration_minutes) || 30) * 60_000;
          return appointmentStart < endAt && appointmentStart + appointmentDuration > utcMillis;
        });
        if (!isClaimed && !overlapsAppointment) slots.push({ scheduledAt, durationMinutes });
      }
    }
  }

  return { slots: slots.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) };
}

async function bookDoctorAppointment(identity: Identity, args: ActionArgs) {
  if (!identity.emailVerified) throw new ActionError("Verify your email before booking an appointment.", 403);
  const doctorId = stringArg(args, "_doctor_id");
  const scheduledAt = stringArg(args, "_scheduled_at");
  const mode = stringArg(args, "_mode");
  const slotMinutes = integerArg(args, "_duration_minutes", 30, 30, 120);
  if (slotMinutes % 30 !== 0) throw new ActionError("Choose a valid appointment duration.");
  const reason = typeof args._reason === "string" ? args._reason : "";
  if (!["in_person", "video", "phone"].includes(mode)) throw new ActionError("Invalid consultation type.");
  const scheduledMillis = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduledMillis) || scheduledMillis < Date.now() + 60_000 || scheduledMillis > Date.now() + 60 * 86_400_000) {
    throw new ActionError("Choose an available appointment time within the next 60 days.");
  }

  const doctorRef = db.collection("doctors").doc(doctorId);
  const availabilityQuery = db.collection("doctor_availability")
    .where("doctor_id", "==", doctorId)
    .where("is_active", "==", true);
  const appointmentsQuery = db.collection("doctor_appointments").where("doctor_id", "==", doctorId);
  const appointmentRef = db.collection("doctor_appointments").doc();
  const appointmentDate = new Date(scheduledMillis);
  const localDate = southAfricanDateParts(appointmentDate);
  const localHours = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(appointmentDate);
  const timeParts = Object.fromEntries(localHours.map((part) => [part.type, part.value]));
  const localMinuteOfDay = Number(timeParts.hour) * 60 + Number(timeParts.minute);
  if (appointmentDate.getUTCSeconds() !== 0 || appointmentDate.getUTCMilliseconds() !== 0) {
    throw new ActionError("Choose a time on an available appointment slot.");
  }

  const slotClaims = Array.from({ length: slotMinutes / 30 }, (_, index) => {
    const instant = new Date(scheduledMillis + index * 30 * 60_000).toISOString();
    return { instant, ref: db.collection(SLOT_CLAIM_COLLECTION).doc(slotClaimId(doctorId, instant)) };
  });

  const result = await db.runTransaction(async (transaction) => {
    const [doctorSnapshot, availabilitySnapshot, appointmentsSnapshot, ...claimSnapshots] = await Promise.all([
      transaction.get(doctorRef),
      transactionQuery(transaction, availabilityQuery),
      transactionQuery(transaction, appointmentsQuery),
      ...slotClaims.map(({ ref }) => transaction.get(ref)),
    ]);
    if (!doctorSnapshot.exists) throw new ActionError("Doctor not found.", 404);
    const doctor = doctorSnapshot.data() ?? {};
    if (!doctor.is_active || !doctor.is_verified || doctor.is_demo) {
      throw new ActionError("This doctor is not currently accepting bookings.", 409);
    }
    const modeAvailable = mode === "in_person" ? doctor.in_person_available
      : mode === "video" ? doctor.online_available
        : doctor.phone_available;
    if (!modeAvailable) throw new ActionError("This consultation type is not currently available.", 409);

    const validWindow = availabilitySnapshot.docs.some((snapshot) => {
      const window = snapshot.data();
      const startMinute = Number(window.start_hour) * 60;
      const endMinute = Number(window.end_hour) * 60;
      const configuredSlot = Number(window.slot_minutes);
      return Number(window.day_of_week) === localDate.weekday
        && Number.isInteger(configuredSlot)
        && configuredSlot === slotMinutes
        && localMinuteOfDay >= startMinute
        && localMinuteOfDay + slotMinutes <= endMinute
        && (localMinuteOfDay - startMinute) % configuredSlot === 0;
    });
    if (!validWindow) throw new ActionError("That time is outside the doctor's published availability.", 409);
    const activeAppointmentIds = new Set(
      appointmentsSnapshot.docs
        .filter((snapshot) => ["pending", "confirmed", "scheduled"].includes(String(snapshot.get("status"))))
        .map((snapshot) => snapshot.id),
    );
    const slotAlreadyClaimed = claimSnapshots.some((snapshot) => {
      if (!snapshot.exists) return false;
      const appointmentId = snapshot.get("appointment_id");
      return typeof appointmentId !== "string" || activeAppointmentIds.has(appointmentId);
    });
    if (slotAlreadyClaimed) {
      throw new ActionError("That appointment slot has just been booked. Please choose another time.", 409);
    }
    const overlapsAppointment = appointmentsSnapshot.docs.some((snapshot) => {
      const appointment = snapshot.data();
      if (!["pending", "confirmed", "scheduled"].includes(String(appointment.status))) return false;
      const start = asMillis(appointment.scheduled_at);
      const duration = Math.max(slotMinutes, Number(appointment.duration_minutes) || slotMinutes) * 60_000;
      return start < scheduledMillis + slotMinutes * 60_000 && start + duration > scheduledMillis;
    });
    if (overlapsAppointment) throw new ActionError("That appointment slot is no longer available.", 409);

    const now = new Date().toISOString();
    const fee = Number(doctor.consultation_fee);
    if (!Number.isFinite(fee) || fee < 0) throw new ActionError("This doctor does not have a valid consultation fee.", 409);
    const hospitalId = String(doctor.hospital_id ?? doctor.user_id ?? identity.uid);
    const appointment = {
      id: appointmentRef.id,
      patient_id: identity.uid,
      doctor_id: doctorId,
      hospital_id: hospitalId,
      scheduled_at: new Date(scheduledMillis).toISOString(),
      duration_minutes: slotMinutes,
      mode,
      reason,
      consultation_fee: fee,
      platform_fee: DOCTOR_PLATFORM_FEE_CENTS / 100,
      status: "pending",
      payment_status: "pending",
      total_paid: 0,
      payment_reference: null,
      slot_claim_ids: slotClaims.map(({ ref }) => ref.id),
      created_at: now,
      updated_at: now,
    };
    transaction.create(appointmentRef, appointment);
    slotClaims.forEach(({ ref, instant }) => transaction.set(ref, {
      doctor_id: doctorId,
      appointment_id: appointmentRef.id,
      patient_id: identity.uid,
      scheduled_at: instant,
      status: "reserved",
      created_at: now,
    }));
    return { appointmentId: appointmentRef.id, platformFeeCents: DOCTOR_PLATFORM_FEE_CENTS };
  });

  return result;
}

async function requireHomecareOperations(identity: Identity) {
  if (!identity.emailVerified) throw new ActionError("Verify your email before coordinating home care.", 403);
  if (!(await isAdmin(identity)) && !(await hasRole(identity.uid, "homecare_operations"))) {
    throw new ActionError("Home care operations role required.", 403);
  }
}

async function issueHomecareQuote(identity: Identity, args: ActionArgs) {
  await requireHomecareOperations(identity);
  const requestId = stringArg(args, "_request_id");
  const amount = args._amount;
  const details = stringArg(args, "_details").trim();
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    throw new ActionError("Enter a valid quote amount.");
  }
  if (details.length < 3 || details.length > 2000) throw new ActionError("Add the quote scope and conditions.");

  const requestRef = db.collection("homecare_requests").doc(requestId);
  const auditRef = db.collection("admin_audit_log").doc();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new ActionError("Home care request not found.", 404);
    const request = requestSnapshot.data() ?? {};
    if (request.status !== "pending_review") {
      throw new ActionError("This request is no longer awaiting a quote.", 409);
    }
    transaction.update(requestRef, {
      quote_amount: amount,
      quote_currency: "ZAR",
      quote_details: details,
      quote_issued_at: now,
      status: "quote_pending",
      updated_at: now,
    });
    transaction.create(auditRef, {
      admin_id: identity.uid,
      action: "homecare.operations.quote_issued",
      target_type: "homecare_request",
      target_id: requestId,
      payload: { amount, currency: "ZAR" },
      created_at: now,
    });
  });
  return { ok: true };
}

async function respondToHomecareQuote(identity: Identity, args: ActionArgs) {
  if (!identity.emailVerified) throw new ActionError("Verify your email before responding to a quote.", 403);
  const requestId = stringArg(args, "_request_id");
  const response = stringArg(args, "_response");
  if (!["accept", "decline"].includes(response)) throw new ActionError("Invalid quote response.");
  const requestRef = db.collection("homecare_requests").doc(requestId);
  const now = new Date().toISOString();
  const status = response === "accept" ? "quote_accepted" : "quote_declined";
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists) throw new ActionError("Home care request not found.", 404);
    const request = snapshot.data() ?? {};
    if (request.patient_id !== identity.uid) throw new ActionError("Home care request not found.", 404);
    if (request.status !== "quote_pending") throw new ActionError("This quote is no longer awaiting your response.", 409);
    transaction.update(requestRef, { status, quote_responded_at: now, updated_at: now });
  });
  return { status };
}

async function coordinateHomecareRequest(identity: Identity, args: ActionArgs) {
  await requireHomecareOperations(identity);
  const requestId = stringArg(args, "_request_id");
  const providerId = stringArg(args, "_provider_id");
  const scheduledAt = typeof args._scheduled_at === "string" ? args._scheduled_at : null;
  const scheduledMillis = scheduledAt ? Date.parse(scheduledAt) : null;
  if (scheduledAt && (scheduledMillis === null || !Number.isFinite(scheduledMillis) || scheduledMillis <= Date.now())) {
    throw new ActionError("Choose a future visit time.");
  }

  const requestRef = db.collection("homecare_requests").doc(requestId);
  const providerRef = db.collection("homecare_providers").doc(providerId);
  const assignmentRef = db.collection("homecare_assignments").doc(`${requestId}_coordination`);
  const priorAssignmentsQuery = db.collection("homecare_assignments").where("request_id", "==", requestId);
  const auditRef = db.collection("admin_audit_log").doc();
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, providerSnapshot, existingAssignment, priorAssignments] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(providerRef),
      transaction.get(assignmentRef),
      transactionQuery(transaction, priorAssignmentsQuery),
    ]);
    if (!requestSnapshot.exists) throw new ActionError("Home care request not found.", 404);
    if (!providerSnapshot.exists) throw new ActionError("Provider not found.", 404);
    const request = requestSnapshot.data() ?? {};
    const provider = providerSnapshot.data() ?? {};
    if (request.status !== "quote_accepted" || typeof request.quote_amount !== "number") {
      throw new ActionError("Only a patient-accepted quote can proceed to provider coordination.", 409);
    }
    if (existingAssignment.exists || !priorAssignments.empty) {
      throw new ActionError("A provider has already been assigned to this request.", 409);
    }
    if (provider.approval_status !== "approved" || provider.is_active !== true) {
      throw new ActionError("Only an approved, active provider can receive an assignment.", 409);
    }

    const assignment = {
      id: assignmentRef.id,
      request_id: requestId,
      provider_id: providerId,
      status: "offered",
      scheduled_at: scheduledAt,
      amount: request.quote_amount,
      assigned_by: identity.uid,
      created_at: now,
      updated_at: now,
    };
    transaction.create(assignmentRef, assignment);
    transaction.update(requestRef, {
      provider_id: providerId,
      status: "assigned",
      updated_at: now,
    });
    transaction.create(auditRef, {
      admin_id: identity.uid,
      action: "homecare.operations.provider_coordinated",
      target_type: "homecare_request",
      target_id: requestId,
      payload: { provider_id: providerId, assignment_id: assignmentRef.id },
      created_at: now,
    });
    return { ok: true, assignmentId: assignmentRef.id };
  });
}

async function runAction(identity: Identity, name: string, args: ActionArgs) {
  switch (name) {
    case "available_doctor_slots":
      return availableDoctorSlots(identity, args);
    case "book_doctor_appointment":
      return bookDoctorAppointment(identity, args);
    case "issue_homecare_quote":
      return issueHomecareQuote(identity, args);
    case "respond_homecare_quote":
      return respondToHomecareQuote(identity, args);
    case "coordinate_homecare_request":
      return coordinateHomecareRequest(identity, args);
    case "wallet_credit":
      return walletCredit(identity, args);
    case "wallet_debit":
      return walletDebit(identity, args);
    case "complete_mock_payment":
      return completeMockPayment(identity, args);
    case "dispatch_ready_order_to_drivers": {
      const orderId = stringArg(args, "_order_id");
      if (!(await isAdmin(identity))) {
        const roles = await db.collection("user_roles").where("user_id", "==", identity.uid).get();
        if (!roles.docs.some((role) => role.get("role") === "pharmacy")) {
          throw new ActionError("Pharmacy or admin role required.", 403);
        }
      }
      return dispatchOrder(
        identity,
        orderId,
        integerArg(args, "_max_drivers", 30, 1, 100),
        integerArg(args, "_radius_km", 20, 1, 60),
      );
    }
    case "rebroadcast_unaccepted_delivery_orders":
      return rebroadcastOrders(identity, args);
    case "accept_delivery_offer_for_driver":
      return acceptDeliveryOffer(identity, stringArg(args, "_offer_id"));
    case "decline_delivery_offer_for_driver":
      return declineDeliveryOffer(identity, stringArg(args, "_offer_id"));
    default:
      throw new ActionError(`Unknown privileged Firebase action "${name}".`, 404);
  }
}

export const privilegedFirestoreAction = onRequest(
  { region: "us-central1", timeoutSeconds: 120, memory: "512MiB", secrets: [paystackSecret] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ error: { message: "POST is required." } });
      return;
    }
    const authorization = request.get("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ error: { message: "A Firebase ID token is required." } });
      return;
    }

    try {
      const decoded = await getAuth(app).verifyIdToken(token, true);
      const body = request.body as { name?: unknown; args?: unknown } | null;
      if (typeof body?.name !== "string" || !body.name) throw new ActionError("An action name is required.");
      const args = body.args && typeof body.args === "object" && !Array.isArray(body.args)
        ? body.args as ActionArgs
        : {};
      const data = await runAction({
        uid: decoded.uid,
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified === true,
      }, body.name, args);
      response.status(200).json({ data });
    } catch (error) {
      if (error instanceof ActionError) {
        response.status(error.status).json({ error: { message: error.message } });
        return;
      }
      if (error instanceof Error && error.name === "FirebaseAuthError") {
        response.status(401).json({ error: { message: "Firebase ID token is invalid or expired." } });
        return;
      }
      console.error("Privileged Firebase action failed.", error);
      response.status(500).json({ error: { message: "Privileged Firebase action failed." } });
    }
  },
);

export const paymentProviderWebhook = onRequest(
  { region: "us-central1", secrets: [paymentWebhookSecret] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("POST is required.");
      return;
    }
    const secret = paymentWebhookSecret.value().trim();
    if (!secret) {
      response.status(500).send("Webhook secret is not configured.");
      return;
    }
    const signature = request.get("x-webhook-signature") ?? "";
    const expected = createHmac("sha256", secret).update(request.rawBody).digest();
    const received = Buffer.from(signature);
    const expectedHex = Buffer.from(expected.toString("hex"));
    if (received.length !== expectedHex.length || !timingSafeEqual(received, expectedHex)) {
      response.status(401).send("Invalid signature.");
      return;
    }

    const payload = request.body as {
      transaction_ref?: unknown;
      status?: unknown;
      failure_reason?: unknown;
      refund_amount?: unknown;
      provider?: unknown;
    } | null;
    if (
      typeof payload?.transaction_ref !== "string"
      || payload.transaction_ref.length < 1
      || payload.transaction_ref.length > 128
      || !["completed", "failed", "refunded"].includes(String(payload.status))
      || payload.failure_reason !== undefined
        && (typeof payload.failure_reason !== "string" || payload.failure_reason.length > 500)
      || payload.refund_amount !== undefined
        && (typeof payload.refund_amount !== "number" || !Number.isFinite(payload.refund_amount) || payload.refund_amount < 0)
      || payload.provider !== undefined
        && (typeof payload.provider !== "string" || payload.provider.length > 64)
    ) {
      response.status(400).send("Invalid payload.");
      return;
    }

    try {
      const paymentQuery = db.collection("payments")
        .where("transaction_ref", "==", payload.transaction_ref)
        .limit(1);
      const result = await db.runTransaction(async (transaction) => {
        const payments = await transactionQuery(transaction, paymentQuery);
        const payment = payments.docs[0];
        if (!payment) throw new ActionError("Payment not found.", 404);
        const orderId = payment.get("order_id");
        const orderRef = typeof orderId === "string" ? db.collection("orders").doc(orderId) : null;
        const order = orderRef ? await transaction.get(orderRef) : null;
        const now = new Date().toISOString();
        const status = payload.status as "completed" | "failed" | "refunded";
        const previousStatus = payment.get("status");
        const patch: DocumentData = { status, updated_at: now };
        if (status === "failed") {
          patch.failure_reason = payload.failure_reason ?? "Provider declined";
          patch.retry_count = Number(payment.get("retry_count") ?? 0) + 1;
        }
        if (status === "refunded") {
          patch.refund_status = "refunded";
          patch.refund_amount = payload.refund_amount ?? 0;
        }
        if (typeof payload.provider === "string") patch.provider = payload.provider;
        transaction.update(payment.ref, patch);
        if (status === "completed" && previousStatus !== "completed" && orderRef && order?.exists && order.get("status") === "pending") {
          transaction.update(orderRef, { status: "preparing", updated_at: now });
        }
        if (status !== previousStatus) {
          const amount = payment.get("total_paid") ?? payment.get("amount") ?? 0;
          const body = status === "completed"
            ? `Payment of R ${amount} received.`
            : status === "failed"
              ? `Payment failed: ${String(payload.failure_reason ?? "please retry")}.`
              : `Refund of R ${Number(payload.refund_amount ?? 0)} processed.`;
          transaction.create(db.collection("notifications").doc(), {
            user_id: payment.get("patient_id"),
            category: "payment",
            title: `Payment ${status}`,
            body,
            link: "/dashboard/patient#orders",
            created_at: now,
            read: false,
          });
        }
        return { ok: true };
      });
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof ActionError) {
        response.status(error.status).send(error.message);
        return;
      }
      console.error("Payment webhook processing failed.", error);
      response.status(500).send("Payment webhook processing failed.");
    }
  },
);
