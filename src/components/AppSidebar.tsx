import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { usePatientStats } from "@/hooks/usePatientStats";
import {
  Home, LogIn, UserPlus, MapPin, ShoppingBag, Pill, Stethoscope, Truck,
  ShieldCheck, LogOut, Info, Phone, FileText, Search, Store, Package,
  Clock, CreditCard, Bell, Repeat, Upload, LifeBuoy, Settings, History,
  Wallet,
} from "lucide-react";

type Item = { title: string; url: string; icon: any };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, role, signOut } = useAuth();
  const stats = usePatientStats();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => currentPath === p;

  const dashboardPath = role ? `/dashboard/${role}` : "/login";
  const homeItem: Item = { title: "Home", url: user ? dashboardPath : "/", icon: Home };

  // Patient menu groups (Uber Eats structure)
  const patientGroups = role === "patient" ? {
    main: [
      { title: "Home", url: "/dashboard/patient", icon: Home },
      { title: "Browse Pharmacies", url: "/dashboard/patient", icon: Store },
      { title: "Search Medicines", url: "/dashboard/patient", icon: Search },
      { title: "Track Order", url: "/track", icon: MapPin },
    ] as Item[],
    orders: [
      { title: "My Orders", url: "/dashboard/patient/orders", icon: Package },
      { title: "Transaction History", url: "/dashboard/patient/transactions", icon: Wallet },
    ] as Item[],
    profile: [
      { title: "Saved Addresses", url: "/dashboard/patient/addresses", icon: MapPin },
      { title: "Payment Methods", url: "/dashboard/patient/payment-methods", icon: CreditCard },
      { title: "Prescriptions", url: "/dashboard/patient/prescriptions", icon: Stethoscope },
      { title: "Reminders & Refills", url: "/dashboard/patient/reminders", icon: Bell },
    ] as Item[],
    support: [
      { title: "Customer Support", url: "/dashboard/patient/support", icon: LifeBuoy },
      { title: "Help Centre", url: "/contact", icon: Info },
    ] as Item[],
  } : null;

  const otherRoleNav: Item[] = user && role !== "patient"
    ? [
        homeItem,
        ...(role === "pharmacy" ? [
          { title: "Inventory", url: "/dashboard/pharmacy#inventory", icon: Pill },
          { title: "Orders", url: "/dashboard/pharmacy#orders", icon: ShoppingBag },
          { title: "Prescription Queue", url: "/dashboard/pharmacy#prescription-queue", icon: FileText },
        ] : []),
        ...(role === "driver" ? [{ title: "Deliveries", url: "/dashboard/driver", icon: Truck }] : []),
        ...(role === "admin" ? [{ title: "Admin Panel", url: "/dashboard/admin", icon: ShieldCheck }] : []),
      ]
    : [];

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

  // Stat cards (patient only, uber-style)
  const statCards = role === "patient" && !collapsed ? (
    <SidebarGroup>
      <SidebarGroupLabel>Your activity</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="grid grid-cols-2 gap-2 px-2">
          {[
            { label: "Total Orders", value: String(stats.totalOrders), icon: ShoppingBag, color: "text-primary" },
            { label: "Active", value: String(stats.activeOrders), icon: Package, color: "text-healthcare-teal" },
            { label: "Pending", value: String(stats.pendingDelivery), icon: Clock, color: "text-healthcare-sky" },
            { label: "Total Spent", value: `R${stats.totalSpent.toFixed(0)}`, icon: CreditCard, color: "text-healthcare-green" },
          ].map((s) => (
            <Link
              key={s.label}
              to="/dashboard/patient/orders"
              className="rounded-xl bg-foreground/95 dark:bg-card text-background dark:text-foreground p-2.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all border border-border/40"
            >
              <s.icon className={`h-3.5 w-3.5 ${s.color} mb-1`} />
              <p className="text-[10px] uppercase tracking-wide opacity-70">{s.label}</p>
              <p className="text-sm font-bold leading-tight">{s.value}</p>
            </Link>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  ) : null;

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link to={user ? dashboardPath : "/"} className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg healthcare-gradient">
            <span className="text-sm font-bold text-primary-foreground">H</span>
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight">
              HEALTH<span className="text-primary">REACH</span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {patientGroups ? (
          <>
            {renderGroup("Main", patientGroups.main)}
            {statCards}
            {renderGroup("Orders", patientGroups.orders)}
            {renderGroup("Profile", patientGroups.profile)}
            {renderGroup("Support", patientGroups.support)}
          </>
        ) : (
          <>
            {renderGroup("Navigate", otherRoleNav)}
            {renderGroup("Account", guest)}
            {renderGroup("Support", support)}
          </>
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
