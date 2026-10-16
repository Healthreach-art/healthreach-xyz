import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  getIdTokenResult,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import {
  documentId,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  type QueryConstraint,
} from "firebase/firestore";
import { fsDelete, fsList, fsSet, fsSubscribe, fsUpdate, where } from "./firestore";
import { getFirebase } from "./firebase";
import type { FirestoreSchema } from "./firestore-types";
import { evaluateOrNode, parseOrExpression, type OrNode } from "./or-expression";

type Tables = FirestoreSchema["public"]["Tables"];
type Row<T extends string> =
  [T] extends [never] ? Record<string, any> :
  T extends keyof Tables ? Tables[T]["Row"] : Record<string, any>;
type RowData = Record<string, any>;
type Result<T> = { data: T | null; error: Error | null; count?: number | null };
type Filter = { field: string; op: string; value: unknown };

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const globalRealtimeCollections = [
  "profiles", "user_roles", "doctors", "pharmacies", "drivers",
  "homecare_providers", "homecare_staff", "homecare_requests", "homecare_assignments",
  "orders", "order_groups", "order_group_events", "deliveries", "delivery_offers",
  "pharmacy_offers", "bookings", "doctor_appointments", "pharmacy_appointments",
  "notifications", "documents", "pharmacy_documents", "doctor_documents",
  "driver_documents", "homecare_documents", "payments", "wallets", "wallet_transactions",
  "saved_payment_methods", "prescriptions", "prescription_uploads", "prescription_audit_log",
  "medications", "medications_public", "medication_reminders", "ratings", "doctor_reviews", "family_members",
  "user_addresses", "card_pins", "driver_locations", "driver_status", "driver_bank_accounts",
  "driver_payouts", "appointment_messages", "order_messages", "complaints",
  "admin_audit_log", "admin_invites", "e_prescriptions", "notification_preferences",
  "pharmacy_branches",
];

const privateStorageBuckets = new Set([
  "documents",
  "prescriptions",
  "pharmacy-docs",
  "doctor-docs",
  "driver-docs",
  "homecare-docs",
  "delivery-proofs",
]);

function rowData(value: object): RowData {
  return { ...value };
}

function documentField(field: string) {
  return field === "id" ? documentId() : field;
}

class FirestoreQuery<T extends RowData[] | RowData | null> implements PromiseLike<Result<T>> {
  private constraints: QueryConstraint[] = [];
  private localFilters: Filter[] = [];
  private orGroups: OrNode[] = [];
  private maxCount: number | null = null;
  private operation: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private writeValues: RowData[] = [];
  private selected = false;
  private columns = "*";
  private singleResult: "many" | "single" | "maybeSingle" = "many";
  private rangeValue: [number, number] | null = null;
  private headOnly = false;

