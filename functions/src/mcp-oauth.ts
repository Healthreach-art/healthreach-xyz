import { createHash, createPrivateKey, createPublicKey, randomBytes, randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData, type Query } from "firebase-admin/firestore";
import type { Request, Response } from "express";
import { exportJWK, jwtVerify, SignJWT } from "jose";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);
const signingKeySecret = defineSecret("MCP_OAUTH_SIGNING_KEY");
const issuerParam = defineString("MCP_OAUTH_ISSUER", { default: "https://healthreachcare.co.za" });
const projectId = "healthreachcare-prod";
const supportedScopes = ["mcp:tools"];
const tokenLifetimeSeconds = 3600;

class OAuthError extends Error {
  constructor(message: string, readonly status: number, readonly oauthCode?: string) {
    super(message);
  }
}

type OAuthClient = {
  client_id: string;
  client_name: string;
  client_uri: string | null;
  redirect_uris: string[];
  created_at: string;
};

type AuthorizationRecord = {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  scope: string[];
  resource: string;
  status: "pending" | "approved" | "denied" | "consumed";
  expires_at: string;
  created_at: string;
  user_id?: string;
  code_hash?: string;
  code_expires_at?: string;
  code_used_at?: string;
};

type HttpRequest = Request;
type HttpResponse = Response;

function issuer() {
  return issuerParam.value().replace(/\/+$/, "");
}

function oauthResource() {
  return `${issuer()}/mcp`;
}

