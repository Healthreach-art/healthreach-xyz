import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CartProvider } from "@/hooks/useCart";
import { FloatingCart } from "@/components/FloatingCart";
import { Toaster } from "@/components/ui/sonner";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ServiceRatingPrompt } from "@/components/ServiceRatingPrompt";
import { AskProviderFab } from "@/components/AskProviderFab";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

import logoUrl from "@/assets/healthreach-logo.png";
import appCss from "../styles.css?url";

const NO_SIDEBAR_ROUTES = new Set(["/", "/login", "/signup", "/about", "/contact", "/reset-password"]);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "HEALTHREACH" },
      { name: "description", content: "Integrated healthcare management for South Africa." },
      { name: "author", content: "HEALTHREACH" },
      { name: "google-site-verification", content: "Pm7nkjuqZnyhc0ERvlAt_BKybHDoigtifu6vlCj3Bqo" },
      { name: "theme-color", content: "#3aa8f0" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "HEALTHREACH" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "HEALTHREACH" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6de31345-24a7-4c2c-8465-25d7c705c8de/id-preview-8ba30e54--2e5d99c7-52f1-4a97-ba21-799533cca0bc.lovable.app-1776727367211.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6de31345-24a7-4c2c-8465-25d7c705c8de/id-preview-8ba30e54--2e5d99c7-52f1-4a97-ba21-799533cca0bc.lovable.app-1776727367211.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", crossOrigin: "" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppShell />
        <FloatingCart />
        <Toaster />
        <NotificationCenter />
        <ServiceRatingPrompt />
        <AskProviderFab />
      </CartProvider>

    </AuthProvider>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const showSidebar = !!user && !loading && !NO_SIDEBAR_ROUTES.has(pathname);

  if (!showSidebar) {
    return (
      <div className="flex min-h-screen flex-col w-full">
        <header className="sticky top-0 z-40 h-12 flex items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-4">
          <Link to="/" aria-label="HealthReach home">
            <img src={logoUrl} alt="HealthReach" width={120} height={32} className="h-7 w-auto" />
          </Link>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    );
  }

  return <SidebarShell />;
}

function SidebarShell() {
  const { role } = useAuth();
  const storageKey = `sidebar_state:${role ?? "default"}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(storageKey);
    return v === null ? true : v === "true";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      const v = window.localStorage.getItem(storageKey);
      setOpen(v === null ? true : v === "true");
    }
  }, [storageKey]);
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, String(next));
  }

  return (
    <SidebarProvider open={open} onOpenChange={handleOpenChange}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-12 flex items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-3">
            <SidebarTrigger />
            <Link to="/" aria-label="HealthReach home">
              <img src={logoUrl} alt="HealthReach" width={120} height={32} className="h-7 w-auto" />
            </Link>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </SidebarProvider>
  );
}

