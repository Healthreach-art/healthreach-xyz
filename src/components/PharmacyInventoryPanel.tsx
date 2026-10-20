import { useEffect, useState, type FormEvent } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Trash2, Plus, Minus, AlertTriangle, Package, Search, Boxes } from "lucide-react";
import { MEDICINE_CATEGORIES } from "@/lib/categories";
import { customerPrice } from "@/lib/pricing";
import medGeneric from "@/assets/med-generic.jpg";
import { PrescriptionBadge } from "@/components/PrescriptionBadge";
import { useServerFn } from "@tanstack/react-start";
import { publishExistingMedicines, type PublicationResult } from "@/lib/medication-publication.functions";

export interface PharmacyInventoryPanelProps {
  /** Only show items at or below the low-stock threshold. */
  lowStockOnly?: boolean;
  /** Custom threshold for "low stock". */
  threshold?: number;
}

interface Medication {
  id: string;
  name: string;
  stock_quantity: number;
  price: number;
  category: string | null;
  is_active?: boolean;
  publish_requested?: boolean;
  requires_prescription?: boolean | null;
  image_url?: string | null;
  expiry_date?: string | null;
  batch_number?: string | null;
  description?: string | null;
}

const EMPTY_FORM = {
  name: "", dosage: "", price: "", stock: "", category: "", requires_prescription: false,
  image_url: "", expiry_date: "", batch_number: "", description: "",
};

