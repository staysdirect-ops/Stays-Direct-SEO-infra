"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function Links({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const groups: Array<{ group: string | undefined; items: NavItem[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {groups.map((g, i) => (
        <div key={i} className={g.group ? "mt-2" : ""}>
          {g.group ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              {g.group}
            </p>
          ) : null}
          {g.items.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-md px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white",
                  active &&
                    "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--color-orange)]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="block px-3 text-lg font-extrabold tracking-tight text-white">
      Stays<span className="text-orange">Direct</span>
      <span className="ml-1.5 align-middle text-[11px] font-semibold uppercase tracking-wider text-white/50">
        Growth
      </span>
    </Link>
  );
}

export function Sidebar({
  items,
  email,
  role,
}: {
  items: NavItem[];
  email: string | null;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const footer = (
    <div className="border-t border-white/10 px-3 pt-3 text-xs text-white/60">
      <p className="truncate">{email}</p>
      <p className="capitalize">{role}</p>
      <Link href="/account" className="mt-2 block text-white/80 hover:text-white">
        Account
      </Link>
      <form action="/auth/signout" method="post" className="mt-2">
        <button className="inline-flex items-center gap-1.5 text-white/80 hover:text-white">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </form>
    </div>
  );
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-navy px-3 py-2.5 lg:hidden">
        <Brand />
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-white hover:bg-white/10"
          aria-label="Open menu"
        >
          <Menu className="size-6" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-4 overflow-y-auto bg-navy py-4">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-white hover:bg-white/10"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 px-2">
              <Links items={items} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </aside>
        </div>
      ) : null}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-5 overflow-y-auto bg-navy py-5 lg:flex">
        <Brand />
        <div className="flex-1 px-2">
          <Links items={items} />
        </div>
        {footer}
      </aside>
    </>
  );
}
