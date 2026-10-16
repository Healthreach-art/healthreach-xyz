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
import { Loader2, Pencil, Trash2, Plus, Minus, AlertTriangle, Package } from "lucide-react";
import { MEDICINE_CATEGORIES } from "@/lib/categories";
import { customerPrice } from "@/lib/pricing";
import { BulkMedicineImportDialog } from "@/components/BulkMedicineImportDialog";
import medGeneric from "@/assets/med-generic.jpg";
import { PrescriptionBadge } from "@/components/PrescriptionBadge";

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
  is_active: boolean;
  publish_requested: boolean;
  requires_prescription?: boolean | null;
  image_url?: string | null;
  expiry_date?: string | null;
  batch_number?: string | null;
  description?: string | null;
  is_demo?: boolean;
}

const EMPTY_FORM = {
  name: "", price: "", stock: "", category: "", requires_prescription: false,
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
      .eq("pharmacy_id", user.id);
    if (error) toast.error(`Could not load inventory: ${error.message}`);
    setInventory(((data ?? []) as Medication[])
      .filter((medication) => medication.is_demo !== true)
      .sort((first, second) => String(second.created_at ?? "").localeCompare(String(first.created_at ?? ""))));
    setLoading(false);
  }

  useEffect(() => { loadInventory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  function openAdd() {
    setEditingMed(null);
    setForm(EMPTY_FORM);
    setMedDialogOpen(true);
  }
  function openEdit(m: Medication) {
    setEditingMed(m);
    setForm({
      name: m.name,
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
    const name = form.name.trim();
    const price = Number(form.price);
    const stock = Number(form.stock);
<<<<<<< HEAD
    if (!name || !Number.isFinite(price) || price <= 0) {
      toast.error("Enter a medicine name and a price greater than zero.");
      return;
    }
    if (!Number.isSafeInteger(stock) || stock < 0) {
      toast.error("Stock must be a whole number of zero or more.");
      return;
    }
=======
    if (!name) { toast.error("Enter a medication name"); return; }
    if (!Number.isFinite(price) || price <= 0) { toast.error("Enter a valid price greater than R0"); return; }
    if (!Number.isInteger(stock) || stock < 0) { toast.error("Stock must be a whole number of zero or more"); return; }
>>>>>>> feat/doctor-homecare-booking
    const desc = form.description.trim();
    if (desc.length < 30) {
      toast.error("A full medicine description is required by law (min 30 characters). Include indications, dosage, ingredients, side effects, and warnings.");
      return;
    }
    setSavingMed(true);
    const now = new Date().toISOString();
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
<<<<<<< HEAD
      is_active: editingMed?.is_active ?? true,
      publish_requested: editingMed?.publish_requested ?? true,
      updated_at: new Date().toISOString(),
      ...(!editingMed ? { created_at: new Date().toISOString() } : {}),
=======
      updated_at: now,
>>>>>>> feat/doctor-homecare-booking
    };
    const { error } = editingMed
      ? await firestoreClient.from("medications").update(payload).eq("id", editingMed.id)
      : await firestoreClient.from("medications").insert({ ...payload, created_at: now });
    setSavingMed(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingMed ? "Medication updated" : "Medication added");
    setMedDialogOpen(false);
    setEditingMed(null);
    loadInventory();
  }

  async function adjustStock(med: Medication, delta: number) {
    const next = Math.max(0, med.stock_quantity + delta);
<<<<<<< HEAD
    const { error } = await firestoreClient.from("medications").update({
      stock_quantity: next,
      updated_at: new Date().toISOString(),
    }).eq("id", med.id);
=======
    const { error } = await firestoreClient.from("medications").update({ stock_quantity: next, updated_at: new Date().toISOString() }).eq("id", med.id);
>>>>>>> feat/doctor-homecare-booking
    if (error) { toast.error(error.message); return; }
    setInventory((prev) => prev.map((m) => (m.id === med.id ? { ...m, stock_quantity: next } : m)));
  }

  async function togglePublish(med: Medication) {
    const publishRequested = !med.publish_requested;
    const { error } = await firestoreClient.from("medications").update({
      publish_requested: publishRequested,
      updated_at: new Date().toISOString(),
    }).eq("id", med.id);
    if (error) { toast.error(error.message); return; }
    setInventory((prev) => prev.map((item) =>
      item.id === med.id ? { ...item, publish_requested: publishRequested } : item,
    ));
    toast.success(publishRequested ? "Medicine publication requested" : "Medicine unpublished");
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
        (stockFilter === "low" && item.stock_quantity > 0 && item.stock_quantity <= threshold) ||
        (stockFilter === "out" && item.stock_quantity === 0) ||
        (stockFilter === "rx" && !!item.requires_prescription) ||
        (stockFilter === "expiring" && !!item.expiry_date &&
          new Date(item.expiry_date).getTime() >= Date.now() &&
          new Date(item.expiry_date).getTime() < Date.now() + 1000 * 60 * 60 * 24 * 30)),
    );
  const categories = Array.from(new Set(inventory.map((item) => item.category).filter((category): category is string => !!category))).sort();

  const lowCount = inventory.filter((i) => i.stock_quantity > 0 && i.stock_quantity <= threshold).length;

  return (
    <div className="healthcare-card p-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {lowStockOnly ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Package className="h-5 w-5 text-primary" />
          )}
          <h2 className="text-lg font-semibold text-foreground">
            {lowStockOnly ? "Low Stock" : "Inventory"}
          </h2>
          <span className="text-xs font-normal text-muted-foreground">
            {filtered.length} item{filtered.length === 1 ? "" : "s"}
            {!lowStockOnly && lowCount > 0 ? ` · ${lowCount} low` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BulkMedicineImportDialog onImported={loadInventory} />
          <Button size="sm" variant="outline" onClick={openAdd}>+ Add Item</Button>
        </div>
      </div>

      {!lowStockOnly && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_120px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search inventory"
            placeholder="Search medication, category or batch…"
          />
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

      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const low = item.stock_quantity > 0 && item.stock_quantity <= threshold;
            const out = item.stock_quantity === 0;
            const expiryTime = item.expiry_date ? new Date(item.expiry_date).getTime() : null;
            const expired = expiryTime !== null && expiryTime < Date.now();
            const expSoon = expiryTime !== null && !expired && expiryTime < Date.now() + 1000 * 60 * 60 * 24 * 30;
            return (
              <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative h-24 overflow-hidden">
                  <img src={item.image_url || medGeneric} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    out ? "bg-muted text-muted-foreground" : low ? "bg-destructive text-destructive-foreground" : "bg-healthcare-green text-primary-foreground"
                  }`}>
                    {out ? "Hidden — out of stock" : `${item.stock_quantity} units`}
                  </span>
                  {(expired || expSoon) && (
                    <span className={`absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${expired ? "bg-destructive text-destructive-foreground" : "bg-healthcare-sky/90 text-primary-foreground"}`}>
                      {expired ? "Expired" : "Expires soon"}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <PrescriptionBadge requiresPrescription={item.requires_prescription} />
                    {low && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Low stock</span>}
                    {item.is_active === false && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Archived</span>}
                    {item.publish_requested === false && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Unpublished</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.category || "—"} · R {Number(item.price).toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Customer sees <span className="font-semibold text-foreground">R {customerPrice(item.price).toFixed(2)}</span></p>
                  {item.description && <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{item.description}</p>}
                  {(item.batch_number || item.expiry_date) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {item.batch_number ? `Batch ${item.batch_number}` : ""}
                      {item.batch_number && item.expiry_date ? " · " : ""}
                      {item.expiry_date ? `Exp ${new Date(item.expiry_date).toLocaleDateString()}` : ""}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" aria-label={`Remove ${stockAdjustment} stock units from ${item.name}`} onClick={() => adjustStock(item, -Math.max(1, Math.floor(Number(stockAdjustment) || 1)))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7" aria-label={`Add ${stockAdjustment} stock units to ${item.name}`} onClick={() => adjustStock(item, Math.max(1, Math.floor(Number(stockAdjustment) || 1)))}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openEdit(item)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => void togglePublish(item)}>
                        {item.publish_requested === false ? "Publish" : "Unpublish"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-3 w-3" />
                        {item.is_active === false ? "Restore" : "Archive"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Medication Dialog */}
      <Dialog open={medDialogOpen} onOpenChange={(o) => { setMedDialogOpen(o); if (!o) setEditingMed(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMed ? "Edit Medication" : "Add Medication"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category || "Other"} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="batch">Batch number</Label>
                <Input id="batch" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} placeholder="A1234" />
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
