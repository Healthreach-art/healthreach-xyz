import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

type AuthDetails = {
  client?: { name?: string; client_uri?: string; redirect_uris?: string[] };
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
};

type SupabaseOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
};

function oauthApi(): SupabaseOAuth {
  return (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;
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
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const params = new URLSearchParams(location.search);
    const authorizationId = params.get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      throw redirect({ href: immediate });
    }
    return data;
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
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
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
            <h1 className="text-lg font-semibold leading-tight">Connect {clientName} to HealthReachCareCare</h1>
            {email && <p className="text-xs text-muted-foreground">Signed in as {email}</p>}
          </div>
        </div>

        <p className="text-sm text-foreground/90">
          This lets <span className="font-medium">{clientName}</span> use HealthReachCareCare tools as you — reading your profile, orders, prescriptions, and the medication catalog.
        </p>

        {scopes.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            {scopes.map((s: string) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          This does not bypass HealthReachCareCare permissions — data access still follows your account's role and policies.
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
