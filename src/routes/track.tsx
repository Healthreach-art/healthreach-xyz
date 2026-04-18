import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, Truck, MapPin, Clock, Phone } from "lucide-react";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track Order — HEALTHREACH" },
      { name: "description", content: "Track your medication delivery in real time." },
    ],
  }),
  component: TrackPage,
});

const steps = [
  { id: 1, label: "Order Placed", time: "10:24 AM", icon: CheckCircle2, done: true },
  { id: 2, label: "Pharmacy Accepted", time: "10:31 AM", icon: CheckCircle2, done: true },
  { id: 3, label: "Preparing Medication", time: "10:45 AM", icon: Package, done: true },
  { id: 4, label: "Out for Delivery", time: "11:12 AM", icon: Truck, done: true, current: true },
  { id: 5, label: "Delivered", time: "ETA 11:35 AM", icon: MapPin, done: false },
];

function TrackPage() {
  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Track Your Order</h1>
          <p className="text-sm text-muted-foreground">Order <span className="font-mono">ORD-2026-04-001</span></p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/patient">← Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Map placeholder */}
          <div className="healthcare-card overflow-hidden">
            <div className="aspect-video bg-gradient-to-br from-healthcare-mint/30 via-healthcare-sky/20 to-primary/10 flex items-center justify-center relative">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,oklch(0.85_0.02_240)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.85_0.02_240)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className="relative flex items-center gap-3 rounded-full bg-background/90 backdrop-blur px-4 py-2 shadow-lg">
                <Truck className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-sm font-medium">Driver is 2.3 km away</span>
              </div>
            </div>
            <div className="p-4 flex items-center justify-between border-t border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Bongani Ndlovu</p>
                  <p className="text-xs text-muted-foreground">Your driver • ★ 4.9</p>
                </div>
              </div>
              <Button size="sm" variant="outline"><Phone className="h-4 w-4" /> Call</Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4">Delivery Progress</h2>
            <div className="space-y-4">
              {steps.map((step, i) => (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      step.done ? "bg-healthcare-green/20 text-healthcare-green" : "bg-muted text-muted-foreground"
                    } ${step.current ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                      <step.icon className="h-4 w-4" />
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`w-0.5 h-8 ${step.done ? "bg-healthcare-green/40" : "bg-border"}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className={`text-sm font-medium ${step.done ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {step.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Order details */}
        <div className="healthcare-card p-6 h-fit space-y-4">
          <h2 className="text-lg font-semibold">Order Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Medication</span><span>Amoxicillin 500mg</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>1</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pharmacy</span><span>City Pharmacy</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="font-semibold">R 145.00</span></div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground mb-1">Delivery Address</p>
            <p className="text-sm">12 Oak Avenue, Bryanston, Johannesburg, 2191</p>
          </div>
          <Button variant="outline" className="w-full">Cancel Order</Button>
        </div>
      </div>
    </div>
  );
}
