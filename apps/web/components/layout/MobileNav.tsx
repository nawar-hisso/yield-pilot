"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Vault, Users, ShieldCheck, Settings } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV = [
  { href: "/", label: "Dash", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: Vault },
  { href: "/delegate", label: "Delegate", icon: Users },
  { href: "/multisig", label: "Multi-sig", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <ul className="grid grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px]",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
