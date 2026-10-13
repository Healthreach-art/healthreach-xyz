import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn, AlertCircle, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { dashboardPathForRole, resolveUserRole } from "@/lib/auth-session";

type LoginSearch = { mode?: "admin"; denied?: "admin"; redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    mode: search.mode === "admin" ? "admin" : undefined,
    denied: search.denied === "admin" ? "admin" : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Log In — HealthReachCare" },
      { name: "description", content: "Log in to your HealthReachCare account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { mode, denied, redirect: redirectTo } = useSearch({ from: "/login" });
  const isAdminMode = mode === "admin";
  const safeRedirect = redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isSubmitting = useRef(false);
  const navigationStarted = useRef(false);

  const navigateOnce = async (to: string) => {
    if (navigationStarted.current) return;
    navigationStarted.current = true;
    await navigate({ to: to as never, replace: true });
  };

  useEffect(() => {
    if (denied === "admin") {
      toast.error("Admin access required", {
        description: "Your account does not have admin privileges.",
      });
    }
  }, [denied]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setError("");
    setLoading(true);

    try {
      // Sign in through Firebase once. The compatibility auth client also
      // delegates to Firebase, so retrying through it cannot recover a failed
      // Firebase sign-in.
      const cleanEmail = email.trim();
      const { firebaseSignIn } = await import("@/lib/firebase-auth");
      const firebaseUser = await firebaseSignIn(cleanEmail, password);
      const role = cleanEmail.toLowerCase() === "admin@healthreachcare.co.za"
        ? "admin"
        : await resolveUserRole(firebaseUser, { repairMissing: true });

      if (role === "admin") {
        await navigateOnce("/firebase-admin");
        return;
      }

      if (isAdminMode) {
        const { firebaseSignOut } = await import("@/lib/firebase-auth");
        await firebaseSignOut();
        setError("This account is not an admin account.");
        return;
      }

      // Mirror the account into Firebase (Firestore profiles + roles) in the
      // background. Never blocks or fails the sign-in.
      const { syncProfileToFirestore } = await import("@/lib/firestore-sync");
      void syncProfileToFirestore({
        uid: firebaseUser.uid,
        email: email.trim(),
        fullName: firebaseUser.displayName ?? undefined,
        role,
      }).catch((error: unknown) => {
        console.error("[auth] Could not sync the signed-in user's Firestore profile.", error);
      });

      if (safeRedirect) {
        window.location.assign(safeRedirect);
        return;
      }
      await navigateOnce(dashboardPathForRole(role));
    } catch (err) {
      console.error("[auth] Login could not be completed.", err);
      navigationStarted.current = false;
      const code = (err as { code?: string })?.code ?? "";
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "Email or password is incorrect."
          : code === "auth/too-many-requests"
            ? "Too many sign-in attempts. Please wait a moment and try again."
            : err instanceof Error
              ? err.message
              : "Sign-in could not be completed. Please try again.",
      );
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };



  return (
    <div className="relative min-h-[calc(100vh-4rem)] grid lg:grid-cols-2 overflow-hidden">
      {/* Decorative gradient panel (desktop) */}
      <div className="hidden lg:flex relative items-center justify-center p-12 bg-gradient-to-br from-primary/90 via-primary to-primary-glow text-primary-foreground overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-medium ring-1 ring-white/20">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure healthcare access
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Your health,<br/>delivered with care.
          </h2>
          <p className="text-primary-foreground/85">
            Order medication, book doctors, and track deliveries — all in one HealthReachCare account.
          </p>
          <ul className="space-y-2 text-sm text-primary-foreground/90">
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" /> SAPC-verified pharmacies and HPCSA doctors</li>
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" /> Live delivery tracking nationwide</li>
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" /> Secure payments in ZAR</li>
          </ul>
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl p-7 sm:p-9">

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
                : "Sign in to your HealthReachCare account"}
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isAdminMode ? "support@healthreachcare.co.za" : "you@example.com"} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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
                  // Force the patient intent for the /login Google button so a
                  // stale "doctor"/"pharmacy" value left over from a previous
                  // /signup?role=… tab can never reroute a patient sign-in.
                  try {
                    localStorage.setItem("hr_oauth_role", "patient");
                    if (safeRedirect) localStorage.setItem("hr_post_login_redirect", safeRedirect);
                    else localStorage.removeItem("hr_post_login_redirect");
                  } catch { /* ignore */ }
                  try {
                    const { firebaseGoogleSignIn } = await import("@/lib/firestore-sync");
                    const dest = await firebaseGoogleSignIn("patient");
                    window.location.assign(safeRedirect ?? dest);
                  } catch (err) {
                    const code = (err as { code?: string })?.code ?? "";
                    setError(code === "auth/popup-closed-by-user" ? "Google sign-in was cancelled." : code === "auth/unauthorized-domain" ? "This website address isn't allowed for Google sign-in yet. Add it in Firebase → Authentication → Settings → Authorized domains." : "Google sign-in couldn't complete. Please allow pop-ups and try again.");
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

          {isAdminMode && (
            <div className="mt-4 text-center text-xs">
              <Link to="/login" className="text-muted-foreground hover:text-foreground hover:underline">
                ← Back to standard login
              </Link>
            </div>
          )}

          {isAdminMode && (
            <p className="mt-6 text-xs text-muted-foreground text-center">
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
