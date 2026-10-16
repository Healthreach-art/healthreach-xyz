import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { isMedicineExpired } from "@/lib/medicine-catalog";
import { toast } from "sonner";

export interface CartItem {
  medId: string;
  name: string;
  price: number;            // base pharmacy price (markup applied at checkout)
  pharmacyId: string;
  pharmacyName?: string;
  qty: number;
  requiresPrescription?: boolean;
  prescriptionUploadId?: string; // attached prescription upload (existing or just submitted)
  stock?: number;           // last-known stock for this medication
}

interface CartCtx {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  remove: (medId: string) => void;
  setQty: (medId: string, qty: number) => void;
  update: (medId: string, patch: Partial<CartItem>) => void;
  clear: () => void;
  itemCount: number;
  subtotal: number;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "healthreach_cart_v1";
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isValidItem = (it: any): it is CartItem =>
  it && typeof it.medId === "string" && UUID_RE.test(it.medId) &&
  typeof it.pharmacyId === "string" && UUID_RE.test(it.pharmacyId);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const clean = Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
        setItems(clean);
        if (Array.isArray(parsed) && clean.length !== parsed.length) {
          toast.message("Some old cart items were removed — please re-add them.");
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartCtx["add"] = (item, qty = 1) => {
    if (!item.pharmacyId || !UUID_RE.test(item.pharmacyId)) {
      toast.error(`Cannot add "${item.name}" — pharmacy info is missing. Please refresh the page and try again.`);
      return;
    }
    if (!item.medId || !UUID_RE.test(item.medId)) {
      toast.error(`Cannot add "${item.name}" — invalid medication id.`);
      return;
    }
<<<<<<< HEAD
    if (items.some((cartItem) => cartItem.pharmacyId !== item.pharmacyId)) {
      toast.error("This checkout supports one pharmacy at a time. Remove the other pharmacy's items first.");
=======
    if (items.some((existing) => existing.pharmacyId !== item.pharmacyId)) {
      toast.error("A checkout can contain medicines from one pharmacy. Finish or clear the current cart before choosing another pharmacy.");
>>>>>>> feat/doctor-homecare-booking
      return;
    }
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.medId === item.medId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { ...item, qty }];
    });
  };
  const remove: CartCtx["remove"] = (medId) =>
    setItems((prev) => prev.filter((p) => p.medId !== medId));
  const setQty: CartCtx["setQty"] = (medId, qty) =>
    setItems((prev) =>
      qty <= 0
        ? prev.filter((p) => p.medId !== medId)
        : prev.map((p) => (p.medId === medId ? { ...p, qty } : p))
    );
  const update: CartCtx["update"] = (medId, patch) =>
    setItems((prev) => prev.map((p) => (p.medId === medId ? { ...p, ...patch } : p)));
  const clear = () => setItems([]);

  // Live-sync price + stock from the trusted patient catalogue.
  // Refreshes on mount/change and listens for postgres_changes.
  const medKey = items.map((i) => i.medId).sort().join(",");
  useEffect(() => {
    if (!items.length) return;
    const ids = items.map((i) => i.medId);
    let cancelled = false;

    const refresh = async () => {
      const { data } = await firestoreClient
        .from("medications_public")
        .select("id, price, stock_quantity, expiry_date, is_active, is_demo")
        .in("id", ids);
      if (cancelled || !data) return;
      setItems((prev) => {
        const next: CartItem[] = [];
        for (const it of prev) {
          const row = data.find((d: any) => d.id === it.medId);
          if (!row || row.is_active !== true || row.is_demo !== false || isMedicineExpired(row.expiry_date)) {
            toast.error(`${it.name} is no longer available and was removed from your cart`);
            continue;
          }
          const newPrice = Number(row.price);
          const stock = Number(row.stock_quantity);
          if (stock <= 0) {
            toast.error(`${it.name} just went out of stock — removed from cart`);
            continue;
          }
          if (newPrice !== it.price) {
            toast.message(`Price update`, { description: `${it.name}: R${it.price.toFixed(2)} → R${newPrice.toFixed(2)}` });
          }
          next.push({ ...it, price: newPrice, stock, qty: Math.min(it.qty, stock) });
        }
        return next;
      });
    };
    refresh();

    const channel = firestoreClient
      .channel(`cart-sync-${ids.join("-")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medications_public" },
        (payload: any) => {
          const row = payload.new?.id ? payload.new : payload.old;
          if (!row?.id || !ids.includes(row.id)) return;
          if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((item) => item.medId !== row.id));
            toast.error(`${row.name || "A medicine"} is no longer available and was removed from your cart`);
            return;
          }
          setItems((prev) =>
            prev.flatMap((it) => {
              if (it.medId !== row.id) return [it];
              const stock = Number(row.stock_quantity);
              const newPrice = Number(row.price);
              if (stock <= 0 || row.is_active !== true || row.is_demo !== false || isMedicineExpired(row.expiry_date)) {
                toast.error(`${it.name} is no longer available and was removed from your cart`);
                return [];
              }
              if (newPrice !== it.price) {
                toast.message(`Price update`, { description: `${it.name}: R${it.price.toFixed(2)} → R${newPrice.toFixed(2)}` });
              }
              return [{ ...it, price: newPrice, stock, qty: Math.min(it.qty, stock) }];
            })
          );
        }
      )
      .subscribe();

    return () => { cancelled = true; firestoreClient.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medKey]);

  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <Ctx.Provider value={{ items, add, remove, setQty, update, clear, itemCount, subtotal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
