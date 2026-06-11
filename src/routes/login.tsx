import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Link } from "@tanstack/react-router";
import { LogIn, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type LoginSearch = { mode?: "admin"; denied?: "admin"; redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    mode: search.mode === "admin" ? "admin" : undefined,
    denied: search.denied === "admin" ? "admin" : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Log In — HEALTHREACH" },
      { name: "description", content: "Log in to your HEALTHREACH account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { mode, denied } = useSearch({ from: "/login" });
  const isAdminMode = mode === "admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (denied === "admin") {
      toast.error("Admin access required", {
        description: "Your account does not have admin privileges.",
      });
    }
  }, [denied]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Fetch role to redirect to correct dashboard
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const role = roleData?.role || "patient";

      if (isAdminMode && role !== "admin") {
        await supabase.auth.signOut();
        setError("This account is not an admin account. Please use an admin login or switch to the standard login.");
        setLoading(false);
        return;
      }

      navigate({ to: `/dashboard/${role}` as any });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="healthcare-card p-8">
          <div className="mb-6 text-center">
            <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${isAdminMode ? "bg-foreground" : "healthcare-gradient"}`}>
              {isAdminMode ? (
                <ShieldCheck className="h-5 w-5 text-background" />
              ) : (
                <LogIn className="h-5 w-5 text-primary-foreground" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {isAdminMode ? "Admin Sign In" : "Welcome Back"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdminMode
                ? "Restricted area — admin accounts only"
                : "Sign in to your HEALTHREACH account"}
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isAdminMode ? "admin@healthreach.co.za" : "you@example.com"} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : isAdminMode ? "Sign in as Admin" : "Sign In"}
            </Button>
          </form>

          {!isAdminMode && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">OR</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  setError("");
                  const result = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: `${window.location.origin}/auth/callback`,
                  });
                  if (result.error) {
                    setError(result.error.message ?? "Google sign-in failed");
                  }
                }}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.5-.2-3-.4-4.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 7 29.5 5 24 5 16 5 9 9.6 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 45c5.4 0 10.3-2 14-5.3l-6.5-5.3c-2 1.4-4.6 2.3-7.5 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9 41 16 45 24 45z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.5 5.3c-.5.4 7-5 7-13 0-1.5-.2-3-.4-4.5z"/>
                </svg>
                Continue with Google
              </Button>
            </>
          )}

          {!isAdminMode && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary font-medium hover:underline">
                Sign up
              </Link>
            </p>
          )}

          <div className="mt-4 text-center text-xs">
            {isAdminMode ? (
              <Link to="/login" className="text-muted-foreground hover:text-foreground hover:underline">
                ← Back to standard login
              </Link>
            ) : (
              <Link to="/login" search={{ mode: "admin" }} className="text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Admin sign in
              </Link>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium text-foreground mb-2">Demo logins (click to fill)</p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { label: "Admin", email: "admin.demo@healthreach.co.za", pw: "DemoAdmin!2025" },
                { label: "Patient", email: "patient.demo@healthreach.co.za", pw: "DemoPass!2025" },
                { label: "Pharmacy", email: "pharmacy.demo@healthreach.co.za", pw: "DemoPass!2025" },
                { label: "Doctor", email: "doctor.demo@healthreach.co.za", pw: "DemoPass!2025" },
                { label: "Driver", email: "driver.demo@healthreach.co.za", pw: "DemoPass!2025" },
              ].map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.pw); setError(""); }}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-left text-[11px] hover:bg-accent transition"
                >
                  <span className="font-semibold text-foreground w-16 shrink-0">{d.label}</span>
                  <span className="text-muted-foreground truncate flex-1">{d.email}</span>
                </button>
              ))}
            </div>
            {isAdminMode && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Need a personal admin account?{" "}
                <Link to="/signup/admin" className="text-primary font-medium hover:underline">
                  Create one with an invite code
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