export function PharmacyInventoryPanel({ lowStockOnly = false, threshold = 10 }: PharmacyInventoryPanelProps) {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [stockAdjustment, setStockAdjustment] = useState("1");
  const publishInventory = useServerFn(publishExistingMedicines);
  const [publishing, setPublishing] = useState(false);
  const [publicationResult, setPublicationResult] = useState<PublicationResult | null>(null);

  async function requestPublication(medicationId?: string) {
    if (publishing) return;
    setPublishing(true);
    setPublicationResult(null);
    const summary: PublicationResult = { published: 0, skipped: [], nextCursor: null };
    try {
      let afterId: string | undefined;
      do {
        const page = await publishInventory({ data: { medicationId, afterId } });
        summary.published += page.published;
        summary.skipped.push(...page.skipped);
        afterId = page.nextCursor ?? undefined;
        setPublicationResult({ ...summary, skipped: [...summary.skipped] });
      } while (afterId && !medicationId);
      toast.success(`${summary.published} medicines published`);
      await loadInventory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish medicines");
    } finally {
      setPublishing(false);
    }
  }

  const [medDialogOpen, setMedDialogOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [savingMed, setSavingMed] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadInventory() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await firestoreClient
      .from("medications")
      .select("*")
      .eq("pharmacy_id", user.id)
      .eq("is_demo", false)
      .order("created_at", { ascending: false });
    if (error) toast.error(`Could not load inventory: ${error.message}`);
    setInventory((data ?? []) as Medication[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user?.id) return;
    void loadInventory();
    const channel = firestoreClient.channel(`pharmacy-inventory-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "medications", filter: `pharmacy_id=eq.${user.id}` }, () => void loadInventory())
      .subscribe();
    return () => { void firestoreClient.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function openAdd() {
    setEditingMed(null);
    setForm(EMPTY_FORM);
    setMedDialogOpen(true);
  }
  function openEdit(m: Medication) {
    setEditingMed(m);
    setForm({
      name: m.name,
      dosage: "",
      price: String(m.price ?? ""),
      stock: String(m.stock_quantity ?? ""),
      category: m.category ?? "",
      requires_prescription: !!m.requires_prescription,
      image_url: m.image_url ?? "",
      expiry_date: m.expiry_date ?? "",
      batch_number: m.batch_number ?? "",
      description: m.description ?? "",
    });
    setMedDialogOpen(true);
  }

  async function handleImageUpload(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    if (file.size > 4 * 1024 * 1024) { toast.error("Max 4 MB"); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await firestoreClient.storage.from("medication-images").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = firestoreClient.storage.from("medication-images").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const enteredName = form.name.trim();
    const dosage = form.dosage.trim();
    const name = dosage && !enteredName.toLowerCase().includes(dosage.toLowerCase())
      ? `${enteredName} ${dosage}`
      : enteredName;
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!name || !Number.isFinite(price) || price <= 0) {
      toast.error("Enter a medicine name and a price greater than zero.");
      return;
    }
    if (!Number.isSafeInteger(stock) || stock < 0) {
      toast.error("Stock must be a whole number of zero or more.");
      return;
    }
    const desc = form.description.trim();
    if (desc.length < 30) {
      toast.error("A full medicine description is required by law (min 30 characters). Include indications, dosage, ingredients, side effects, and warnings.");
      return;
    }
    setSavingMed(true);
    const payload = {
      pharmacy_id: user.id,
      name,
      price,
      stock_quantity: stock,
      category: form.category || null,
      requires_prescription: form.requires_prescription,
      image_url: form.image_url || null,
      expiry_date: form.expiry_date || null,
      batch_number: form.batch_number || null,
      description: desc,
      is_demo: false,
      is_active: editingMed?.is_active ?? true,
      publish_requested: editingMed?.publish_requested ?? true,
      updated_at: new Date().toISOString(),
      ...(!editingMed ? { created_at: new Date().toISOString() } : {}),
    };
    const { error } = editingMed
      ? await firestoreClient.from("medications").update(payload).eq("id", editingMed.id)
      : await firestoreClient.from("medications").insert(payload);
    setSavingMed(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingMed ? "Medication updated" : "Medication added");
    setMedDialogOpen(false);
    setEditingMed(null);
    loadInventory();
  }

  async function adjustStock(med: Medication, delta: number) {
    const next = Math.max(0, med.stock_quantity + delta);
    const { error } = await firestoreClient.from("medications").update({
      stock_quantity: next,
      updated_at: new Date().toISOString(),
    }).eq("id", med.id);
    if (error) { toast.error(error.message); return; }
    setInventory((prev) => prev.map((m) => (m.id === med.id ? { ...m, stock_quantity: next } : m)));
  }

  async function confirmArchive() {
    if (!deleteTarget) return;
    setDeleting(true);
    const isActive = !deleteTarget.is_active;
    const { error } = await firestoreClient.from("medications").update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }).eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isActive ? "Medicine restored" : "Medicine archived");
    setDeleteTarget(null);
    loadInventory();
  }

  const filtered = (lowStockOnly
    ? inventory.filter((i) => i.stock_quantity <= threshold)
    : inventory).filter((item) =>
      [item.name, item.category ?? "", item.batch_number ?? ""].some((field) => field.toLowerCase().includes(search.trim().toLowerCase())) &&
      (categoryFilter === "all" || item.category === categoryFilter) &&
      (stockFilter === "all" ||
        (stockFilter === "low" && item.stock_quantity <= threshold) ||
        (stockFilter === "out" && item.stock_quantity === 0) ||
        (stockFilter === "rx" && !!item.requires_prescription) ||
        (stockFilter === "expiring" && !!item.expiry_date &&
          new Date(item.expiry_date).getTime() >= Date.now() &&
          new Date(item.expiry_date).getTime() < Date.now() + 1000 * 60 * 60 * 24 * 30)),
    );
  const categories = Array.from(new Set(inventory.map((item) => item.category).filter((category): category is string => !!category))).sort();

  const lowCount = inventory.filter((i) => i.stock_quantity <= threshold).length;

  return (
    <div className="healthcare-card p-6">
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {lowStockOnly ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Package className="h-5 w-5 text-primary" />
          )}
          <h2 className="text-lg font-semibold text-slate-900">
            {lowStockOnly ? "Low Stock" : "Stock & Inventory"}
          </h2>
          <span className="text-xs font-normal text-muted-foreground">
            {filtered.length} item{filtered.length === 1 ? "" : "s"}
            {!lowStockOnly && lowCount > 0 ? ` · ${lowCount} low` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={publishing || loading || inventory.length === 0} onClick={() => void requestPublication()}>
            {publishing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Package className="mr-1 h-4 w-4" />}Publish existing medicines
          </Button>
          <Button size="sm" onClick={openAdd} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-1 h-4 w-4" />Add New Item</Button>
        </div>
      </div>

      {publicationResult && <div role="status" className="mb-5 border border-border bg-muted/30 p-3 text-sm">
        <p className="font-semibold">{publicationResult.published} published · {publicationResult.skipped.length} skipped</p>
        {publicationResult.skipped.length > 0 && <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
          {publicationResult.skipped.map((item) => <li key={item.id}>{item.name}: {item.reason}</li>)}
        </ul>}
      </div>}

      {!lowStockOnly && (
        <div className="mb-5 space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="Filter inventory by stock status">
          {[{ id: "all", label: `All (${inventory.length})` }, { id: "low", label: `Low Stock (${lowCount})` }, { id: "out", label: `Out of Stock (${inventory.filter((item) => item.stock_quantity === 0).length})` }].map((item) => (
            <button key={item.id} type="button" aria-pressed={stockFilter === item.id} onClick={() => setStockFilter(item.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${stockFilter === item.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-white text-slate-600 hover:border-emerald-300"}`}>{item.label}</button>
          ))}
          {stockFilter !== "all" && <button type="button" onClick={() => setStockFilter("all")} className="text-xs text-muted-foreground underline">Clear stock filter</button>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_120px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search inventory"
            placeholder="Search medicine or category..."
            className="rounded-xl pl-9"
          />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger aria-label="Filter inventory by category"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger aria-label="Filter inventory by clinical status"><SelectValue placeholder="All stock" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stock</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
              <SelectItem value="rx">Rx-only</SelectItem>
              <SelectItem value="expiring">Expiring soon</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="stock-adjustment" className="shrink-0 text-xs">Adjust by</Label>
            <Input
              id="stock-adjustment"
              aria-label="Stock adjustment increment"
              type="number"
              min="1"
              step="1"
              value={stockAdjustment}
              onChange={(event) => setStockAdjustment(event.target.value)}
              className="tabular-nums"
            />
          </div>
        </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {lowStockOnly
            ? "Nothing low on stock right now. 🎉"
            : "Your inventory is empty. Click \"+ Add Item\" to add medications."}
        </p>
      )}

      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto rounded-xl border border-border/60 bg-white">
        {filtered.length > 0 && (
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Medicine &amp; strength</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Stock level</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
          {filtered.map((item) => {
            const low = item.stock_quantity > 0 && item.stock_quantity <= threshold;
            const out = item.stock_quantity === 0;
            const expiryTime = item.expiry_date ? new Date(item.expiry_date).getTime() : null;
            const expired = expiryTime !== null && expiryTime < Date.now();
            const expSoon = expiryTime !== null && !expired && expiryTime < Date.now() + 1000 * 60 * 60 * 24 * 30;
            return (
              <tr key={item.id} className="align-middle transition hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src={item.image_url || medGeneric} alt="" loading="lazy" className="h-10 w-10 rounded-lg border border-border/50 object-cover" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <PrescriptionBadge requiresPrescription={item.requires_prescription} />
                        {item.batch_number && <span className="text-[10px] text-muted-foreground">Batch {item.batch_number}</span>}
                        {(expired || expSoon) && <span className={`text-[10px] font-medium ${expired ? "text-destructive" : "text-amber-700"}`}>{expired ? "Expired" : "Expires soon"}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.category || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${out ? "bg-slate-100 text-slate-600" : low ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                    {(low || out) && <AlertTriangle className="h-3 w-3" />}{item.stock_quantity} units
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <p className="font-semibold text-slate-900">R{Number(item.price).toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Customer R{customerPrice(item.price).toFixed(2)}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${out ? "bg-slate-100 text-slate-600" : low ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                    {out ? "Out of Stock" : low ? "Low Stock" : "In Stock"}
                  </span>
                  {item.is_active === false && <span className="ml-1 text-[10px] text-muted-foreground">Archived</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Decrease stock of ${item.name}`} onClick={() => adjustStock(item, -Math.max(1, Math.floor(Number(stockAdjustment) || 1)))}><Minus className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Increase stock of ${item.name}`} onClick={() => adjustStock(item, Math.max(1, Math.floor(Number(stockAdjustment) || 1)))}><Plus className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`${item.is_active === false ? "Restore" : "Archive"} ${item.name}`} onClick={() => setDeleteTarget(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  {item.publish_requested !== true && item.is_active !== false && <Button variant="link" size="sm" disabled={publishing} onClick={() => void requestPublication(item.id)} className="mt-1 h-auto px-0 text-xs">Request publication</Button>}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center">
            <Boxes className="mx-auto h-8 w-8 text-emerald-600/70" />
            <p className="mt-3 text-sm font-semibold text-slate-900">{inventory.length === 0 ? "No live inventory items yet" : "No medicines match these filters"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{inventory.length === 0 ? "Add a real medicine to your pharmacy inventory to make it available for review and publication." : "Try another search term or stock filter."}</p>
          </div>
        )}
      </div>

      {/* Add / Edit Medication Dialog */}
      <Dialog open={medDialogOpen} onOpenChange={(o) => { setMedDialogOpen(o); if (!o) setEditingMed(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingMed ? "Edit Medicine" : "Add New Medicine"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Medicine Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Enter the listed medicine name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dosage">Dosage / Form</Label>
                <Input id="dosage" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="Add strength or form to listing" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={form.category || "Other"} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>
                    {MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Full description <span className="text-destructive">*</span></Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required minLength={30} maxLength={4000} rows={6}
                placeholder="Active ingredient(s), strength, indications, dosage, side effects, warnings, storage."
              />
              <p className="text-[11px] text-muted-foreground">
                Required by law. Min 30 characters.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">Price (R)</Label>
                <Input id="price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock">Stock</Label>
                <Input id="stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="batch">Batch number</Label>
                <Input id="batch" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry date</Label>
                <Input id="expiry" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Medicine image</Label>
              <div className="flex items-center gap-3">
                {form.image_url && <img src={form.image_url} alt="" className="h-14 w-14 rounded-md object-cover border border-border" />}
                <Input id="image" type="file" accept="image/*" disabled={uploadingImage}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.currentTarget.value = ""; }} />
              </div>
              {uploadingImage && <p className="text-xs text-muted-foreground">Uploading…</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_prescription}
                onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Requires a valid prescription (Rx)
            </label>
            <p className="text-[11px] text-muted-foreground">Items with stock = 0 are automatically hidden from patients.</p>
            <DialogFooter>
              <Button type="submit" disabled={savingMed}>
                {savingMed ? "Saving..." : editingMed ? "Save Changes" : "Add Medication"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.is_active === false ? "Restore medicine?" : "Archive medicine?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.is_active === false
                ? <>Restore <span className="font-medium text-foreground">{deleteTarget?.name}</span> to active inventory. It will be eligible for publication if publication is requested and the pharmacy is approved.</>
                : <>Archive <span className="font-medium text-foreground">{deleteTarget?.name}</span> and remove it from the patient catalogue. The inventory record will be retained.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmArchive(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Saving..." : deleteTarget?.is_active === false ? "Restore" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
