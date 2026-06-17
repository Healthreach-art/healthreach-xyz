import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileSearch, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export type PharmacyApprovalStatus = "pending" | "approved" | "rejected" | "suspended" | "under_review" | "expired";

const DOC_LABELS: Record<string, string> = {
  license_path: "Pharmacy operating licence",
  pharmacist_cert_path: "Pharmacist registration certificate",
  business_reg_path: "Business registration",
  tax_cert_path: "Tax registration",
  proof_of_address_path: "Proof of physical address",
  bank_confirmation_path: "Bank confirmation",
};

interface DocReview {
  status?: "approved" | "rejected" | "under_review";
  notes?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

interface DocsRow {
  license_path?: string | null;
  pharmacist_cert_path?: string | null;
  business_reg_path?: string | null;
  tax_cert_path?: string | null;
  proof_of_address_path?: string | null;
  bank_confirmation_path?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  document_reviews?: Record<string, DocReview> | null;
}

interface ProfileRow {
  organization_name?: string | null;
  license_number?: string | null;
  license_expires_at?: string | null;
  pharmacist_name?: string | null;
  pharmacist_council_number?: string | null;
  business_reg_number?: string | null;
  tax_number?: string | null;
  address?: string | null;
  phone?: string | null;
}

export function PharmacyReviewDialog({
  pharmacyId,
  pharmacyName,
  currentStatus,
  onChanged,
  updating,
}: {
  pharmacyId: string;
  pharmacyName: string;
  currentStatus: PharmacyApprovalStatus;
  onChanged: (status: PharmacyApprovalStatus, notes?: string) => void;
  updating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<DocsRow | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [docNotes, setDocNotes] = useState<Record<string, string>>({});
  const [savingDoc, setSavingDoc] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from("pharmacy_documents" as never).select("*").eq("pharmacy_id", pharmacyId).maybeSingle(),
      supabase.from("profiles").select("organization_name,license_number,license_expires_at,pharmacist_name,pharmacist_council_number,business_reg_number,tax_number,address,phone").eq("user_id", pharmacyId).maybeSingle(),
    ]);
    const row = (d as unknown as DocsRow | null) ?? null;
    setDocs(row);
    setProfile(p as ProfileRow | null);
    setNotes(row?.review_notes ?? "");
    const initial: Record<string, string> = {};
    Object.keys(DOC_LABELS).forEach((k) => { initial[k] = row?.document_reviews?.[k]?.notes ?? ""; });
    setDocNotes(initial);
    if (row) {
      const urls: Record<string, string> = {};
      await Promise.all(Object.keys(DOC_LABELS).map(async (k) => {
        const path = (row as Record<string, string | null | undefined>)[k];
        if (path) {
          const { data: signed } = await supabase.storage.from("pharmacy-docs").createSignedUrl(path, 3600);
          if (signed?.signedUrl) urls[k] = signed.signedUrl;
        }
      }));
      setPreviews(urls);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pharmacyId]);

  async function setDocStatus(key: string, status: "approved" | "rejected" | "under_review") {
    setSavingDoc(key);
    const { error } = await supabase.rpc("admin_set_pharmacy_document_review" as never, {
      _pharmacy_id: pharmacyId,
      _doc_key: key,
      _status: status,
      _notes: docNotes[key] ?? "",
    } as never);
    setSavingDoc(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${DOC_LABELS[key]}: ${status.replace("_", " ")}`);
    await load();
  }

  function decide(status: PharmacyApprovalStatus) {
    onChanged(status, notes);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1">
          <FileSearch className="h-3 w-3" /> Review
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pharmacyName}</DialogTitle>
          <p className="text-xs text-muted-foreground">Status: <span className="font-mono">{currentStatus}</span></p>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 text-sm">
            <section className="grid grid-cols-2 gap-3">
              <Info label="Licence #" value={profile?.license_number} />
              <Info label="Licence expires" value={profile?.license_expires_at} />
              <Info label="Pharmacist" value={profile?.pharmacist_name} />
              <Info label="SAPC council #" value={profile?.pharmacist_council_number} />
              <Info label="Business reg" value={profile?.business_reg_number} />
              <Info label="Tax #" value={profile?.tax_number} />
              <Info label="Address" value={profile?.address} full />
              <Info label="Phone" value={profile?.phone} />
            </section>

            <section>
              <h4 className="font-semibold mb-2">Documents</h4>
              <div className="space-y-3">
                {Object.entries(DOC_LABELS).map(([key, label]) => {
                  const url = previews[key];
                  const rev = docs?.document_reviews?.[key];
                  const path = (docs as Record<string, string | null | undefined> | null)?.[key];
                  const statusLabel = rev?.status ?? (path ? "pending" : "missing");
                  const isBusy = savingDoc === key;
                  return (
                    <div key={key} className="border border-border rounded-md p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{label}</p>
                          <Badge variant="outline" className="mt-1 text-[10px]">{statusLabel.replace("_", " ")}</Badge>
                        </div>
                        {url ? (
                          url.match(/\.pdf(\?|$)/i)
                            ? <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View PDF</a>
                            : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="h-16 w-16 object-cover rounded" /></a>
                        ) : <p className="text-xs text-muted-foreground italic">Not uploaded</p>}
                      </div>
                      <Textarea
                        value={docNotes[key] ?? ""}
                        onChange={(e) => setDocNotes((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder="Note for pharmacy (e.g. blurry photo, expired)"
                        rows={2}
                        className="mt-2 text-xs"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isBusy || !path} onClick={() => setDocStatus(key, "under_review")}>
                          <Clock className="h-3 w-3" /> Under review
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" disabled={isBusy || !path} onClick={() => setDocStatus(key, "rejected")}>
                          <XCircle className="h-3 w-3" /> Reject
                        </Button>
                        <Button size="sm" className="h-7 text-xs gap-1" disabled={isBusy || !path} onClick={() => setDocStatus(key, "approved")}>
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {docs?.submitted_at && <p className="text-xs text-muted-foreground mt-2">Submitted: {new Date(docs.submitted_at).toLocaleString()}</p>}
            </section>

            <section>
              <label className="text-xs font-medium">Overall reviewer notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Summary message for the pharmacy…" rows={3} />
            </section>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={updating} onClick={() => decide("under_review")}>Mark under review</Button>
          <Button variant="outline" size="sm" disabled={updating} onClick={() => decide("rejected")} className="text-destructive">Reject</Button>
          <Button variant="outline" size="sm" disabled={updating} onClick={() => decide("suspended")} className="text-destructive">Suspend</Button>
          <Button size="sm" disabled={updating} onClick={() => decide("approved")}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="italic text-muted-foreground">—</span>}</p>
    </div>
  );
}
