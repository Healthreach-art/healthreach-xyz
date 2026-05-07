import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "HEALTHREACH — Integrated Healthcare Management" },
      { name: "description", content: "Your central hub for integrated healthcare management connecting patients, pharmacies, hospitals, and delivery services." },
      { name: "author", content: "HEALTHREACH" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "HEALTHREACH — Integrated Healthcare Management" },
      { name: "twitter:title", content: "HEALTHREACH — Integrated Healthcare Management" },
      { property: "og:description", content: "Your central hub for integrated healthcare management connecting patients, pharmacies, hospitals, and delivery services." },
      { name: "twitter:description", content: "Your central hub for integrated healthcare management connecting patients, pharmacies, hospitals, and delivery services." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6de31345-24a7-4c2c-8465-25d7c705c8de/id-preview-8ba30e54--2e5d99c7-52f1-4a97-ba21-799533cca0bc.lovable.app-1776727367211.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6de31345-24a7-4c2c-8465-25d7c705c8de/id-preview-8ba30e54--2e5d99c7-52f1-4a97-ba21-799533cca0bc.lovable.app-1776727367211.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", crossOrigin: "" },
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
      <AppShell />
      <Toaster />
      <NotificationCenter />
    </AuthProvider>
  );
}

function AppShell() {
  const { user, role, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const showSidebar = !!user && !loading && !NO_SIDEBAR_ROUTES.has(pathname);

  if (!showSidebar) {
    return (
      <div className="flex min-h-screen flex-col w-full">
        <header className="sticky top-0 z-40 h-12 flex items-center border-b border-border bg-background/95 backdrop-blur px-4">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            HEALTH<span className="text-primary">REACH</span>
          </Link>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    );
  }

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
            <Link to="/" className="text-sm font-semibold tracking-tight">
              HEALTH<span className="text-primary">REACH</span>
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
