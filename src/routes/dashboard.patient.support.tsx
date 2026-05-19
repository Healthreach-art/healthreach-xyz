import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/support")({
  head: () => ({ meta: [{ title: "Support — HEALTHREACH" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customer Support</h1>
          <p className="text-sm text-muted-foreground">We're here 7 days a week.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="healthcare-card p-6">
            <LifeBuoy className="h-6 w-6 text-primary mb-3" />
            <h2 className="font-semibold mb-1">Help Centre</h2>
            <p className="text-sm text-muted-foreground mb-3">Browse FAQs and how-to guides.</p>
            <Button asChild variant="outline"><Link to="/contact">Visit Help Centre</Link></Button>
          </div>
          <div className="healthcare-card p-6">
            <Mail className="h-6 w-6 text-primary mb-3" />
            <h2 className="font-semibold mb-1">Email</h2>
            <p className="text-sm text-muted-foreground mb-3">support@healthreach.co.za</p>
            <Button asChild variant="outline"><a href="mailto:support@healthreach.co.za">Send email</a></Button>
          </div>
          <div className="healthcare-card p-6 sm:col-span-2">
            <MessageCircle className="h-6 w-6 text-primary mb-3" />
            <h2 className="font-semibold mb-1">Live chat on your order</h2>
            <p className="text-sm text-muted-foreground mb-3">Open an active order to chat with the pharmacy and driver in real time.</p>
            <Button asChild><Link to="/dashboard/patient/orders">View orders</Link></Button>
          </div>
        </div>
      </div>
    </RoleGuard>
  ),
});
