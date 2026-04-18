"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Vault,
  Users,
  ShieldCheck,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "../../lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: Vault },
  { href: "/delegate", label: "Delegate", icon: Users },
  { href: "/multisig", label: "Multi-sig", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const STORAGE_KEY = "yp:sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      // storage disabled — default to expanded
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
      className="hidden lg:flex sticky top-0 h-screen shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 backdrop-blur-xl overflow-hidden"
    >
      <Link
        href="/"
        aria-label="YieldPilot home"
        className="flex items-center gap-2.5 px-5 py-5"
      >
        <span
          aria-hidden
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-grad-hero shadow-glow text-primary-foreground text-sm font-extrabold"
        >
          Y
        </span>
        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.span
              key="brand"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="text-grad whitespace-nowrap text-[18px] font-extrabold"
            >
              YieldPilot
            </motion.span>
          ) : null}
        </AnimatePresence>
      </Link>

      <nav className="flex-1 px-2 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-md py-2 text-sm transition-all duration-150 ease-[cubic-bezier(0.25,1,0.5,1)]",
                collapsed ? "px-3 justify-center" : "px-3",
                active
                  ? "bg-[color:var(--color-accent-glow)] text-[color:var(--color-accent)] font-semibold"
                  : "text-[color:var(--color-text-2)] font-normal hover:bg-[color:var(--color-card-hover)] hover:text-[color:var(--color-text-1)]",
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r bg-[color:var(--color-accent)] shadow-[0_0_8px_rgb(var(--accent-rgb)/0.6)]"
                />
              ) : null}
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active
                    ? "text-[color:var(--color-accent)]"
                    : "text-[color:var(--color-text-2)] group-hover:text-[color:var(--color-text-1)]",
                )}
                strokeWidth={active ? 2 : 1.75}
              />
              <AnimatePresence initial={false}>
                {!collapsed ? (
                  <motion.span
                    key={`${href}-label`}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.12 }}
                    className="whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-[color:var(--color-border)] px-2 py-3",
          collapsed ? "flex justify-center" : "flex items-center justify-between gap-2 px-4",
        )}
      >
        {!collapsed ? (
          <div className="min-w-0 text-[11px] font-light text-[color:var(--color-text-3)]">
            <div>v0.0.1 · dev</div>
            <div className="mt-0.5 truncate">YieldPilot</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-[color:var(--color-card-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </motion.aside>
  );
}
