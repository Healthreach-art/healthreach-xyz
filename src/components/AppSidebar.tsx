import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import {
  Home, LogIn, UserPlus, ShoppingBag, Pill, Truck, ShieldCheck, LogOut, Info, Phone,
  FileText, Bell, ClipboardList, Users, Wallet, LifeBuoy, HeartPulse, MapPin,
  Search, Stethoscope, Star as StarIcon,
} from "lucide-react";
import logoImg from "@/assets/healthreach-logo.png";

type Item = { title: string; url: string; icon: any };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, role, signOut } = useAuth();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => currentPath === p;

  const dashboardPath = role ? `/dashboard/${role}` : "/login";

  const patientItems: Item[] = [
    { title: "Home", url: "/dashboard/patient", icon: Home },
    { title: "Book Appointment", url: "/dashboard/patient/find", icon: Search },
    { title: "Find a Doctor", url: "/doctors", icon: Stethoscope },
    { title: "Order Medicine", url: "/dashboard/patient/search", icon: ShoppingBag },
    { title: "Orders", url: "/dashboard/patient/orders", icon: ShoppingBag },
    { title: "Prescriptions & Documents", url: "/dashboard/patient/prescriptions", icon: Pill },
    { title: "Deliveries", url: "/track", icon: Truck },
    { title: "My Consultations", url: "/dashboard/patient/consultations", icon: FileText },
    { title: "My Ratings", url: "/dashboard/patient/ratings", icon: StarIcon },
    { title: "Reminders", url: "/dashboard/patient/reminders", icon: Bell },
    { title: "Health Records", url: "/dashboard/patient/activity", icon: ClipboardList },
    { title: "Family Profiles", url: "/dashboard/patient/family", icon: Users },
    { title: "Addresses", url: "/dashboard/patient/addresses", icon: MapPin },
    { title: "Support", url: "/dashboard/patient/support", icon: LifeBuoy },
  ];


  const otherRoleItems: Item[] = user && role !== "patient" ? [
    { title: "Home", url: dashboardPath, icon: Home },
    ...(role === "pharmacy" ? [
      { title: "Inventory", url: "/dashboard/pharmacy#inventory-section", icon: Pill },
      { title: "Orders", url: "/dashboard/pharmacy#orders-section", icon: ShoppingBag },
      { title: "Prescription Queue", url: "/dashboard/pharmacy#prescription-queue", icon: FileText },
    ] : []),
    ...(role === "driver" ? [
      { title: "Wallet", url: "/driver/wallet", icon: Wallet },
    ] : []),
    
    ...(role === "hospital" ? [{ title: "Hospital", url: "/dashboard/hospital", icon: HeartPulse }] : []),
    ...(role === "admin" ? [
      { title: "Admin Panel", url: "/dashboard/admin", icon: ShieldCheck },
      { title: "Live Map", url: "/dashboard/admin/live", icon: MapPin },
    ] : []),
  ] : [];

  const guest: Item[] = !user ? [
    { title: "Home", url: "/", icon: Home },
    { title: "Log in", url: "/login", icon: LogIn },
    { title: "Sign up", url: "/signup", icon: UserPlus },
  ] : [];

  const support: Item[] = [
    { title: "About", url: "/about", icon: Info },
    { title: "Contact", url: "/contact", icon: Phone },
  ];

  const renderGroup = (label: string, items: Item[]) =>
    items.length ? (
      <SidebarGroup>
        {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((it) => {
              const isHash = it.url.includes("#");
              const inner = (
                <>
                  <it.icon className="h-4 w-4" />
                  {!collapsed && <span>{it.title}</span>}
                </>
              );
              return (
                <SidebarMenuItem key={`${label}-${it.title}`}>
                  <SidebarMenuButton asChild isActive={isActive(it.url)}>
                    {isHash ? (
                      <a href={it.url} className="flex items-center gap-2">{inner}</a>
                    ) : (
                      <Link to={it.url} className="flex items-center gap-2">{inner}</Link>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    ) : null;

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link to={user ? dashboardPath : "/"} className="flex items-center px-2 py-2" aria-label="HealthReach home">
          {collapsed ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-healthcare-green/15 text-healthcare-green">
              <HeartPulse className="h-5 w-5" />
            </div>
          ) : (
            <img src={logoImg} alt="HealthReach" width={160} height={44} className="h-8 w-auto" />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {role === "patient"
          ? renderGroup("Menu", patientItems)
          : (
            <>
              {renderGroup("Navigate", otherRoleItems)}
              {renderGroup("Account", guest)}
              {renderGroup("Support", support)}
            </>
          )}

        {role === "patient" && !collapsed && (
          <div className="mx-3 mt-4 mb-2 rounded-2xl bg-healthcare-green/10 border border-healthcare-green/20 p-4 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-healthcare-green/20">
              <ShoppingBag className="h-7 w-7 text-healthcare-green" />
            </div>
            <p className="text-sm font-bold text-foreground">Refill made easy!</p>
            <p className="text-[11px] text-muted-foreground mt-1 mb-3">
              Reorder your medications in just one click.
            </p>
            <Link
              to="/dashboard/patient/orders"
              className="inline-flex w-full items-center justify-center rounded-xl bg-healthcare-green px-4 py-2 text-xs font-semibold text-white shadow hover:opacity-90 transition"
            >
              Reorder Now
            </Link>
          </div>
        )}
      </SidebarContent>

      {user && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Sign out</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
