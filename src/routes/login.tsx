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

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

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

          {isAdminMode ? (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Seeded admin accounts</p>
              <p>admin1@healthreach.co.za / Admin1Pass!2025</p>
              <p>admin2@healthreach.co.za / Admin2Pass!2025</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
