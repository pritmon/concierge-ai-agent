"use client";

import { Card, PageHeader, useApi } from "@/components/admin/ui";

interface Order {
  id: string;
  customer_email: string;
  customer_name: string;
  items: string;
  total: number;
  status: string;
  refunded_amount: number;
  created_at: string;
}

export default function Orders() {
  const { data } = useApi<{ orders: Order[] }>("/api/admin/orders", 5000);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Orders (demo backend)"
        description="Sample data the agent's tools read and change. Use these order numbers and emails to test the agent — e.g. “Cancel order NW-10502, my email is sam@example.com”. In production, the tools call your real order system instead."
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Refunded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 font-mono text-xs">{o.id}</td>
                <td className="px-4 py-3">
                  <div>{o.customer_name}</div>
                  <div className="text-xs text-slate-500">{o.customer_email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {(JSON.parse(o.items) as { name: string; qty: number }[]).map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </td>
                <td className="px-4 py-3 capitalize">{o.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">${o.total.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{o.refunded_amount ? `$${o.refunded_amount.toFixed(2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
