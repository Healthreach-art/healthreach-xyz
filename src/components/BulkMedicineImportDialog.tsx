import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { aiParseMedications } from "@/lib/medication-import.functions";
import { MEDICINE_CATEGORIES } from "@/lib/categories";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, X, Pencil } from "lucide-react";

interface Row {
  name: string;
  price: number;
  stock_quantity: number;
  category: string;
  requires_prescription: boolean;
  description?: string;
  _selected: boolean;
}

const SAMPLE = `Panado 500mg tablets - R30 - 50 in stock
Allergex 4mg - R45 - 20 boxes
Augmentin 625mg (prescription) - R180 - 12 packs
Ventolin inhaler (Rx) - R120 - 8 units
Centrum Adult multivitamin - R220 - 30`;

export function BulkMedicineImportDialog({ onImported }: { onImported: () => void }) {
  const { user } = useAuth();
  const parse = useServerFn(aiParseMedications);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [defaultCategory, setDefaultCategory] = useState<string>("Other");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState("");

  async function handleParse() {
    if (!text.trim()) {
      toast.error("Paste at least one medication line");
      return;
    }
    setParsing(true);
    try {
      const { items, summary: s } = await parse({ data: { text, default_category: defaultCategory } });
      setRows(items.map((i) => ({ ...i, _selected: true })));
      setSummary(s);
      if (items.length === 0) toast.warning(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parsing failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    const picked = rows.filter((r) => r._selected);
    if (picked.length === 0) {
      toast.error("Select at least one medication");
      return;
    }
    const invalid = picked.find((row) =>
      !row.name.trim()
      || !Number.isFinite(row.price) || row.price <= 0
      || !Number.isInteger(row.stock_quantity) || row.stock_quantity < 0,
    );
    if (invalid) {
      toast.error("Every selected medicine needs a name, a valid price, and whole-number stock of zero or more.");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const payload = picked.map((r) => ({
      pharmacy_id: user.id,
      name: r.name.trim(),
      price: r.price,
      stock_quantity: r.stock_quantity,
      category: r.category,
      requires_prescription: r.requires_prescription,
      description: r.description ?? "",
      is_demo: false,
      created_at: now,
      updated_at: now,
    }));
    const { error } = await firestoreClient.from("medications").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Imported ${picked.length} medication${picked.length === 1 ? "" : "s"}`);
    setRows([]);
    setText("");
    setSummary("");
    setOpen(false);
    onImported();
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="gap-1">
          <Sparkles className="h-4 w-4" /> AI Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Bulk Medicine Import</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Paste a free-form list — one med per line, CSV, or even a screenshot's OCR. Our AI extracts name, price (ZAR), stock, category, and prescription requirements. You'll review before saving.
            </p>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
              <div className="space-y-1.5">
                <Label htmlFor="default-cat">Default category (when AI can't tell)</Label>
                <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                  <SelectTrigger id="default-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEDICINE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setText(SAMPLE)}>Use sample</Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-text">Medicine list</Label>
              <Textarea id="bulk-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} className="font-mono text-xs" />
            </div>

            <DialogFooter>
              <Button onClick={handleParse} disabled={parsing} className="gap-1">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {parsing ? "Parsing…" : "Parse with AI"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {summary && <p className="text-xs text-muted-foreground rounded-md bg-accent/40 p-2">{summary}</p>}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{rows.filter((r) => r._selected).length} of {rows.length} selected</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRows((p) => p.map((r) => ({ ...r, _selected: true })))}>Select all</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRows((p) => p.map((r) => ({ ...r, _selected: false })))}>Clear</Button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {rows.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 transition-colors ${r._selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={r._selected} onChange={(e) => updateRow(i, { _selected: e.target.checked })} className="mt-1 h-4 w-4 rounded border-input" />
                    <div className="flex-1 grid gap-2 sm:grid-cols-[2fr_auto_auto_auto]">
                      <input value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} className="text-sm font-medium bg-transparent border-b border-transparent focus:border-primary outline-none" />
                      <input type="number" step="0.01" value={r.price} onChange={(e) => updateRow(i, { price: Number(e.target.value) })} className="text-xs w-20 bg-transparent border-b border-transparent focus:border-primary outline-none text-right" />
                      <input type="number" value={r.stock_quantity} onChange={(e) => updateRow(i, { stock_quantity: Number(e.target.value) })} className="text-xs w-16 bg-transparent border-b border-transparent focus:border-primary outline-none text-right" />
                      <Select value={r.category} onValueChange={(v) => updateRow(i, { category: v })}>
                        <SelectTrigger className="h-7 text-xs w-auto"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 pl-6">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={r.requires_prescription} onChange={(e) => updateRow(i, { requires_prescription: e.target.checked })} className="h-3 w-3" />
                      Requires Rx
                    </label>
                    <span className="text-[10px] text-muted-foreground">R {r.price.toFixed(2)} · stock {r.stock_quantity}</span>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setRows([]); setSummary(""); }} className="gap-1">
                <Pencil className="h-3 w-3" /> Re-edit text
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save {rows.filter((r) => r._selected).length} items
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
