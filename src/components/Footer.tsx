import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/50">
      <div className="container-narrow px-4 sm:px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg healthcare-gradient">
                <span className="text-sm font-bold text-primary-foreground">H</span>
              </div>
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
              <li><span className="hover:text-foreground cursor-pointer transition-colors">For Patients</span></li>
              <li><span className="hover:text-foreground cursor-pointer transition-colors">For Pharmacies</span></li>
              <li><span className="hover:text-foreground cursor-pointer transition-colors">For Hospitals</span></li>
              <li><span className="hover:text-foreground cursor-pointer transition-colors">For Drivers</span></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
              <li><span className="hover:text-foreground cursor-pointer transition-colors">Privacy Policy</span></li>
              <li><span className="hover:text-foreground cursor-pointer transition-colors">Terms of Service</span></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Contact</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>info@healthreach.co.za</li>
              <li>+27 (0) 11 000 0000</li>
              <li>Johannesburg, South Africa</li>
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