  constructor(private readonly collectionName: string) {}

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    this.columns = columns;
    this.selected = true;
    this.headOnly = options?.head ?? false;
    return this;
  }

  eq(field: string, value: unknown): this {
    this.constraints.push(where(documentField(field), "==", value));
    return this;
  }

  neq(field: string, value: unknown): this {
    this.constraints.push(where(documentField(field), "!=", value));
    return this;
  }

  gt(field: string, value: unknown): this {
    this.constraints.push(where(documentField(field), ">", value));
    return this;
  }

  gte(field: string, value: unknown): this {
    this.constraints.push(where(documentField(field), ">=", value));
    return this;
  }

  lt(field: string, value: unknown): this {
    this.constraints.push(where(documentField(field), "<", value));
    return this;
  }

  lte(field: string, value: unknown): this {
    this.constraints.push(where(documentField(field), "<=", value));
    return this;
  }

  is(field: string, value: null | boolean): this {
    this.constraints.push(where(documentField(field), "==", value));
    return this;
  }

  in(field: string, values: unknown[]): this {
    this.constraints.push(where(documentField(field), "in", values));
    return this;
  }

  ilike(field: string, value: string): this {
    this.localFilters.push({ field, op: "ilike", value });
    return this;
  }

  filter(field: string, operator: string, value: unknown): this {
    return this.applyFilter(field, operator, value);
  }

  not(field: string, operator: string, value: unknown): this {
    const inverse: Record<string, string> = {
      eq: "!=",
      neq: "==",
      is: "!=",
      in: "not-in",
    };
    return this.applyFilter(field, inverse[operator] ?? operator, value);
  }

  or(expression: string): this {
    this.orGroups.push(parseOrExpression(expression));
    return this;
  }

  private orderSpecs: Array<{ field: string; desc: boolean; constraint: QueryConstraint }> = [];

  order(field: string, options?: { ascending?: boolean }): this {
    const constraint = firestoreOrderBy(field, options?.ascending === false ? "desc" : "asc");
    this.orderSpecs.push({ field, desc: options?.ascending === false, constraint });
    this.constraints.push(constraint);
    return this;
  }

  limit(count: number): this {
    this.maxCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeValue = [from, to];
    return this;
  }

  single(): FirestoreQuery<RowData> {
    this.singleResult = "single";
    return this as unknown as FirestoreQuery<RowData>;
  }

  maybeSingle(): FirestoreQuery<RowData | null> {
    this.singleResult = "maybeSingle";
    return this as unknown as FirestoreQuery<RowData | null>;
  }

  insert(values: object | object[]): this {
    this.operation = "insert";
    this.writeValues = (Array.isArray(values) ? values : [values]).map(rowData);
    return this;
  }

  upsert(values: object | object[], options?: { onConflict?: string }): this {
    this.operation = "upsert";
    const conflictFields = options?.onConflict?.split(",").map((field) => field.trim()).filter(Boolean);
    this.writeValues = (Array.isArray(values) ? values : [values]).map((value) => {
      const row = rowData(value);
      if (!row.id && conflictFields?.length) {
        const key = conflictFields.map((field) => String(row[field] ?? "")).join("_");
        if (key.replaceAll("_", "") !== "") row.id = key;
      }
      return row;
    });
    return this;
  }

  update(values: object): this {
    this.operation = "update";
    this.writeValues = [rowData(values)];
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private applyFilter(field: string, operator: string, value: unknown): this {
    const supported = new Set(["==", "!=", ">", ">=", "<", "<=", "in", "not-in", "array-contains"]);
    const normalized = ({ eq: "==", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" } as Record<string, string>)[operator] ?? operator;
    if (supported.has(normalized)) {
      this.constraints.push(where(documentField(field), normalized as Parameters<typeof where>[1], value));
    } else {
      this.localFilters.push({ field, op: operator, value });
    }
    return this;
  }

  private async execute(): Promise<Result<T>> {
    try {
      let rows: RowData[];
      if (this.operation === "select") {
        // limit must run after in-memory filters, otherwise matching rows get cut off first
        const filtersInMemory = this.localFilters.length > 0 || this.orGroups.length > 0;
        const serverConstraints = !filtersInMemory && this.maxCount !== null
          ? [...this.constraints, firestoreLimit(this.maxCount)]
          : this.constraints;
        try {
          rows = await fsList<RowData>(this.collectionName, ...serverConstraints);
        } catch (err) {
          // Missing/building composite index: retry without server sorting, then sort in memory.
          const msg = String((err as { message?: string })?.message ?? err);
          if (!this.orderSpecs.length || !/index/i.test(msg)) throw err;
          const orderSet = new Set(this.orderSpecs.map((s) => s.constraint));
          rows = await fsList<RowData>(this.collectionName, ...this.constraints.filter((c) => !orderSet.has(c)));
          const specs = this.orderSpecs;
          rows.sort((a, b) => {
            for (const { field, desc } of specs) {
              const av = a[field] as string | number | null | undefined;
              const bv = b[field] as string | number | null | undefined;
              if (av === bv) continue;
              if (av == null) return 1;
              if (bv == null) return -1;
              const cmp = av < bv ? -1 : 1;
              return desc ? -cmp : cmp;
            }
            return 0;
          });
          if (!filtersInMemory && this.maxCount !== null) rows = rows.slice(0, this.maxCount);
        }
        rows = this.applyLocalFilters(rows);
        if (filtersInMemory && this.maxCount !== null) rows = rows.slice(0, this.maxCount);
        if (this.rangeValue) rows = rows.slice(this.rangeValue[0], this.rangeValue[1] + 1);
        rows = rows.map((row) => this.project(row));
      } else if (this.operation === "insert" || this.operation === "upsert") {
        rows = [];
        for (const value of this.writeValues) {
          const id = typeof value.id === "string" ? value.id : crypto.randomUUID();
          const data = { ...value };
          delete data.id;
          await fsSet(this.collectionName, id, data, this.operation === "upsert");
          rows.push({ ...value, id });
        }
        if (!this.selected) rows = [];
        else rows = rows.map((row) => this.project(row));
      } else {
        const matching = this.applyLocalFilters(
          await fsList<RowData>(this.collectionName, ...this.constraints),
        );
        if (this.operation === "update") {
          for (const row of matching) {
            await fsUpdate(this.collectionName, String(row.id), this.writeValues[0] ?? {});
          }
          rows = matching.map((row) => ({ ...row, ...this.writeValues[0] }));
        } else {
          for (const row of matching) await fsDelete(this.collectionName, String(row.id));
          rows = matching;
        }
        if (!this.selected) rows = [];
        else rows = rows.map((row) => this.project(row));
      }

      let result: RowData[] | RowData | null = rows;
      if (this.singleResult !== "many") {
        if (rows.length > 1 || (this.singleResult === "single" && rows.length === 0)) {
          return { data: null, error: new Error(`Expected one document in "${this.collectionName}", found ${rows.length}.`), count: rows.length };
        }
        result = rows[0] ?? null;
      }
      return { data: this.headOnly ? null : result as T, error: null, count: rows.length };
    } catch (error) {
      return { data: null, error: asError(error), count: null };
    }
  }

  private applyLocalFilters(rows: RowData[]): RowData[] {
    if (this.orGroups.length) rows = rows.filter((row) => this.orGroups.every((g) => evaluateOrNode(g, row)));
    if (this.localFilters.length === 0) return rows;
    return rows.filter((row) =>
      this.localFilters.some(({ field, op, value }) => {
        const actual = row[field];
        switch (op) {
          case "eq": return actual === value;
          case "neq": return actual !== value;
          case "is": return actual === value;
          case "in": return Array.isArray(value) && value.includes(actual);
          case "like":
          case "ilike": {
            const needle = String(value).replaceAll("%", "");
            const haystack = String(actual ?? "");
            return op === "ilike"
              ? haystack.toLowerCase().includes(needle.toLowerCase())
              : haystack.includes(needle);
          }
          default: return false;
        }
      }),
    );
  }

  private project(row: RowData): RowData {
    if (this.columns.trim() === "*" || this.columns.includes("(")) return row;
    const fields = this.columns.split(",").map((field) => field.trim().split(":").at(-1) ?? "").filter(Boolean);
    return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
  }
}

type FirebaseCompatUser = {
  id: string;
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  user_metadata: { full_name: string; avatar_url: string };
  app_metadata: Record<string, never>;
  identities: Array<{ id: string; provider: string }>;
  created_at: string;
};

function authUser(user: import("firebase/auth").User): FirebaseCompatUser;
function authUser(user: null): null;
function authUser(user: import("firebase/auth").User | null): FirebaseCompatUser | null;
function authUser(user: import("firebase/auth").User | null): FirebaseCompatUser | null {
  if (!user) return null;
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email,
    phone: user.phoneNumber,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    user_metadata: { full_name: user.displayName ?? "", avatar_url: user.photoURL ?? "" },
    app_metadata: {},
    identities: user.providerData.map((provider) => ({ id: provider.uid, provider: provider.providerId })),
    created_at: user.metadata.creationTime ?? "",
  };
}

async function sessionFor(user: import("firebase/auth").User | null) {
  if (!user) return null;
  return {
    user: authUser(user),
    access_token: await user.getIdToken(),
    refresh_token: "",
    expires_in: 3600,
    token_type: "bearer",
  };
}

function storageClient(bucketName: string) {
  if (privateStorageBuckets.has(bucketName)) {
    return {
      upload: async (
        path: string,
        file: Blob,
        options?: { contentType?: string; upsert?: boolean },
      ) => {
        try {
          const { auth } = await getFirebase();
          await auth.authStateReady();
          const user = auth.currentUser;
          if (!user) throw new Error("Please sign in first.");
          const form = new FormData();
          form.append("bucket", bucketName);
          form.append("path", path);
          form.append("file", file, path.split("/").at(-1) ?? "upload");
          const response = await fetch("/api/private-files", {
            method: "POST",
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            body: form,
          });
          if (!response.ok) throw new Error(await response.text());
          return { data: { path }, error: null };
        } catch (error) {
          return { data: null, error: asError(error) };
        }
      },
      remove: async (paths: string[]) => {
        try {
          const { auth } = await getFirebase();
          await auth.authStateReady();
          const user = auth.currentUser;
          if (!user) throw new Error("Please sign in first.");
          const response = await fetch("/api/private-files", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${await user.getIdToken()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "delete", bucket: bucketName, paths }),
          });
          if (!response.ok) throw new Error(await response.text());
          return { data: paths.map((path) => ({ name: path })), error: null };
        } catch (error) {
          return { data: null, error: asError(error) };
        }
      },
      createSignedUrl: async (path: string, expiresIn?: number) => {
        try {
          const { auth } = await getFirebase();
          await auth.authStateReady();
          const user = auth.currentUser;
          if (!user) throw new Error("Please sign in first.");
          const response = await fetch("/api/private-files", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${await user.getIdToken()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "sign",
              bucket: bucketName,
              path,
              expiresIn,
            }),
          });
          if (!response.ok) throw new Error(await response.text());
          const result = await response.json() as { signedUrl?: string };
          if (!result.signedUrl) throw new Error("Private file service returned no URL.");
          return { data: { signedUrl: result.signedUrl }, error: null };
        } catch (error) {
          return { data: null, error: asError(error) };
        }
      },
      getPublicUrl: () => {
        throw new Error("Private R2 files cannot have public URLs.");
      },
    };
  }

  return {
    upload: async (path: string, file: Blob, options?: { contentType?: string; upsert?: boolean }) => {
      try {
        const { storage } = await getFirebase();
        await uploadBytes(ref(storage, `${bucketName}/${path}`), file, {
          contentType: options?.contentType ?? file.type,
        });
        return { data: { path }, error: null };
      } catch (error) {
        return { data: null, error: asError(error) };
      }
    },
    remove: async (paths: string[]) => {
      try {
        const { storage } = await getFirebase();
        await Promise.all(paths.map((path) => deleteObject(ref(storage, `${bucketName}/${path}`))));
        return { data: paths.map((path) => ({ name: path })), error: null };
      } catch (error) {
        return { data: null, error: asError(error) };
      }
    },
    createSignedUrl: async (path: string, _expiresIn?: number) => {
      try {
        const { storage } = await getFirebase();
        return { data: { signedUrl: await getDownloadURL(ref(storage, `${bucketName}/${path}`)) }, error: null };
      } catch (error) {
        return { data: null, error: asError(error) };
      }
    },
    getPublicUrl: (path: string) => ({
      data: {
        publicUrl: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media`,
      },
    }),
  };
}

export const firestoreClient = {
  from<T extends string>(collectionName: T): FirestoreQuery<Row<T>[]> {
    return new FirestoreQuery<Row<T>[]>(collectionName);
  },
  action: async (name: string, args: RowData = {}): Promise<Result<any>> => {
    const { firestoreActionNames, runFirestoreAction } = await import("./firestore-actions.functions");
    if (!(firestoreActionNames as readonly string[]).includes(name)) {
      return { data: null, error: new Error(`Unknown Firestore action "${name}".`) };
    }
    try {
      const data = await runFirestoreAction({
        data: { name: name as (typeof firestoreActionNames)[number], args },
      });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  storage: {
    from: storageClient,
  },
  auth: {
    getSession: async () => {
      try {
        const { auth } = await getFirebase();
        await auth.authStateReady();
        return { data: { session: await sessionFor(auth.currentUser) }, error: null };
      } catch (error) {
        return { data: { session: null }, error: asError(error) };
      }
    },
    getUser: async () => {
      try {
        const { auth } = await getFirebase();
        await auth.authStateReady();
        return { data: { user: authUser(auth.currentUser) }, error: null };
      } catch (error) {
        return { data: { user: null }, error: asError(error) };
      }
    },
    getClaims: async () => {
      try {
        const { auth } = await getFirebase();
        const user = auth.currentUser;
        return { data: user ? await getIdTokenResult(user) : null, error: null };
      } catch (error) {
        return { data: null, error: asError(error) };
      }
    },
    onAuthStateChange: (callback: (event: string, session: Awaited<ReturnType<typeof sessionFor>>) => void) => {
      let unsubscribe: (() => void) | undefined;
      void getFirebase().then(({ auth }) => {
        unsubscribe = onAuthStateChanged(auth, (user) => {
          void sessionFor(user).then((session) => callback(user ? "SIGNED_IN" : "SIGNED_OUT", session));
        });
      });
      return { data: { subscription: { unsubscribe: () => unsubscribe?.() } } };
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      try {
        const { auth } = await getFirebase();
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return { data: { user: authUser(credential.user), session: await sessionFor(credential.user) }, error: null };
      } catch (error) {
        return { data: { user: null, session: null }, error: asError(error) };
      }
    },
    signUp: async ({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: { full_name?: string; [key: string]: unknown }; emailRedirectTo?: string };
    }) => {
      try {
        const { auth } = await getFirebase();
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (options?.data?.full_name) {
          await updateProfile(credential.user, { displayName: options.data.full_name });
        }
        return { data: { user: authUser(credential.user), session: await sessionFor(credential.user) }, error: null };
      } catch (error) {
        return { data: { user: null, session: null }, error: asError(error) };
      }
    },
    signInWithOAuth: async ({ provider }: { provider: string; [key: string]: unknown }) => {
      try {
        const { auth } = await getFirebase();
        if (provider !== "google") throw new Error(`Unsupported Firebase sign-in provider: ${provider}`);
        await signInWithPopup(auth, new GoogleAuthProvider());
        return { data: { provider, url: null }, error: null };
      } catch (error) {
        return { data: { provider, url: null }, error: asError(error) };
      }
    },
    setSession: async () => ({
      data: { session: null, user: null },
      error: new Error("Firebase cannot accept external session tokens. Sign in through Firebase Authentication."),
    }),
    signOut: async (_options?: { scope?: string }) => {
      try {
        const { auth } = await getFirebase();
        await signOut(auth);
        return { error: null };
      } catch (error) {
        return { error: asError(error) };
      }
    },
    updateUser: async ({ password, email }: { password?: string; email?: string }) => {
      try {
        const { auth } = await getFirebase();
        const user = auth.currentUser;
        if (!user) throw new Error("No signed-in Firebase user.");
        if (password) await updatePassword(user, password);
        if (email) await updateEmail(user, email);
        return { data: { user: authUser(user) }, error: null };
      } catch (error) {
        return { data: { user: null }, error: asError(error) };
      }
    },
    resetPasswordForEmail: async (email: string, _options?: { redirectTo?: string }) => {
      try {
        const { auth } = await getFirebase();
        await sendPasswordResetEmail(auth, email);
        return { data: {}, error: null };
      } catch (error) {
        return { data: {}, error: asError(error) };
      }
    },
    linkIdentity: async (_options?: { provider?: string; options?: Record<string, unknown> }) => {
      try {
        const { auth } = await getFirebase();
        if (!auth.currentUser) throw new Error("No signed-in Firebase user.");
        await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
        return { data: {}, error: null };
      } catch (error) {
        return { data: {}, error: asError(error) };
      }
    },
    unlinkIdentity: async (identity: { provider: string }) => {
      try {
        const { auth } = await getFirebase();
        if (!auth.currentUser) throw new Error("No signed-in Firebase user.");
        const provider = auth.currentUser.providerData.find((item) => item.providerId === identity.provider);
        if (!provider) throw new Error("The requested sign-in provider is not linked.");
        await unlink(auth.currentUser, provider.providerId);
        return { data: {}, error: null };
      } catch (error) {
        return { data: {}, error: asError(error) };
      }
    },
    deleteUser: async () => {
      try {
        const { auth } = await getFirebase();
        if (!auth.currentUser) throw new Error("No signed-in Firebase user.");
        await deleteUser(auth.currentUser);
        return { error: null };
      } catch (error) {
        return { error: asError(error) };
      }
    },
  },
  channel: (_name: string) => {
    const subscriptions: Array<() => void> = [];
    const handlers: Array<{
      table?: string;
      filters: Filter[];
      callback: (payload: { new: RowData; old: RowData | null; eventType: string }) => void;
    }> = [];
    let closed = false;
    const channel = {
      on: (
        _event: string,
        config: { table?: string; filter?: string; [key: string]: unknown },
        listener: (payload: { new: RowData; old: RowData | null; eventType: string }) => void,
      ) => {
        const handler: (typeof handlers)[number] = {
          table: config.table,
          filters: [],
          callback: listener,
        };
        if (config.filter) {
          for (const part of config.filter.split("&")) {
            const match = /^([^=]+)=(eq|neq)\.(.*)$/.exec(part);
            if (match) handler.filters.push({ field: match[1], op: match[2], value: match[3] === "null" ? null : match[3] });
          }
        }
        handlers.push(handler);
        return channel;
      },
      subscribe: () => {
        for (const handler of handlers) {
          const tables = handler.table ? [handler.table] : globalRealtimeCollections;
          for (const table of tables) {
            const constraints = handler.filters.map(({ field, op, value }) =>
              op === "neq" ? where(field, "!=", value) : where(field, "==", value),
            );
            const previous = new Map<string, RowData>();
            let initialized = false;
            void fsSubscribe<RowData>(table, constraints, (rows) => {
              const current = new Map(rows.map((row) => [row.id, row]));
              if (initialized) {
                for (const [id, row] of current) {
                  const old = previous.get(id);
                  if (!old) handler.callback({ new: row, old: null, eventType: "INSERT" });
                  else if (JSON.stringify(old) !== JSON.stringify(row)) {
                    handler.callback({ new: row, old, eventType: "UPDATE" });
                  }
                }
                for (const [id, old] of previous) {
                  if (!current.has(id)) handler.callback({ new: {}, old, eventType: "DELETE" });
                }
              }
              initialized = true;
              previous.clear();
              for (const [id, row] of current) previous.set(id, row);
            }).then((unsubscribe) => {
              if (closed) unsubscribe();
              else subscriptions.push(unsubscribe);
            }).catch((error: unknown) => {
              console.error(`[firestore] Realtime listener failed for "${table}".`, error);
            });
          }
        }
        return channel;
      },
      unsubscribe: () => {
        closed = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        return Promise.resolve("ok");
      },
    };
    return channel;
  },
  removeChannel: async (channel: { unsubscribe: () => Promise<unknown> }) => channel.unsubscribe(),
};

export const reauthenticateFirebaseUser = async (password: string) => {
  const { auth } = await getFirebase();
  const user = auth.currentUser;
  if (!user?.email) throw new Error("A signed-in email account is required.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
};
