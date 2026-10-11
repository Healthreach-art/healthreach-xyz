import { getRequest } from "@tanstack/react-start/server";
import type { FirestoreSchema } from "./firestore-types";

type Tables = FirestoreSchema["public"]["Tables"];
type Row<T extends string> =
  [T] extends [never] ? Record<string, any> :
  T extends keyof Tables ? Tables[T]["Row"] : Record<string, any>;
type RowData = Record<string, any>;
type Filter = { field: string; op: string; value: unknown };
import { evaluateOrNode, parseOrExpression, type OrNode } from "./or-expression";
type Result<T> = { data: T | null; error: Error | null; count?: number | null };

const PROJECT_ID = "healthreachcare-prod";
const API_KEY = (process.env.GOOGLE_API_KEY ?? "").trim();
const DOCUMENTS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).filter(([, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, encodeValue(entry)]),
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function decodeValue(value: Record<string, any>): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, Record<string, any>> = {}): RowData {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeFields(data: RowData) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, encodeValue(value)]),
  );
}

function documentId(document: { name: string; fields?: Record<string, Record<string, any>> }): RowData {
  return {
    ...decodeFields(document.fields),
    id: document.name.split("/").at(-1) ?? "",
  };
}

async function firestoreRequest(path: string, init: RequestInit = {}) {
  const request = getRequest();
  const bearer = request?.headers.get("authorization");
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (bearer) headers.set("Authorization", bearer);
  const response = await fetch(`${DOCUMENTS_URL}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Firestore request failed with status ${response.status}.`);
  }
  return response;
}

class AdminQuery<T extends RowData[] | RowData | null> implements PromiseLike<Result<T>> {
  private filters: Filter[] = [];
  private orGroups: OrNode[] = [];
  private orderings: Array<{ field: string; direction: "ASCENDING" | "DESCENDING" }> = [];
  private maxResults: number | null = null;
  private operation: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private writes: RowData[] = [];
  private selected = false;
  private columns = "*";
  private singleResult: "many" | "single" | "maybeSingle" = "many";
  private rangeValue: [number, number] | null = null;
  private headOnly = false;

