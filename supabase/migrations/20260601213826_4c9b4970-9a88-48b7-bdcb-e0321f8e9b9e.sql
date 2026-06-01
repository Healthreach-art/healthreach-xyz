-- Add family_member_id to prescription_uploads so prescriptions can be tied to a specific recipient
ALTER TABLE public.prescription_uploads
  ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescription_uploads_family_member
  ON public.prescription_uploads(family_member_id);

-- Allow pharmacies to view family_members tied to an order or prescription_upload assigned to them
CREATE POLICY "Pharmacies view recipient family members"
  ON public.family_members
  FOR SELECT
  USING (
    app_private.has_role(auth.uid(), 'pharmacy'::app_role)
    AND (
      EXISTS (SELECT 1 FROM public.orders o
              WHERE o.recipient_family_member_id = family_members.id
                AND o.pharmacy_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.prescription_uploads pu
                 WHERE pu.family_member_id = family_members.id
                   AND pu.pharmacy_id = auth.uid())
    )
  );