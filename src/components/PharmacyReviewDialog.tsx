import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileSearch } from "lucide-react";

export type PharmacyApprovalStatus = "pending" | "approved" | "rejected" | "suspended" | "under_review" | "expired";

const DOC_LABELS: Record<string, string> = {
  license_path: "Pharmacy operating licence",
  pharmacist_cert_path: "Pharmacist registration certificate",
  business_reg_path: "Business registration",
  tax_cert_path: "Tax registration",
  proof_of_address_path: "Proof of physical address",
  bank_confirmation_path: "Bank confirmation",
};

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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const [{ data: d }, { data: p }] = await Promise.all([
        supabase.from("pharmacy_documents" as never).select("*").eq("pharmacy_id", pharmacyId).maybeSingle(),
        supabase.from("profiles").select("organization_name,license_number,license_expires_at,pharmacist_name,pharmacist_council_number,business_reg_number,tax_number,address,phone").eq("user_id", pharmacyId).maybeSingle(),
      ]);
      const row = (d as unknown as DocsRow | null) ?? null;
      setDocs(row);
      setProfile(p as ProfileRow | null);
      setNotes(row?.review_notes ?? "");
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
    })();
  }, [open, pharmacyId]);

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
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(DOC_LABELS).map(([key, label]) => {
                  const url = previews[key];
                  return (
                    <div key={key} className="border border-border rounded-md p-2">
                      <p className="text-xs font-medium">{label}</p>
                      {url ? (
                        url.match(/\.pdf(\?|$)/i)
                          ? <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View PDF</a>
                          : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="mt-1 h-24 w-full object-cover rounded" /></a>
                      ) : <p className="text-xs text-muted-foreground italic mt-1">Not uploaded</p>}
                    </div>
                  );
                })}
              </div>
              {docs?.submitted_at && <p className="text-xs text-muted-foreground mt-2">Submitted: {new Date(docs.submitted_at).toLocaleString()}</p>}
            </section>

            <section>
              <label className="text-xs font-medium">Reviewer notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What's missing / why reject…" rows={3} />
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
