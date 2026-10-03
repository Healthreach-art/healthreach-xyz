import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { firestoreClient } from "@/lib/firestore-client";
import { deleteMyAccount } from "@/lib/account.functions";

interface Props {
  /** Render style. "sidebar" matches SidebarMenuButton, "inline" is a normal button row. */
  variant?: "sidebar" | "inline";
  collapsed?: boolean;
}

export function DeleteAccountButton({ variant = "sidebar", collapsed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const callDelete = useServerFn(deleteMyAccount);

  const run = async () => {
    if (confirm.trim().toUpperCase() !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    setBusy(true);
    try {
      await callDelete();
      // Clear local session and reload to a fresh state.
      try { await firestoreClient.auth.signOut(); } catch { /* ignore */ }
      toast.success("Account deleted. You can sign up again any time.");
      window.location.href = "/";
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete account");
      setBusy(false);
    }
  };

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4" />
        {!collapsed && <span>Delete account</span>}
      </button>
    ) : (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4" /> Delete my account
      </button>
    );

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your HealthReachCare account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your profile, orders, prescriptions, documents,
            wallet, ratings and every other record tied to this account. The same
            email will then be able to sign up fresh. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-del">Type <span className="font-mono font-bold">DELETE</span> to confirm</Label>
          <Input id="confirm-del" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus placeholder="DELETE" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || confirm.trim().toUpperCase() !== "DELETE"}
            onClick={(e) => { e.preventDefault(); void run(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…</> : "Delete forever"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
