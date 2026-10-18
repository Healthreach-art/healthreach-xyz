import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, AlertCircle, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — HealthReachCare" },
      { name: "description", content: "Request a HealthReachCare password reset email." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    let resetError: { message: string } | null = null;
    try {
      const { firebaseSendPasswordReset } = await import("@/lib/firebase-auth");
      await firebaseSendPasswordReset(email.trim());
    } catch (err) {
      resetError = { message: err instanceof Error ? err.message : "Could not send reset email." };
    }

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-healthcare-green/20">
            <CheckCircle className="h-6 w-6 text-healthcare-green" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Check Your Email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a password reset link to <strong>{email.trim()}</strong>. Open it from your email to choose a new password.
          </p>
          <Link to="/login">
            <Button variant="outline" className="mt-6">Back to Login</Button>
          </Link>
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
              <Mail className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Forgot Password?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter your email and we'll send a reset link</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">Back to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
