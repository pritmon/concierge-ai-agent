import type { Metadata } from "next";
import { Sidebar } from "@/components/admin/Sidebar";

export const metadata: Metadata = { title: "Concierge admin" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
