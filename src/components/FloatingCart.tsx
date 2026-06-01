import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus, Minus, Trash2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { customerPrice, deliveryFeeForKm } from "@/lib/pricing";
import { useState } from "react";

export function FloatingCart() {
  const { role } = useAuth();
  const { items, itemCount, remove, setQty, subtotal } = useCart();
  const [open, setOpen] = useState(false);

  if (role !== "patient" || itemCount === 0) return null;

  const customerSubtotal = items.reduce((s, i) => s + customerPrice(i.price) * i.qty, 0);
  const deliveryFee = customerDeliveryFee(BASE_DELIVERY_FEE);
  const total = customerSubtotal + deliveryFee;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Open cart"
          className="fixed z-40 bottom-5 right-5 sm:bottom-6 sm:right-6 flex items-center gap-3 rounded-full bg-primary text-primary-foreground pl-4 pr-5 py-3 shadow-2xl hover:scale-105 transition-transform animate-fade-in"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary-foreground/20">
            <ShoppingCart className="h-4 w-4" />
            <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-white text-primary text-[11px] font-bold flex items-center justify-center shadow">
              {itemCount}
            </span>
          </span>
          <span className="text-sm font-semibold">View cart</span>
          <span className="text-sm font-bold">R{total.toFixed(0)}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Your cart ({itemCount})
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {items.map((it) => (
            <div key={it.medId} className="flex gap-3 rounded-xl border border-border p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground line-clamp-1">{it.name}</p>
                {it.pharmacyName && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{it.pharmacyName}</p>
                )}
                <p className="text-sm font-bold text-foreground mt-1">
                  R{(customerPrice(it.price) * it.qty).toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <button
                  aria-label="Remove"
                  onClick={() => remove(it.medId)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-1.5 rounded-full border border-border bg-card">
                  <button
                    aria-label="Decrease"
                    onClick={() => setQty(it.medId, it.qty - 1)}
                    className="h-7 w-7 flex items-center justify-center hover:bg-accent rounded-l-full"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-semibold w-5 text-center">{it.qty}</span>
                  <button
                    aria-label="Increase"
                    onClick={() => setQty(it.medId, it.qty + 1)}
                    className="h-7 w-7 flex items-center justify-center hover:bg-accent rounded-r-full"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-6 py-4 space-y-2 bg-muted/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">R{customerSubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Delivery fee</span>
            <span className="font-medium">R{deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-1">
            <span>Total</span>
            <span>R{total.toFixed(2)}</span>
          </div>
          <Button asChild size="lg" className="w-full mt-2 rounded-xl" onClick={() => setOpen(false)}>
            <Link to="/checkout">Checkout · R{total.toFixed(2)}</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