function asIsoString(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value ?? null;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

function requestValue(request: HttpRequest, key: string) {
  const value = request.body?.[key] ?? request.query[key];
  return typeof value === "string" ? value : null;
}

function bearerToken(request: HttpRequest) {
  return request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

async function authenticateFirebaseUser(request: HttpRequest) {
  const token = bearerToken(request);
  if (!token) throw new OAuthError("A Firebase ID token is required.", 401, "invalid_token");
  try {
    const user = await getAuth(app).verifyIdToken(token, true);
    return { uid: user.uid, email: user.email ?? null };
  } catch {
    throw new OAuthError("Firebase ID token is invalid or expired.", 401, "invalid_token");
  }
}

async function oauthKeys() {
  const pem = signingKeySecret.value().replaceAll("\\n", "\n").trim();
  if (!pem) throw new OAuthError("OAuth signing key is not configured.", 503);
  const privateKey = createPrivateKey(pem);
  const publicKey = createPublicKey(privateKey);
  const jwk = await exportJWK(publicKey);
  const kid = hash(`${jwk.n ?? ""}.${jwk.e ?? ""}`).slice(0, 24);
  return {
    privateKey,
    publicKey,
    kid,
    jwk: { ...jwk, alg: "RS256", use: "sig", kid },
  };
}

function cors(response: HttpResponse) {
  response
    .set("Access-Control-Allow-Origin", "*")
    .set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    .set("Access-Control-Allow-Headers", "Authorization,Content-Type")
    .set("Cache-Control", "no-store");
}

function oauthError(response: HttpResponse, error: unknown) {
  if (error instanceof OAuthError) {
    response.status(error.status).json({
      error: error.oauthCode ?? "invalid_request",
      error_description: error.message,
    });
    return;
  }
  console.error("MCP OAuth request failed.", error);
  response.status(500).json({
    error: "server_error",
    error_description: "OAuth request could not be completed.",
  });
}

function validRedirectUri(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function publicClient(clientId: string): Promise<OAuthClient> {
  const snapshot = await db.collection("oauth_clients").doc(clientId).get();
  if (!snapshot.exists) throw new OAuthError("OAuth client not found.", 400, "invalid_client");
  return snapshot.data() as OAuthClient;
}

async function registerClient(request: HttpRequest) {
  const body = request.body as {
    client_name?: unknown;
    client_uri?: unknown;
    redirect_uris?: unknown;
  } | null;
  const clientName = safeString(body?.client_name, 120);
  const redirectUris = body?.redirect_uris;
  if (
    !clientName
    || !Array.isArray(redirectUris)
    || redirectUris.length < 1
    || redirectUris.length > 10
    || redirectUris.some((uri) => !validRedirectUri(uri))
  ) {
    throw new OAuthError("Valid client_name and redirect_uris are required.", 400);
  }
  const clientUri = body?.client_uri === undefined ? null : safeString(body.client_uri, 2048);
  if (body?.client_uri !== undefined && (!clientUri || !clientUri.startsWith("https://") || !validRedirectUri(clientUri))) {
    throw new OAuthError("client_uri must be a valid HTTPS URL.", 400);
  }
  const clientId = randomUUID();
  const client: OAuthClient = {
    client_id: clientId,
    client_name: clientName,
    client_uri: clientUri,
    redirect_uris: redirectUris as string[],
    created_at: new Date().toISOString(),
  };
  await db.collection("oauth_clients").doc(clientId).create(client);
  return {
    ...client,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: supportedScopes.join(" "),
  };
}

async function beginAuthorization(request: HttpRequest, response: HttpResponse) {
  const clientId = requestValue(request, "client_id");
  const redirectUri = requestValue(request, "redirect_uri");
  const responseType = requestValue(request, "response_type");
  const state = requestValue(request, "state");
  const codeChallenge = requestValue(request, "code_challenge");
  const codeChallengeMethod = requestValue(request, "code_challenge_method");
  const requestedResource = requestValue(request, "resource");
  const requestedScope = requestValue(request, "scope") ?? "mcp:tools";
  if (!clientId || !redirectUri || responseType !== "code" || !state || state.length > 512) {
    throw new OAuthError("Missing or invalid OAuth authorization parameters.", 400);
  }
  if (!codeChallenge || codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw new OAuthError("PKCE with S256 is required.", 400);
  }
  const scopes = [...new Set(requestedScope.split(/\s+/).filter(Boolean))];
  if (!scopes.includes("mcp:tools") || scopes.some((scope) => !supportedScopes.includes(scope))) {
    throw new OAuthError("Unsupported OAuth scope.", 400, "invalid_scope");
  }
  if (requestedResource && requestedResource !== oauthResource()) {
    throw new OAuthError("Invalid resource indicator.", 400, "invalid_target");
  }
  const client = await publicClient(clientId);
  if (!client.redirect_uris.includes(redirectUri)) {
    throw new OAuthError("redirect_uri is not registered for this client.", 400, "invalid_request");
  }

  const authorizationId = randomUUID();
  const now = new Date();
  const record: AuthorizationRecord = {
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    scope: scopes,
    resource: oauthResource(),
    status: "pending",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
  };
  await db.collection("oauth_authorizations").doc(authorizationId).create(record);
  const consentUrl = new URL(`${issuer()}/.lovable/oauth/consent`);
  consentUrl.searchParams.set("authorization_id", authorizationId);
  response.redirect(302, consentUrl.toString());
}

async function authorizationDetails(
  authorizationId: string,
  request: HttpRequest,
) {
  await authenticateFirebaseUser(request);
  const snapshot = await db.collection("oauth_authorizations").doc(authorizationId).get();
  if (!snapshot.exists) throw new OAuthError("Authorization request not found.", 404);
  const record = snapshot.data() as AuthorizationRecord;
  if (record.status !== "pending" || new Date(record.expires_at).getTime() <= Date.now()) {
    throw new OAuthError("Authorization request is no longer available.", 410);
  }
  const client = await publicClient(record.client_id);
  return {
    client: {
      name: client.client_name,
      client_uri: client.client_uri,
      redirect_uris: client.redirect_uris,
    },
    redirect_uri: record.redirect_uri,
    scopes: record.scope,
    scope: record.scope.join(" "),
  };
}

async function decideAuthorization(
  authorizationId: string,
  request: HttpRequest,
) {
  const identity = await authenticateFirebaseUser(request);
  const approved = request.body?.approved;
  if (typeof approved !== "boolean") throw new OAuthError("approved must be a boolean.", 400);
  const authorizationRef = db.collection("oauth_authorizations").doc(authorizationId);
  const now = new Date();
  const code = approved ? randomBytes(32).toString("base64url") : null;
  const record = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(authorizationRef);
    if (!snapshot.exists) throw new OAuthError("Authorization request not found.", 404);
    const current = snapshot.data() as AuthorizationRecord;
    if (current.status !== "pending" || new Date(current.expires_at).getTime() <= now.getTime()) {
      throw new OAuthError("Authorization request is no longer available.", 410);
    }
    transaction.update(authorizationRef, {
      status: approved ? "approved" : "denied",
      user_id: identity.uid,
      ...(approved && code ? {
        code_hash: hash(code),
        code_expires_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
      } : {}),
      decided_at: now.toISOString(),
    });
    return current;
  });

  const redirect = new URL(record.redirect_uri);
  if (approved && code) redirect.searchParams.set("code", code);
  else redirect.searchParams.set("error", "access_denied");
  redirect.searchParams.set("state", record.state);
  return { redirect_url: redirect.toString() };
}

function formValue(request: HttpRequest, key: string) {
  const value = request.body?.[key];
  return typeof value === "string" ? value : null;
}

async function consumeAuthorizationCode(request: HttpRequest) {
  const clientId = formValue(request, "client_id");
  const code = formValue(request, "code");
  const redirectUri = formValue(request, "redirect_uri");
  const verifier = formValue(request, "code_verifier");
  if (formValue(request, "grant_type") !== "authorization_code" || !clientId || !code || !redirectUri || !verifier) {
    throw new OAuthError("Invalid authorization-code request.", 400, "invalid_request");
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new OAuthError("Invalid PKCE code_verifier.", 400, "invalid_grant");
  }
  const client = await publicClient(clientId);
  const codeHash = hash(code);
  const match = await db.collection("oauth_authorizations").where("code_hash", "==", codeHash).limit(1).get();
  const authorizationRef = match.docs[0]?.ref;
  if (!authorizationRef) throw new OAuthError("Authorization code is invalid or expired.", 400, "invalid_grant");

  const authorization = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(authorizationRef);
    if (!snapshot.exists) throw new OAuthError("Authorization code is invalid or expired.", 400, "invalid_grant");
    const record = snapshot.data() as AuthorizationRecord;
    if (
      record.status !== "approved"
      || record.client_id !== client.client_id
      || record.redirect_uri !== redirectUri
      || record.code_hash !== codeHash
      || (record.code_expires_at ? new Date(record.code_expires_at).getTime() : 0) <= Date.now()
    ) {
      throw new OAuthError("Authorization code is invalid or expired.", 400, "invalid_grant");
    }
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (challenge !== record.code_challenge) {
      throw new OAuthError("PKCE verification failed.", 400, "invalid_grant");
    }
    transaction.update(authorizationRef, {
      status: "consumed",
      code_hash: null,
      code_used_at: new Date().toISOString(),
    });
    return record;
  });
  if (!authorization.user_id) throw new OAuthError("Authorization user is missing.", 400, "invalid_grant");
  const { privateKey, kid } = await oauthKeys();
  const accessToken = await new SignJWT({
    client_id: client.client_id,
    scope: authorization.scope.join(" "),
    resource: authorization.resource,
  })
    .setProtectedHeader({ alg: "RS256", kid, typ: "at+jwt" })
    .setIssuer(issuer())
    .setSubject(authorization.user_id)
    .setAudience(projectId)
    .setIssuedAt()
    .setExpirationTime(`${tokenLifetimeSeconds}s`)
    .setJti(randomUUID())
    .sign(privateKey);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: tokenLifetimeSeconds,
    scope: authorization.scope.join(" "),
  };
}

