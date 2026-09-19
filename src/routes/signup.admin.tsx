import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { claimAdminWithCode } from "@/lib/admin.functions";
import { ShieldCheck, AlertCircle, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/signup/admin")({
  head: () => ({
    meta: [
      { title: "Admin Signup — HealthReachCareCare" },
      { name: "description", content: "Create a HealthReachCareCare admin account with an invite code." },
    ],
  }),
  component: AdminSignupPage,
});

function AdminSignupPage() {
  const navigate = useNavigate();
  const claim = useServerFn(claimAdminWithCode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 1. Sign up as a normal user (the DB trigger inserts the default patient role)
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName, role: "patient" },
        emailRedirectTo: window.location.origin,
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. If auto-confirm is on, the user is already signed in — claim admin now.
    // Otherwise instruct them to sign in then revisit.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      // Try password sign-in (covers projects where auto-confirm is off but
      // user can still sign in immediately if they verified by email already).
      await supabase.auth.signInWithPassword({ email: email.trim(), password });
    }

    try {
      await claim({ data: { code: code.trim() } });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Could not verify invite code. Sign in and retry.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-healthcare-green/20">
            <CheckCircle className="h-6 w-6 text-healthcare-green" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Admin Access Granted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account has admin privileges. Sign in to open the admin master control.
          </p>
          <Button className="mt-6" onClick={() => navigate({ to: "/login", search: { mode: "admin" } as any })}>
            Go to Admin Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="healthcare-card p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-foreground">
              <ShieldCheck className="h-5 w-5 text-background" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Create Admin Account</h1>
            <p className="mt-1 text-sm text-muted-foreground">Restricted — requires a valid invite code</p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Admin Invite Code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required minLength={4} maxLength={128} placeholder="Provided privately" />
              <p className="text-[11px] text-muted-foreground">Issued by the platform owner. Treat like a password.</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating admin..." : "Create Admin Account"}
            </Button>
          </form>

          <div className="mt-4 text-center text-xs">
            <Link to="/login" search={{ mode: "admin" } as any} className="text-muted-foreground hover:text-foreground hover:underline">
              ← Back to admin sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
