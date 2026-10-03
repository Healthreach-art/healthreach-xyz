import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

type AuthDetails = {
  client?: { name?: string; client_uri?: string; redirect_uris?: string[] };
  redirect_url?: string;
  scope?: string;
  scopes?: string[];
};

const oauthFunctionUrl = (
  process.env.MCP_OAUTH_FUNCTION_URL
  ?? "https://us-central1-healthreachcare-prod.cloudfunctions.net/mcpOAuth"
).replace(/\/+$/, "");

async function oauthRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await firestoreClient.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw error ?? new Error("You must be signed in to continue.");

  const response = await fetch(`${oauthFunctionUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null) as
    | (T & { error_description?: string; error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error_description ?? result?.error ?? `OAuth request failed (${response.status}).`);
  }
  if (!result) throw new Error("OAuth server returned an invalid response.");
  return result;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) {
      throw new Error("Missing authorization_id");
    }
    const { data } = await firestoreClient.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const params = new URLSearchParams(location.search);
    const authorizationId = params.get("authorization_id")!;
    return oauthRequest<AuthDetails>(`/authorization/${encodeURIComponent(authorizationId)}`);
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Authorization request unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    firestoreClient.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const data = await oauthRequest<AuthDetails>(
        `/authorization/${encodeURIComponent(authorization_id)}/decision`,
        { approved: approve },
      );
      const target = data.redirect_url;
      if (!target) throw new Error("No redirect returned by the authorization server.");
      window.location.href = target;
    } catch (requestError) {
      setBusy(false);
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  const clientName = details?.client?.name ?? "an app";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(" ").filter(Boolean) : []);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center px-4 py-10">
      <div className="w-full rounded-2xl border border-border/60 bg-card/90 p-7 shadow-xl backdrop-blur">
        <div className="mb-5 flex items-center gap-3">
          <div className="healthcare-gradient flex h-10 w-10 items-center justify-center rounded-full">
            <ShieldCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Connect {clientName} to HealthReachCare</h1>
            {email && <p className="text-xs text-muted-foreground">Signed in as {email}</p>}
          </div>
        </div>

        <p className="text-sm text-foreground/90">
          This lets <span className="font-medium">{clientName}</span> use HealthReachCare tools as you — reading your profile, orders, prescriptions, and the medication catalog.
        </p>

        {scopes.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            {scopes.map((s: string) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          This does not bypass HealthReachCare permissions — data access still follows your account's role and policies.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button disabled={busy} onClick={() => decide(true)} className="sm:flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="sm:flex-1">
            Cancel connection
          </Button>
        </div>
      </div>
    </main>
  );
}
