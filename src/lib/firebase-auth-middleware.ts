import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getFirebaseIfReady } from "./firebase";

// Only attach a token when Firebase is already running. Starting Firebase
// here would call the config server function, which runs this middleware
// again — an endless loop.
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | null = null;
    const services = getFirebaseIfReady();
    if (services) {
      try {
        await services.auth.authStateReady();
        token = services.auth.currentUser ? await services.auth.currentUser.getIdToken() : null;
      } catch {
        token = null;
      }
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

export async function verifyFirebaseIdToken(token: string) {
  const apiKey = (process.env.GOOGLE_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Response("Firebase API key is not configured", { status: 500 });
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!response.ok) {
    throw new Response("Unauthorized: Invalid Firebase ID token", { status: 401 });
  }

  const payload = (await response.json()) as {
    users?: Array<{ localId?: string }>;
  };
  const userId = payload.users?.[0]?.localId;
  if (!userId) {
    throw new Response("Unauthorized: Firebase token has no user ID", { status: 401 });
  }

  const encodedClaims = token.split(".")[1];
  const claims = encodedClaims
    ? JSON.parse(atob(encodedClaims.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>
    : {};
  const verifiedClaims: Record<string, unknown> & { sub: string } = { ...claims, sub: userId };
  return { userId, claims: verifiedClaims };
}

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const token = getRequest()?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new Response("Unauthorized: No Firebase ID token provided", { status: 401 });
    }

    const { userId, claims } = await verifyFirebaseIdToken(token);
    return next({
      context: {
        userId,
        idToken: token,
        claims,
      },
    });
  },
);
