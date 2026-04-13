import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, role, signOut } = useAuth();

  const dashboardPath = role ? `/dashboard/${role}` : "/login";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container-narrow flex h-16 items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg healthcare-gradient">
            <span className="text-lg font-bold text-primary-foreground">H</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            HEALTH<span className="text-primary">REACH</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground bg-accent" }}
              activeOptions={{ exact: link.to === "/" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link to={dashboardPath as any}>
                <Button variant="ghost" size="sm" className="gap-1">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-1">
                <LogOut className="h-4 w-4" /> Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link to="/signup">
                <Button variant="default" size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden p-2 text-muted-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {publicLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground bg-accent" }}
                activeOptions={{ exact: link.to === "/" }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            {user ? (
              <>
                <Link to={dashboardPath as any} onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-1">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => { signOut(); setMobileOpen(false); }} className="gap-1">
                  <LogOut className="h-4 w-4" /> Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full justify-start">Log in</Button>
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)}>
                  <Button variant="default" size="sm" className="w-full">Sign up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
