"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/knowledge", label: "Knowledge" },
  { href: "/admin/procedures", label: "Procedures" },
  { href: "/admin/orders", label: "Orders (demo)" },
  { href: "/admin/settings", label: "Agent settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:h-dvh md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-3 md:py-5">
      <Link href="/admin" className="mr-3 flex items-center gap-2 px-2 md:mb-6 md:mr-0">
        <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">C</span>
        <span className="font-semibold">Concierge</span>
      </Link>
      {NAV.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="md:mt-auto">
        <Link
          href="/"
          target="_blank"
          className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Test on storefront ↗
        </Link>
      </div>
    </aside>
  );
}
