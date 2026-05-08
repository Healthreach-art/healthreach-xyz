import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import {
  Home, LogIn, UserPlus, MapPin, ShoppingBag, Pill, Stethoscope, Truck,
  ShieldCheck, LogOut, Info, Phone, FileText, Search, Store, Package,
  CreditCard, Bell, LifeBuoy, Activity,
  Wallet,
} from "lucide-react";

type Item = { title: string; url: string; icon: any };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, role, signOut } = useAuth();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => currentPath === p;

  const dashboardPath = role ? `/dashboard/${role}` : "/login";
  const homeItem: Item = { title: "Home", url: user ? dashboardPath : "/", icon: Home };

  // Patient menu groups (Uber Eats structure)
  const patientGroups = role === "patient" ? {
    main: [
      { title: "Home", url: "/dashboard/patient", icon: Home },
      { title: "Browse Pharmacies", url: "/dashboard/patient/pharmacies", icon: Store },
      { title: "Search Medicines", url: "/dashboard/patient/search", icon: Search },
      { title: "Track Order", url: "/track", icon: MapPin },
      { title: "Your Activity", url: "/dashboard/patient/activity", icon: Activity },
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
