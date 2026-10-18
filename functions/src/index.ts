import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
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
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

export { mcpData, mcpOAuth } from "./mcp-oauth.js";

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);
const paystackSecret = defineSecret("PAYSTACK_SECRET_KEY");
const paymentWebhookSecret = defineSecret("PAYMENT_WEBHOOK_SECRET");
const adminInviteCode = defineSecret("ADMIN_INVITE_CODE");
const BOOTSTRAP_ADMIN_EMAIL = "admin@healthreachcare.co.za";
const CAPE_TOWN_LAT = -33.9020;
const CAPE_TOWN_LNG = 18.4200;
const SELF_SERVICE_ROLES = [
  "patient", "pharmacy", "hospital", "driver", "doctor", "homecare_company",
] as const;
const PROVIDER_REGISTRATION_COLLECTIONS: Record<string, string> = {
  pharmacy: "pharmacies",
  doctor: "doctors",
  driver: "drivers",
  homecare_company: "homecare_providers",
};

class ActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Identity = { uid: string; email: string | null; emailVerified: boolean };
type ActionArgs = Record<string, unknown>;

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

function transactionQuery<T extends DocumentData>(
  transaction: Transaction,
  query: Query<T>,
) {
  return transaction.get(query);
}

type MedicationRecord = DocumentData & {
  pharmacy_id?: unknown;
  name?: unknown;
  price?: unknown;
  stock_quantity?: unknown;
  publish_requested?: unknown;
  is_active?: unknown;
  is_demo?: unknown;
  expiry_date?: unknown;
};

function expiryMillis(value: unknown): number | null {
  if (value == null || value === "") return null;
  const millis = typeof value === "string"
    ? new Date(value).getTime()
    : value instanceof Date
      ? value.getTime()
      : typeof value === "object"
        && "toDate" in value
        && typeof value.toDate === "function"
        ? value.toDate().getTime()
        : Number.NaN;
  return millis;
}

function isPublishableMedication(medication: MedicationRecord) {
  if (
    medication.publish_requested !== true
    || medication.is_active !== true
    || medication.is_demo !== false
    || typeof medication.name !== "string"
    || !medication.name.trim()
    || typeof medication.price !== "number"
    || !Number.isFinite(medication.price)
    || typeof medication.stock_quantity !== "number"
    || !Number.isSafeInteger(medication.stock_quantity)
    || medication.stock_quantity <= 0
  ) return false;
  const expiresAt = expiryMillis(medication.expiry_date);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt < Date.now())) return false;
  return true;
}

async function syncPublicMedication(
  medicationId: string,
) {
  const medicationRef = db.collection("medications").doc(medicationId);
  const publicRef = db.collection("medications_public").doc(medicationId);
  await db.runTransaction(async (transaction) => {
    const medicationSnapshot = await transaction.get(medicationRef);
    const medication = medicationSnapshot.exists
      ? medicationSnapshot.data() as MedicationRecord
      : null;
    const pharmacyId = typeof medication?.pharmacy_id === "string" ? medication.pharmacy_id : null;
    if (!medication || !pharmacyId || !isPublishableMedication(medication)) {
      transaction.delete(publicRef);
      return;
    }

    const [role, profile, pharmacy, branches] = await Promise.all([
      transaction.get(db.collection("user_roles").doc(`${pharmacyId}_pharmacy`)),
      transaction.get(db.collection("profiles").doc(pharmacyId)),
      transaction.get(db.collection("pharmacies").doc(pharmacyId)),
      transaction.get(db.collection("pharmacy_branches")
        .where("pharmacy_id", "==", pharmacyId)
        .where("is_primary", "==", true)
        .where("is_active", "==", true)),
    ]);
    const profileData = profile.data() ?? {};
    const pharmacyData = pharmacy.data() ?? {};
    const branchSnapshot = branches.docs[0];
    const branch = branchSnapshot?.data();
    if (
      role.get("role") !== "pharmacy"
      || profileData.approval_status !== "approved"
      || pharmacyData.status !== "approved"
      || !branch
    ) {
      transaction.delete(publicRef);
      return;
    }

    const expiresAt = expiryMillis(medication.expiry_date);
    transaction.set(publicRef, {
      pharmacy_id: pharmacyId,
      name: medication.name,
      price: medication.price,
      stock_quantity: medication.stock_quantity,
      requires_prescription: medication.requires_prescription === true,
      image_url: typeof medication.image_url === "string" ? medication.image_url : null,
      description: typeof medication.description === "string" ? medication.description : null,
      category: typeof medication.category === "string" ? medication.category : null,
      expiry_date: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      is_active: true,
      is_demo: false,
      pharmacy_name: String(
        profileData.organization_name
        || profileData.full_name
        || pharmacyData.organization_name
        || pharmacyData.full_name
        || branch.name
        || "Pharmacy",
      ),
      pharmacy_address: String(branch.address ?? ""),
      pharmacy_phone: String(profileData.phone || branch.phone || ""),
      latitude: typeof branch.latitude === "number" ? branch.latitude : null,
      longitude: typeof branch.longitude === "number" ? branch.longitude : null,
      branch_id: branchSnapshot.id,
      updated_at: new Date().toISOString(),
    });
  });
}

