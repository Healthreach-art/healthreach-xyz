import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { claimAdminWithCode } from "@/lib/admin.functions";
import { ShieldCheck, AlertCircle, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/signup/admin")({
  head: () => ({
    meta: [
      { title: "Admin Signup — HealthReachCare" },
      { name: "description", content: "Create a HealthReachCare admin account with an invite code." },
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

    try {
      const { firebaseSendEmailVerification, firebaseSignUp, getFirebaseCurrentUser } = await import("@/lib/firebase-auth");
      const cleanEmail = email.trim();
      let user = await getFirebaseCurrentUser();
      if (user && user.email?.toLowerCase() !== cleanEmail.toLowerCase()) {
        setError("A different account is signed in. Sign out first, then continue with the account you want to enroll.");
        return;
      }

      if (!user) {
        user = await firebaseSignUp(cleanEmail, password, fullName);
        const { syncProfileToFirestore } = await import("@/lib/firestore-sync");
        await syncProfileToFirestore({
          uid: user.uid,
          email: cleanEmail,
          fullName,
          role: "patient",
        });
        try {
          const sent = await firebaseSendEmailVerification();
          await navigate({ to: "/auth/verify-email", search: { sent: sent ? "1" : undefined, admin: "1" }, replace: true });
        } catch (sendError) {
          console.error("[auth] Admin signup verification email could not be sent.", sendError);
          await navigate({ to: "/auth/verify-email", search: { sendError: "1", admin: "1" }, replace: true });
        }
        return;
      }

      if (!user.emailVerified) {
        const sent = await firebaseSendEmailVerification();
        await navigate({ to: "/auth/verify-email", search: { sent: sent ? "1" : undefined, admin: "1" }, replace: true });
        return;
      }

      await claim({ data: { code: code.trim() } });
      setSuccess(true);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setError(
        code === "auth/email-already-in-use"
          ? "This email already has an account. Sign in to that account, then return here to complete the administrator invite check."
          : e instanceof Error ? e.message : "Could not complete administrator enrollment.",
      );
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
          <Button className="mt-6" onClick={() => navigate({ to: "/login", search: { mode: "admin" } })}>
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
            <p className="mt-1 text-sm text-muted-foreground">
              Restricted — verify your email first, then complete the invite-code check. Verification never grants admin access.
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
            <Link to="/login" search={{ mode: "admin" }} className="text-muted-foreground hover:text-foreground hover:underline">
              ← Back to admin sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
