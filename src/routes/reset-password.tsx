import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, type FormEvent } from "react";
import { Lock, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset Password — HealthReachCare" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [actionCode, setActionCode] = useState<string | null>(null);
  const [canChangeSignedInPassword, setCanChangeSignedInPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkRecoverySession = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("oobCode");
      if (url.searchParams.get("mode") === "resetPassword") {
        if (!code) {
          if (mounted) {
            setError("This password reset link is incomplete. Request a new link and try again.");
            setReady(true);
          }
          return;
        }
        try {
          const { firebaseVerifyPasswordResetCode } = await import("@/lib/firebase-auth");
          await firebaseVerifyPasswordResetCode(code);
          if (!mounted) return;
          setActionCode(code);
          setError("");
          window.history.replaceState({}, "", "/reset-password");
        } catch (error) {
          if (!mounted) return;
          setError(error instanceof Error ? error.message : "This password reset link is invalid or has expired.");
        }
        if (mounted) setReady(true);
        return;
      }
      try {
        const { getFirebaseCurrentUser } = await import("@/lib/firebase-auth");
        const user = await getFirebaseCurrentUser();
        if (!mounted) return;
        if (!user) {
          setError("Open the reset link from your email first, then enter your new password here.");
        } else {
          setCanChangeSignedInPassword(true);
        }
      } catch (sessionError) {
        if (!mounted) return;
        setError(sessionError instanceof Error ? sessionError.message : "Could not check your Firebase sign-in.");
      }
      if (mounted) setReady(true);
    };
    void checkRecoverySession();

    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!actionCode && !canChangeSignedInPassword) {
      setError("Open a valid reset link from your email before choosing a new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (actionCode) {
        const { firebaseConfirmPasswordReset } = await import("@/lib/firebase-auth");
        await firebaseConfirmPasswordReset(actionCode, password);
      } else {
        const { firebaseUpdateCurrentPassword, firebaseSignOut } = await import("@/lib/firebase-auth");
        await firebaseUpdateCurrentPassword(password);
        await firebaseSignOut();
      }
      setSuccess(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the password.");
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
          <h2 className="text-xl font-bold text-foreground">Password Updated!</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your password has been successfully reset. Sign in again with your new password.</p>
          <Button className="mt-6" onClick={() => navigate({ to: "/login" })}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 text-center max-w-md">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Checking your reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="healthcare-card p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full healthcare-gradient">
              <Lock className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter your new password</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || (!actionCode && !canChangeSignedInPassword)}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