async function refreshPharmacyCatalog(pharmacyId: string) {
  if (!pharmacyId) return;
  const [medications, publicMedications] = await Promise.all([
    db.collection("medications").where("pharmacy_id", "==", pharmacyId).get(),
    db.collection("medications_public").where("pharmacy_id", "==", pharmacyId).get(),
  ]);
  const currentIds = new Set(medications.docs.map((document) => document.id));
  await Promise.all(medications.docs.map((document) => syncPublicMedication(document.id)));
  await Promise.all(publicMedications.docs
    .filter((document) => !currentIds.has(document.id))
    .map((document) => syncPublicMedication(document.id)));
}

export const publishMedicationToPatientCatalog = onDocumentWritten(
  "medications/{medicationId}",
  async (event) => {
    const medicationId = event.params.medicationId;
    const before = event.data?.before.exists ? event.data.before.data() as MedicationRecord : null;
    const after = event.data?.after.exists ? event.data.after.data() as MedicationRecord : null;
    await syncPublicMedication(medicationId);
    if (before?.pharmacy_id && before.pharmacy_id !== after?.pharmacy_id) {
      await refreshPharmacyCatalog(String(before.pharmacy_id));
    }
  },
);

export const refreshMedicationCatalogOnPharmacyChange = onDocumentWritten(
  "profiles/{pharmacyId}",
  async (event) => refreshPharmacyCatalog(event.params.pharmacyId),
);

export const refreshMedicationCatalogOnApprovalChange = onDocumentWritten(
  "pharmacies/{pharmacyId}",
  async (event) => refreshPharmacyCatalog(event.params.pharmacyId),
);

export const refreshMedicationCatalogOnBranchChange = onDocumentWritten(
  "pharmacy_branches/{branchId}",
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.get("pharmacy_id") : null;
    const after = event.data?.after.exists ? event.data.after.get("pharmacy_id") : null;
    const pharmacyIds = new Set([before, after].filter((id): id is string => typeof id === "string"));
    await Promise.all(Array.from(pharmacyIds, refreshPharmacyCatalog));
  },
);

export const refreshMedicationCatalogOnRoleChange = onDocumentWritten(
  "user_roles/{roleId}",
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.get("user_id") : null;
    const after = event.data?.after.exists ? event.data.after.get("user_id") : null;
    const userIds = new Set([before, after].filter((id): id is string => typeof id === "string"));
    await Promise.all(Array.from(userIds, refreshPharmacyCatalog));
  },
);

