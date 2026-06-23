import { Link } from "@tanstack/react-router";
import { MessageCircle, Phone } from "lucide-react";
import logo from "@/assets/healthreach-logo.png";

const WA_NUMBER = "27797285078";
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hi HEALTHREACH, I'd like to ask a quick question.")}`;

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/50">
      <div className="container-narrow px-4 sm:px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <img src={logo} alt="HealthReach" className="h-9 w-auto" />
              <span className="text-lg font-bold tracking-tight text-foreground">
                HEALTH<span className="text-primary">REACH</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your central hub for integrated healthcare management. Connecting patients, pharmacies, hospitals, and delivery services.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Platform</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/for-patients" className="hover:text-foreground transition-colors">For Patients</Link></li>
              <li><Link to="/for-doctors" className="hover:text-foreground transition-colors">For Doctors</Link></li>
              <li><Link to="/for-pharmacies" className="hover:text-foreground transition-colors">For Pharmacies</Link></li>
              <li><Link to="/for-drivers" className="hover:text-foreground transition-colors">For Drivers</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Contact</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="tel:+27797285078" className="inline-flex items-center gap-2 hover:text-foreground"><Phone className="h-3.5 w-3.5" /> +27 79 728 5078</a></li>
              <li><a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp us</a></li>
              <li>Cape Town, South Africa</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} HEALTHREACH. All rights reserved.
        </div>
      </div>

    </footer>
  );
}