  constructor(private readonly collection: string) {}

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    this.columns = columns;
    this.selected = true;
    this.headOnly = options?.head ?? false;
    return this;
  }

  eq(field: string, value: unknown): this { return this.addFilter(field, "EQUAL", value); }
  neq(field: string, value: unknown): this { return this.addFilter(field, "NOT_EQUAL", value); }
  gt(field: string, value: unknown): this { return this.addFilter(field, "GREATER_THAN", value); }
  gte(field: string, value: unknown): this { return this.addFilter(field, "GREATER_THAN_OR_EQUAL", value); }
  lt(field: string, value: unknown): this { return this.addFilter(field, "LESS_THAN", value); }
  lte(field: string, value: unknown): this { return this.addFilter(field, "LESS_THAN_OR_EQUAL", value); }
  ilike(field: string, value: string): this { return this.addFilter(field, "ilike", value); }
  is(field: string, value: unknown): this { return this.addFilter(field, "EQUAL", value); }
  in(field: string, values: unknown[]): this { return this.addFilter(field, "IN", values); }
  filter(field: string, op: string, value: unknown): this {
    const operators: Record<string, string> = {
      eq: "EQUAL", neq: "NOT_EQUAL", gt: "GREATER_THAN", gte: "GREATER_THAN_OR_EQUAL",
      lt: "LESS_THAN", lte: "LESS_THAN_OR_EQUAL", in: "IN",
    };
    return this.addFilter(field, operators[op] ?? op, value);
  }
  not(field: string, op: string, value: unknown): this {
    const inverse: Record<string, string> = { eq: "NOT_EQUAL", neq: "EQUAL", is: "NOT_EQUAL", in: "NOT_IN" };
    return this.addFilter(field, inverse[op] ?? op, value);
  }
  or(expression: string): this {
    this.orGroups.push(parseOrExpression(expression));
    return this;
  }
  order(field: string, options?: { ascending?: boolean }): this {
    this.orderings.push({ field, direction: options?.ascending === false ? "DESCENDING" : "ASCENDING" });
    return this;
  }
  limit(count: number): this { this.maxResults = count; return this; }
  range(from: number, to: number): this { this.rangeValue = [from, to]; return this; }
  single(): AdminQuery<RowData> {
    this.singleResult = "single";
    return this as unknown as AdminQuery<RowData>;
  }
  maybeSingle(): AdminQuery<RowData | null> {
    this.singleResult = "maybeSingle";
    return this as unknown as AdminQuery<RowData | null>;
  }
  insert(values: object | object[]): this {
    this.operation = "insert";
    this.writes = (Array.isArray(values) ? values : [values]).map((value) => ({ ...value }));
    return this;
  }
  upsert(values: object | object[], options?: { onConflict?: string }): this {
    this.operation = "upsert";
    const fields = options?.onConflict?.split(",").map((field) => field.trim()).filter(Boolean);
    this.writes = (Array.isArray(values) ? values : [values]).map((value) => {
      const row = { ...value };
      if (!row.id && fields?.length) {
        const key = fields.map((field) => String(row[field] ?? "")).join("_");
        if (key.replaceAll("_", "")) row.id = key;
      }
      return row;
    });
    return this;
  }
  update(values: object): this { this.operation = "update"; this.writes = [{ ...values }]; return this; }
  delete(): this { this.operation = "delete"; return this; }

  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private addFilter(field: string, op: string, value: unknown): this {
    this.filters.push({ field: field === "id" ? "__name__" : field, op, value });
    return this;
  }

  private async list(): Promise<RowData[]> {
    const filters = this.filters.filter(({ op }) => ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike"].includes(op));
    const where = this.filters
      .filter(({ op }) => ["EQUAL", "NOT_EQUAL", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL", "IN", "NOT_IN"].includes(op))
      .map(({ field, op, value }) => ({
        fieldFilter: {
          field: { fieldPath: field },
          op,
          value: field === "__name__"
            ? { referenceValue: `${DOCUMENTS_URL}/${this.collection}/${String(value)}` }
            : encodeValue(value),
        },
      }));
    const structuredQuery: RowData = {
      from: [{ collectionId: this.collection }],
    };
    if (where.length === 1) structuredQuery.where = where[0];
    else if (where.length > 1) {
      structuredQuery.where = {
        compositeFilter: {
          op: "AND",
          filters: where,
        },
      };
    }
    if (this.orderings.length) {
      structuredQuery.orderBy = this.orderings.map(({ field, direction }) => ({
        field: { fieldPath: field },
        direction,
      }));
    }
    const filtersInMemory = filters.length > 0 || this.orGroups.length > 0;
    if (this.maxResults !== null && !filtersInMemory) structuredQuery.limit = this.maxResults;
    const response = await firestoreRequest(":runQuery", {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    });
    const payload = await response.json() as Array<{ document?: { name: string; fields?: Record<string, Record<string, any>> } }>;
    let rows = payload.flatMap((item) => item.document ? [documentId(item.document)] : []);
    if (filters.length) {
      rows = rows.filter((row) => filters.some((filter) => {
        const actual = row[filter.field];
        if (filter.op === "eq" || filter.op === "is") return actual === filter.value;
        if (filter.op === "neq") return actual !== filter.value;
        if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(actual);
        if (filter.op === "like" || filter.op === "ilike") {
          const needle = String(filter.value).replaceAll("%", "");
          const haystack = String(actual ?? "");
          return filter.op === "ilike"
            ? haystack.toLowerCase().includes(needle.toLowerCase())
            : haystack.includes(needle);
        }
        return false;
      }));
    }
    if (this.orGroups.length) rows = rows.filter((row) => this.orGroups.every((g) => evaluateOrNode(g, row)));
    if (filtersInMemory && this.maxResults !== null) rows = rows.slice(0, this.maxResults);
    if (this.rangeValue) rows = rows.slice(this.rangeValue[0], this.rangeValue[1] + 1);
    return rows;
  }

  private async execute(): Promise<Result<T>> {
    try {
      let rows: RowData[];
      if (this.operation === "select") {
        rows = (await this.list()).map((row) => this.project(row));
      } else if (this.operation === "insert" || this.operation === "upsert") {
        rows = [];
        for (const value of this.writes) {
          const id = typeof value.id === "string" ? value.id : crypto.randomUUID();
          const data = { ...value };
          delete data.id;
          if (this.operation === "insert") {
            await firestoreRequest(`/${encodeURIComponent(this.collection)}?documentId=${encodeURIComponent(id)}`, {
              method: "POST",
              body: JSON.stringify({ fields: encodeFields(data) }),
            });
          } else {
            await this.write(id, data, true);
          }
          rows.push({ ...value, id });
        }
        if (!this.selected) rows = [];
        else rows = rows.map((row) => this.project(row));
      } else {
        const matches = await this.list();
        if (this.operation === "update") {
          for (const row of matches) await this.write(String(row.id), this.writes[0] ?? {}, true);
          rows = matches.map((row) => ({ ...row, ...this.writes[0] }));
        } else {
          for (const row of matches) {
            await firestoreRequest(`/${encodeURIComponent(this.collection)}/${encodeURIComponent(String(row.id))}`, { method: "DELETE" });
          }
          rows = matches;
        }
        if (!this.selected) rows = [];
        else rows = rows.map((row) => this.project(row));
      }
      let result: RowData[] | RowData | null = rows;
      if (this.singleResult !== "many") {
        if (rows.length > 1 || (this.singleResult === "single" && rows.length === 0)) {
          return { data: null, error: new Error(`Expected one document in "${this.collection}", found ${rows.length}.`), count: rows.length };
        }
        result = rows[0] ?? null;
      }
      return { data: this.headOnly ? null : result as T, error: null, count: rows.length };
    } catch (error) {
      return { data: null, error: asError(error), count: null };
    }
  }

  private async write(id: string, data: RowData, merge: boolean) {
    const fields = encodeFields(data);
    const params = new URLSearchParams();
    if (merge) {
      for (const field of Object.keys(fields)) params.append("updateMask.fieldPaths", field);
    }
    const query = params.size ? `?${params.toString()}` : "";
    await firestoreRequest(`/${encodeURIComponent(this.collection)}/${encodeURIComponent(id)}${query}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
  }

  private project(row: RowData): RowData {
    if (this.columns.trim() === "*" || this.columns.includes("(")) return row;
    const fields = this.columns.split(",").map((field) => field.trim().split(":").at(-1) ?? "").filter(Boolean);
    return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
  }
}

export const firestoreAdmin = {
  from<T extends string>(collection: T): AdminQuery<Row<T>[]> {
    return new AdminQuery<Row<T>[]>(collection);
  },
  rpc: async (name: string, args: RowData = {}): Promise<Result<any>> => {
    const request = getRequest();
    const authorization = request?.headers.get("authorization");
    if (!authorization) {
      return { data: null, error: new Error("A Firebase ID token is required.") };
    }

    const endpoint = name.startsWith("mcp_")
      ? (process.env.MCP_OAUTH_DATA_URL
        ?? "https://us-central1-healthreachcare-prod.cloudfunctions.net/mcpData").trim()
      : (process.env.FIREBASE_PRIVILEGED_ACTION_URL
        ?? "https://us-central1-healthreachcare-prod.cloudfunctions.net/privilegedFirestoreAction").trim();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body: JSON.stringify({ name, args }),
      });
      const body = await response.json().catch(() => null) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        return {
          data: null,
          error: new Error(body?.error?.message ?? `Firebase privileged action failed (${response.status}).`),
        };
      }
      if (!body || !("data" in body)) {
        return { data: null, error: new Error("Firebase privileged action returned an invalid response.") };
      }
      return { data: body?.data ?? null, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  auth: {
    admin: {
      getUserById: async (userId: string): Promise<Result<RowData>> => {
        const request = getRequest();
        const token = request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return { data: null, error: new Error("A Firebase ID token is required.") };
        if (request && request.headers.get("x-firebase-user-id") && request.headers.get("x-firebase-user-id") !== userId) {
          return { data: null, error: new Error("The authenticated Firebase user does not match the requested user.") };
        }
        if (!API_KEY) return { data: null, error: new Error("Firebase API key is not configured.") };
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(API_KEY)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }) },
        );
        if (!response.ok) return { data: null, error: new Error("Could not look up the authenticated Firebase user.") };
        const payload = await response.json() as { users?: Array<{ localId: string; email?: string }> };
        const user = payload.users?.find((entry) => entry.localId === userId);
        return {
          data: user ? { user } : null,
          error: user ? null : new Error("Firebase user not found."),
        };
      },
      deleteUser: async (userId: string): Promise<{ error: Error | null }> => {
        const request = getRequest();
        const token = request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return { error: new Error("A Firebase ID token is required.") };
        const payload = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(API_KEY)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }) },
        ).then((response) => response.json()) as { users?: Array<{ localId: string }> };
        if (payload.users?.[0]?.localId !== userId) {
          return { error: new Error("Only the authenticated Firebase user can delete their account.") };
        }
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(API_KEY)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }) },
        );
        return { error: response.ok ? null : new Error("Firebase account deletion failed.") };
      },
    },
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string, expiresIn?: number) => {
        const request = getRequest();
        const authorization = request?.headers.get("authorization");
        if (!authorization) return { data: null, error: new Error("A Firebase ID token is required.") };
        const bucketName = "healthreachcare-prod.firebasestorage.app";
        const objectPath = encodeURIComponent(`${bucket}/${path}`);
        const metadataResponse = await fetch(
          `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${objectPath}`,
          { headers: { Authorization: authorization } },
        );
        if (!metadataResponse.ok) {
          return { data: null, error: new Error(`Could not read Firebase Storage object (${metadataResponse.status}).`) };
        }
        const metadata = await metadataResponse.json() as { downloadTokens?: string };
        const token = metadata.downloadTokens?.split(",")[0];
        if (!token) return { data: null, error: new Error("Firebase Storage object has no download token.") };
        const signedUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${objectPath}?alt=media&token=${encodeURIComponent(token)}`;
        return { data: { signedUrl, expiresIn: expiresIn ?? null }, error: null };
      },
    }),
  },
};