async function serveMcpData(request: HttpRequest) {
  const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new OAuthError("A bearer token is required.", 401, "invalid_token");
  const { publicKey } = await oauthKeys();
  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, publicKey, { issuer: issuer(), audience: projectId });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    throw new OAuthError("Access token is invalid or expired.", 401, "invalid_token");
  }
  const userId = typeof claims.sub === "string" ? claims.sub : "";
  const scopes = typeof claims.scope === "string" ? claims.scope.split(/\s+/) : [];
  if (
    !userId
    || typeof claims.client_id !== "string"
    || claims.resource !== oauthResource()
    || !scopes.includes("mcp:tools")
  ) {
    throw new OAuthError("Access token is not authorized for HealthReachCare tools.", 403, "insufficient_scope");
  }
  const account = await getAuth(app).getUser(userId);
  if (account.disabled) throw new OAuthError("Firebase account is disabled.", 403, "invalid_token");

  const body = request.body as { name?: unknown; args?: unknown } | null;
  const args = body?.args && typeof body.args === "object" && !Array.isArray(body.args)
    ? body.args as Record<string, unknown>
    : {};
  let data: unknown;
  switch (body?.name) {
    case "mcp_whoami": {
      const [{ docs: profiles }, { docs: roles }] = await Promise.all([
        db.collection("profiles").where("user_id", "==", userId).limit(1).get(),
        db.collection("user_roles").where("user_id", "==", userId).limit(1).get(),
      ]);
      data = {
        user_id: userId,
        email: account.email ?? null,
        role: roles[0]?.get("role") ?? "patient",
        profile: profiles[0] ? {
          user_id: userId,
          full_name: profiles[0].get("full_name") ?? null,
          organization_name: profiles[0].get("organization_name") ?? null,
          phone: profiles[0].get("phone") ?? null,
          approval_status: profiles[0].get("approval_status") ?? null,
        } : null,
      };
      break;
    }
    case "mcp_list_my_orders": {
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit)
        ? Math.min(50, Math.max(1, args.limit))
        : 10;
      let query: Query<DocumentData> = db.collection("orders")
        .where("patient_id", "==", userId)
        .orderBy("created_at", "desc")
        .limit(limit);
      if (typeof args.status === "string" && args.status) {
        query = db.collection("orders")
          .where("patient_id", "==", userId)
          .where("status", "==", args.status)
          .orderBy("created_at", "desc")
          .limit(limit);
      }
      const snapshot = await query.get();
      data = snapshot.docs.map((document) => {
        const row = document.data();
        return {
          id: document.id,
          status: row.status,
          total_amount: row.total_amount,
          medication_name: row.medication_name,
          quantity: row.quantity,
          created_at: asIsoString(row.created_at),
          pharmacy_id: row.pharmacy_id,
          delivery_address: row.delivery_address,
        };
      });
      break;
    }
    case "mcp_list_my_prescriptions": {
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit)
        ? Math.min(50, Math.max(1, args.limit))
        : 10;
      const snapshot = await db.collection("prescriptions")
        .where("patient_id", "==", userId)
        .orderBy("created_at", "desc")
        .limit(limit)
        .get();
      data = snapshot.docs.map((document) => {
        const row = document.data();
        return {
          id: document.id,
          medication_name: row.medication_name,
          dosage: row.dosage,
          doctor_name: row.doctor_name,
          is_active: row.is_active,
          notes: row.notes,
          created_at: asIsoString(row.created_at),
        };
      });
      break;
    }
    case "mcp_search_medications": {
      const queryText = typeof args.query === "string" ? args.query.trim().slice(0, 200).toLowerCase() : "";
      if (!queryText) throw new OAuthError("A medication search query is required.", 400);
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit)
        ? Math.min(50, Math.max(1, args.limit))
        : 15;
      const snapshot = await db.collection("medications").where("stock_quantity", ">", 0).get();
      data = snapshot.docs.flatMap((document) => {
        const row = document.data();
        const searchable = [row.name, row.description, row.category]
          .filter((value) => typeof value === "string")
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(queryText)) return [];
        return [{
          id: document.id,
          pharmacy_id: row.pharmacy_id,
          name: row.name,
          description: row.description,
          category: row.category,
          price: row.price,
          requires_prescription: row.requires_prescription,
          stock_quantity: row.stock_quantity,
        }];
      }).slice(0, limit);
      break;
    }
    default:
      throw new OAuthError("Unknown MCP data action.", 404);
  }
  return data;
}