export const removeExpiredPublicMedications = onSchedule("every 60 minutes", async () => {
  const now = new Date().toISOString();
  while (true) {
    const expired = await db.collection("medications_public")
      .where("expiry_date", "<=", now)
      .limit(300)
      .get();
    if (expired.empty) return;
    await Promise.all(expired.docs.map((document) => syncPublicMedication(document.id)));
    if (expired.size < 300) return;
  }
});

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
    const orderGroupRef = typeof order.order_group_id === "string"
      ? db.collection("order_groups").doc(order.order_group_id)
      : null;
    const orderGroupSnapshot = orderGroupRef ? await transaction.get(orderGroupRef) : null;

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
    transaction.update(orderRef, {
      driver_id: identity.uid,
      ...(!["delivered", "cancelled", "out_for_delivery"].includes(String(order.status)) ? { status: "ready" } : {}),
      updated_at: now,
    });
    if (orderGroupRef && orderGroupSnapshot?.exists) {
      transaction.update(orderGroupRef, { driver_id: identity.uid, updated_at: now });
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

async function registerSelfServiceRole(identity: Identity, args: ActionArgs) {
  const role = stringArg(args, "_role");
  if (role === "admin") {
    if (identity.email?.toLowerCase() !== BOOTSTRAP_ADMIN_EMAIL) {
      throw new ActionError("Admin role assignment is restricted to the bootstrap administrator.", 403);
    }
  } else if (!(SELF_SERVICE_ROLES as readonly string[]).includes(role)) {
    throw new ActionError("Unsupported signup role.", 400);
  }

  const roleRef = db.collection("user_roles").doc(`${identity.uid}_${role}`);
  const userRoles = db.collection("user_roles").where("user_id", "==", identity.uid);
  return db.runTransaction(async (transaction) => {
    const [roleSnapshot, existingRoles] = await Promise.all([
      transaction.get(roleRef),
      transactionQuery(transaction, userRoles),
    ]);
    if (existingRoles.docs.some((document) => document.get("role") !== role)) {
      throw new ActionError("This account already has a different role.", 409);
    }
    if (roleSnapshot.exists) return { ok: true, role };
    if (role !== "patient" && role !== "admin") {
      const profileSnapshot = await transaction.get(db.collection("profiles").doc(identity.uid));
      const profile = profileSnapshot.data() ?? {};
      if (
        !profileSnapshot.exists
        || profile.user_id !== identity.uid
        || !["pending", "under_review"].includes(String(profile.approval_status))
      ) {
        throw new ActionError("A pending provider application is required for this role.", 403);
      }
      const providerCollection = PROVIDER_REGISTRATION_COLLECTIONS[role];
      if (providerCollection) {
        const providerSnapshot = await transaction.get(db.collection(providerCollection).doc(identity.uid));
        const provider = providerSnapshot.data() ?? {};
        if (
          !providerSnapshot.exists
          || provider.user_id !== identity.uid
          || provider.status !== "pending_review"
        ) {
          throw new ActionError("A matching pending provider application is required.", 403);
        }
      } else if (role === "hospital" && typeof profile.organization_name !== "string") {
        throw new ActionError("A hospital application with an organization name is required.", 403);
      }
    }
    transaction.create(roleRef, {
      id: roleRef.id,
      user_id: identity.uid,
      role,
      created_at: new Date().toISOString(),
    });
    return { ok: true, role };
  });
}

async function requireHomecareOperations(identity: Identity) {
  if (!(await isAdmin(identity)) && !(await hasRole(identity.uid, "homecare_operations"))) {
    throw new ActionError("Home care operations role required.", 403);
  }
}

async function createHomecareRequest(identity: Identity, args: ActionArgs) {
  await requireRole(identity, "patient");
  if (!identity.emailVerified) {
    throw new ActionError("Verify your email before requesting home care.", 403);
  }

  const serviceType = stringArg(args, "_service_type").trim();
  const address = stringArg(args, "_address").trim();
  if (typeof args._description !== "string") {
    throw new ActionError("Home care instructions must be text.");
  }
  const description = args._description.trim();
  const latitude = args._latitude;
  const longitude = args._longitude;
  const preferredAt = args._preferred_at;
  const durationHours = args._duration_hours;

  if (serviceType.length < 2 || serviceType.length > 120) {
    throw new ActionError("Choose a valid home care service.");
  }
  if (address.length < 5 || address.length > 500) {
    throw new ActionError("Choose a valid service address.");
  }
  if (description.length > 5_000) {
    throw new ActionError("Home care instructions must be 5000 characters or fewer.");
  }
  if (
    latitude !== null
    && (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)
  ) {
    throw new ActionError("Choose a valid latitude for the service address.");
  }
  if (
    longitude !== null
    && (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  ) {
    throw new ActionError("Choose a valid longitude for the service address.");
  }
  if (
    preferredAt !== null
    && (typeof preferredAt !== "string" || !Number.isFinite(Date.parse(preferredAt)) || Date.parse(preferredAt) <= Date.now())
  ) {
    throw new ActionError("Choose a preferred visit time in the future.");
  }
  if (
    durationHours !== null
    && (typeof durationHours !== "number" || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24)
  ) {
    throw new ActionError("Requested duration must be between 1 and 24 hours.");
  }

  const year = new Date().getFullYear();
  const requestRef = db.collection("homecare_requests").doc(randomUUID());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referenceNumber = `HR-HC-${year}-${String(randomInt(0, 10_000)).padStart(4, "0")}`;
    const created = await db.runTransaction(async (transaction) => {
      const duplicate = await transactionQuery(
        transaction,
        db.collection("homecare_requests").where("reference_number", "==", referenceNumber).limit(1),
      );
      if (!duplicate.empty) return false;
      const now = new Date().toISOString();
      transaction.create(requestRef, {
        patient_id: identity.uid,
        reference_number: referenceNumber,
        service_type: serviceType,
        description,
        address,
        latitude,
        longitude,
        preferred_at: preferredAt,
        duration_hours: durationHours,
        provider_id: null,
        status: "pending_review",
        created_at: now,
        updated_at: now,
      });
      return true;
    });
    if (created) return { id: requestRef.id, referenceNumber };
  }

  throw new ActionError("Could not generate a unique homecare request reference. Please try again.", 503);
}

async function issueHomecareQuote(identity: Identity, args: ActionArgs) {
  await requireHomecareOperations(identity);
  const requestId = stringArg(args, "_request_id");
  const amount = args._amount;
  const details = stringArg(args, "_details").trim();
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    throw new ActionError("A valid quote amount is required.");
  }
  if (details.length < 3 || details.length > 2_000) {
    throw new ActionError("Quote details must be between 3 and 2000 characters.");
  }

  const requestRef = db.collection("homecare_requests").doc(requestId);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists) throw new ActionError("Home care request not found.", 404);
    const request = snapshot.data() ?? {};
    if (request.status !== "pending_review") {
      throw new ActionError("This request is no longer waiting for a quote.", 409);
    }
    transaction.update(requestRef, {
      quote_amount: amount,
      quote_currency: "ZAR",
      quote_details: details,
      quote_issued_at: now,
      quote_issued_by: identity.uid,
      status: "quote_pending",
      updated_at: now,
    });
    if (typeof request.patient_id === "string") {
      transaction.create(db.collection("notifications").doc(), {
        user_id: request.patient_id,
        category: "homecare",
        title: "Your home care quote is ready",
        body: "Review the quote for your home care request.",
        link: "/dashboard/patient/homecare",
        created_at: now,
        read: false,
      });
    }
    return { ok: true };
  });
}

