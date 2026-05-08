import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface CartItem {
  medId: string;
  name: string;
  price: number;            // base pharmacy price (markup applied at checkout)
  pharmacyId: string;
  pharmacyName?: string;
  qty: number;
  requiresPrescription?: boolean;
}

interface CartCtx {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  remove: (medId: string) => void;
  setQty: (medId: string, qty: number) => void;
  clear: () => void;
  itemCount: number;
  subtotal: number;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "healthreach_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartCtx["add"] = (item, qty = 1) => {
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
  const clear = () => setItems([]);

  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  // base subtotal (markup applied at checkout)
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <Ctx.Provider value={{ items, add, remove, setQty, clear, itemCount, subtotal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