export const mcpOAuth = onRequest(
  { region: "us-central1", secrets: [signingKeySecret] },
  async (request, response) => {
    cors(response);
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    const path = request.path.replace(/^\/mcpOAuth(?=\/|$)/, "") || "/";
    try {
      if (path === "/jwks" && request.method === "GET") {
        const { jwk } = await oauthKeys();
        response.set("Cache-Control", "public, max-age=3600").json({ keys: [jwk] });
        return;
      }
      if (path === "/register" && request.method === "POST") {
        response.status(201).json(await registerClient(request));
        return;
      }
      if (path === "/authorize" && request.method === "GET") {
        await beginAuthorization(request, response);
        return;
      }
      const authPath = path.match(/^\/authorization\/([0-9a-f-]{36})(?:\/(decision))?$/i);
      if (authPath && request.method === "GET" && !authPath[2]) {
        response.json(await authorizationDetails(authPath[1], request));
        return;
      }
      if (authPath && request.method === "POST" && authPath[2] === "decision") {
        response.json(await decideAuthorization(authPath[1], request));
        return;
      }
      if (path === "/token" && request.method === "POST") {
        response.set("Cache-Control", "no-store").json(await consumeAuthorizationCode(request));
        return;
      }
      response.status(404).json({ error: "not_found", error_description: "OAuth endpoint not found." });
    } catch (error) {
      oauthError(response, error);
    }
  },
);

export const mcpData = onRequest(
  { region: "us-central1", secrets: [signingKeySecret] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ error: { message: "POST is required." } });
      return;
    }
    try {
      response.status(200).json({ data: await serveMcpData(request) });
    } catch (error) {
      if (error instanceof OAuthError) {
        response.status(error.status).json({ error: { message: error.message } });
        return;
      }
      console.error("MCP data request failed.", error);
      response.status(500).json({ error: { message: "MCP data request failed." } });
    }
  },
);