async function respondToHomecareQuote(identity: Identity, args: ActionArgs) {
  await requireRole(identity, "patient");
  const requestId = stringArg(args, "_request_id");
  const response = stringArg(args, "_response");
  if (response !== "accept" && response !== "decline") {
    throw new ActionError("Choose whether to accept or decline the quote.");
  }
  const requestRef = db.collection("homecare_requests").doc(requestId);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists) throw new ActionError("Home care request not found.", 404);
    const request = snapshot.data() ?? {};
    if (request.patient_id !== identity.uid) {
      throw new ActionError("You cannot respond to another patient's quote.", 403);
    }
    if (request.status !== "quote_pending") {
      throw new ActionError("This quote is no longer awaiting your response.", 409);
    }
    const status = response === "accept" ? "quote_accepted" : "quote_declined";
    transaction.update(requestRef, { status, updated_at: now });
    return { status };
  });
}

async function coordinateHomecareRequest(identity: Identity, args: ActionArgs) {
  await requireHomecareOperations(identity);
  const requestId = stringArg(args, "_request_id");
  const providerId = stringArg(args, "_provider_id");
  const requestedSchedule = args._scheduled_at;
  if (
    requestedSchedule !== undefined
    && (typeof requestedSchedule !== "string" || !Number.isFinite(Date.parse(requestedSchedule)))
  ) {
    throw new ActionError("A valid scheduled date is required.");
  }

  const requestRef = db.collection("homecare_requests").doc(requestId);
  const providerRef = db.collection("homecare_providers").doc(providerId);
  const assignmentRef = db.collection("homecare_assignments").doc();
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, providerSnapshot, assignmentsSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(providerRef),
      transactionQuery(transaction, db.collection("homecare_assignments").where("request_id", "==", requestId)),
    ]);
    if (!requestSnapshot.exists) throw new ActionError("Home care request not found.", 404);
    if (!providerSnapshot.exists) throw new ActionError("Home care provider not found.", 404);
    const request = requestSnapshot.data() ?? {};
    const provider = providerSnapshot.data() ?? {};
    const providerRoleSnapshot = typeof provider.user_id === "string"
      ? await transaction.get(db.collection("user_roles").doc(`${provider.user_id}_homecare_company`))
      : null;

    const existingAssignment = assignmentsSnapshot.docs.find((document) =>
      document.get("status") !== "declined",
    );
    const canReassignDeclined = assignmentsSnapshot.size > 0
      && assignmentsSnapshot.docs.every((document) => document.get("status") === "declined");
    if (existingAssignment) {
      if (request.provider_id === providerId && request.status === "assigned") {
        return { ok: true, assignmentId: existingAssignment.id };
      }
      throw new ActionError("This request already has an active provider assignment.", 409);
    }
    if (request.status !== "quote_accepted" && !(request.status === "assigned" && canReassignDeclined)) {
      throw new ActionError("The patient's quote acceptance is required before assigning a provider.", 409);
    }
    if (
      typeof provider.user_id !== "string"
      || provider.approval_status !== "approved"
      || provider.is_active !== true
      || providerRoleSnapshot?.get("role") !== "homecare_company"
    ) {
      throw new ActionError("Choose an approved, active home care provider account.", 409);
    }

    const scheduledAt = typeof requestedSchedule === "string" ? requestedSchedule : null;
    transaction.create(assignmentRef, {
      id: assignmentRef.id,
      request_id: requestId,
      patient_id: request.patient_id,
      provider_id: providerId,
      staff_id: null,
      assigned_by: identity.uid,
      status: "offered",
      amount: request.quote_amount ?? null,
      scheduled_at: scheduledAt,
      created_at: now,
      updated_at: now,
    });
    transaction.update(requestRef, {
      provider_id: providerId,
      status: "assigned",
      updated_at: now,
    });
    if (typeof provider.user_id === "string") {
      transaction.create(db.collection("notifications").doc(), {
        user_id: provider.user_id,
        category: "homecare",
        title: "New home care visit offer",
        body: "A coordinator assigned a home care request to your provider account.",
        link: "/dashboard/homecare_company",
        created_at: now,
        read: false,
      });
    }
    return { ok: true, assignmentId: assignmentRef.id };
  });
}

