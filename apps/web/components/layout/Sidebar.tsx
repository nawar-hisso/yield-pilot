"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Vault,
  Users,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { cn } from "../../lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: Vault },
  { href: "/delegate", label: "Delegate", icon: Users },
  { href: "/multisig", label: "Multi-sig", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 py-5 font-display text-lg font-semibold"
      >
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-grad-hero shadow-glow text-primary-foreground text-sm font-bold"
        >
          Y
        </span>
        <span className="text-grad">YieldPilot</span>
      </Link>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-muted-foreground hover:bg-card-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4", active ? "text-accent" : "text-muted-foreground")}
                strokeWidth={active ? 2 : 1.75}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] text-muted-foreground border-t border-border">
        <div>v0.0.1 · dev preview</div>
        <div className="mt-0.5">YieldPilot · YieldPilot</div>
      </div>
    </aside>
  );
}
