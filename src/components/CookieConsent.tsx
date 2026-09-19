import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("hr_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("hr_cookie_consent", "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] md:left-auto md:right-8 md:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="healthcare-card bg-card/95 backdrop-blur p-4 sm:p-5 shadow-2xl border-primary/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground mb-1">Privacy & Data Notice</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We use essential cookies to manage your healthcare session and protect your data under POPIA. 
              By continuing, you agree to our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and <Link to="/terms" className="text-primary hover:underline">Terms</Link>.
            </p>
          </div>
          <button onClick={() => setShow(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={accept} className="healthcare-gradient border-0 text-xs font-bold px-6">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