async function provisionHomecareProviderAccount(identity: Identity, args: ActionArgs) {
  if (!(await isAdmin(identity))) throw new ActionError("Admin role required.", 403);
  const userId = stringArg(args, "_user_id");
  let target;
  try {
    target = await getAuth(app).getUser(userId);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "auth/user-not-found"
    ) {
      throw new ActionError("The target Firebase Auth user could not be found.", 404);
    }
    throw error;
  }
  if (
    target.email?.toLowerCase() !== "support@healthreachcare.co.za"
    || !target.emailVerified
  ) {
    throw new ActionError("The verified support@healthreachcare.co.za account is required.", 403);
  }

  const providerMatches = await db.collection("homecare_providers").where("user_id", "==", userId).get();
  if (providerMatches.size > 1) {
    throw new ActionError("More than one home care provider profile is linked to this user; resolve the duplicate profiles first.", 409);
  }
  const roles = await db.collection("user_roles").where("user_id", "==", userId).get();
  if (roles.docs.some((document) => document.get("role") === "admin")) {
    throw new ActionError("An administrator account cannot be converted to a provider account.", 409);
  }
  const profileRef = db.collection("profiles").doc(userId);
  const profileSnapshot = await profileRef.get();
  const profile = profileSnapshot.data() ?? {};
  const providerRef = providerMatches.docs[0]?.ref ?? db.collection("homecare_providers").doc(userId);
  const existingProvider = providerMatches.docs[0]?.data() ?? {};
  const providerId = providerMatches.docs[0]?.id ?? userId;
  const now = new Date().toISOString();
  const roleRef = db.collection("user_roles").doc(`${userId}_homecare_company`);
  const batch = db.batch();
  for (const role of roles.docs) {
    if (role.id !== roleRef.id) batch.delete(role.ref);
  }
  batch.set(profileRef, {
    ...profile,
    user_id: userId,
    email: target.email,
    homecare_type: "company",
    approval_status: existingProvider.approval_status ?? "pending",
    updated_at: now,
  }, { merge: true });
  batch.set(providerRef, {
    ...existingProvider,
    id: providerId,
    user_id: userId,
    email: target.email,
    full_name: existingProvider.full_name ?? profile.full_name ?? target.displayName ?? null,
    phone: existingProvider.phone ?? profile.phone ?? null,
    address: existingProvider.address ?? profile.address ?? null,
    latitude: existingProvider.latitude ?? profile.latitude ?? null,
    longitude: existingProvider.longitude ?? profile.longitude ?? null,
    organization_name: existingProvider.organization_name ?? profile.organization_name ?? null,
    provider_type: existingProvider.provider_type ?? "company",
    homecare_type: "company",
    status: existingProvider.status ?? "pending_review",
    approval_status: existingProvider.approval_status ?? "pending",
    is_active: existingProvider.approval_status === "approved" && existingProvider.is_active === true,
    services: existingProvider.services ?? [],
    service_areas: existingProvider.service_areas ?? [],
    certifications: existingProvider.certifications ?? [],
    requested_documents: existingProvider.requested_documents ?? [],
    service_radius_km: existingProvider.service_radius_km ?? 25,
    created_at: existingProvider.created_at ?? now,
    updated_at: now,
  }, { merge: true });
  batch.set(roleRef, {
    id: roleRef.id,
    user_id: userId,
    role: "homecare_company",
    created_at: now,
  });
  batch.create(db.collection("admin_audit_log").doc(), {
    admin_id: identity.uid,
    action: "homecare.provider_account.provision",
    target_type: "user",
    target_id: userId,
    payload: { email: target.email },
    created_at: now,
  });
  await batch.commit();
  return { ok: true };
}

