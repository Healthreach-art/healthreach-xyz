import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/link-account")({
  head: () => ({ meta: [{ title: "Link Google Account — HealthReachCareCare" }] }),
  component: LinkAccount,
});

type Identity = { provider: string; id: string };

function LinkAccount() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate({ to: "/login", search: { redirect: "/link-account" } as any });
      return;
    }
    setEmail(user.email ?? "");
    setIdentities((user.identities ?? []) as Identity[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const hasGoogle = identities.some((i) => i.provider === "google");
  const hasEmail = identities.some((i) => i.provider === "email");

  const linkGoogle = async () => {
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/link-account` },
    } as any);
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  const unlinkGoogle = async () => {
    setError("");
    const google = identities.find((i) => i.provider === "google");
    if (!google) return;
    setBusy(true);
    const { error } = await supabase.auth.unlinkIdentity(google as any);
    setBusy(false);
    if (error) setError(error.message);
    else refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md healthcare-card p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full healthcare-gradient">
            <Link2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Linked accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as <strong>{email}</strong></p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <ul className="space-y-3 mb-6">
          <li className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Email & password</span>
            {hasEmail ? <CheckCircle className="h-4 w-4 text-healthcare-green" /> : <span className="text-xs text-muted-foreground">Not linked</span>}
          </li>
          <li className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Google</span>
            {hasGoogle ? (
              <Button size="sm" variant="outline" onClick={unlinkGoogle} disabled={busy || identities.length < 2}>
                Unlink
              </Button>
            ) : (
              <Button size="sm" onClick={linkGoogle} disabled={busy}>
                Link Google
              </Button>
            )}
          </li>
        </ul>

        <p className="text-xs text-muted-foreground text-center">
          Linking lets you sign in with either method using the same account. Google sign-in must use the same email as your account.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/" className="text-primary hover:underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