async function claimAdminWithInvite(identity: Identity, args: ActionArgs) {
  const expected = adminInviteCode.value().trim();
  if (!expected) throw new ActionError("Admin invite code is not configured.", 503);
  if (stringArg(args, "_code").trim() !== expected) {
    throw new ActionError("Invalid invite code.", 403);
  }

  const userRoles = await db.collection("user_roles").where("user_id", "==", identity.uid).get();
  const batch = db.batch();
  for (const role of userRoles.docs) batch.delete(role.ref);
  const roleRef = db.collection("user_roles").doc(`${identity.uid}_admin`);
  batch.set(roleRef, {
    id: roleRef.id,
    user_id: identity.uid,
    role: "admin",
    created_at: new Date().toISOString(),
  });
  batch.set(db.collection("profiles").doc(identity.uid), {
    user_id: identity.uid,
    approval_status: "approved",
    updated_at: new Date().toISOString(),
  }, { merge: true });
  await batch.commit();
  return { ok: true };
}

async function runAction(identity: Identity, name: string, args: ActionArgs) {
  switch (name) {
    case "register_self_service_role":
      return registerSelfServiceRole(identity, args);
    case "create_homecare_request":
      return createHomecareRequest(identity, args);
    case "issue_homecare_quote":
      return issueHomecareQuote(identity, args);
    case "respond_homecare_quote":
      return respondToHomecareQuote(identity, args);
    case "coordinate_homecare_request":
      return coordinateHomecareRequest(identity, args);
    case "provision_homecare_provider_account":
      return provisionHomecareProviderAccount(identity, args);
    case "claim_admin_with_code":
      return claimAdminWithInvite(identity, args);
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

export const archiveCompletedHomecareConversation = onDocumentWritten(
  "homecare_assignments/{assignmentId}",
  async (event) => {
    const after = event.data?.after.data();
    if (!after || !["completed", "confirmed"].includes(String(after.status))) return;
    const conversationRef = db.collection("homecare_conversations").doc(event.params.assignmentId);
    await db.runTransaction(async (transaction) => {
      const conversationSnapshot = await transaction.get(conversationRef);
      if (!conversationSnapshot.exists || conversationSnapshot.get("status") !== "active") return;
      transaction.update(conversationRef, {
        status: "archived",
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  },
);

export const privilegedFirestoreAction = onRequest(
  { region: "us-central1", timeoutSeconds: 120, memory: "512MiB", secrets: [paystackSecret, adminInviteCode] },
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
