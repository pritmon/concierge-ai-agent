"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Demo storefront that embeds the chat widget exactly as a customer site would.

const PERSONAS = [
  { key: "guest", label: "Guest", email: undefined, name: undefined },
  { key: "alex", label: "Alex (signed in)", email: "alex@example.com", name: "Alex Rivera" },
  { key: "sam", label: "Sam (signed in)", email: "sam@example.com", name: "Sam Chen" },
];

const PRODUCTS = [
  { name: "Summit Down Jacket", price: 229, color: "from-slate-700 to-slate-900" },
  { name: "Ridgeline Rain Shell", price: 149, color: "from-emerald-600 to-emerald-800" },
  { name: "Alpine 45L Backpack", price: 189, color: "from-orange-500 to-orange-700" },
  { name: "Basecamp Fleece", price: 79, color: "from-sky-500 to-sky-700" },
];

export default function Storefront() {
  const [persona, setPersona] = useState("guest");

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("as") ?? "guest";
    const p = PERSONAS.find((x) => x.key === key) ?? PERSONAS[0];
    // Persona comes from the URL; read after mount to keep hydration stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersona(p.key);
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    if (p.email) script.dataset.customerEmail = p.email;
    if (p.name) script.dataset.customerName = p.name;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="min-h-dvh bg-stone-50">
      <div className="bg-slate-900 px-4 py-2 text-center text-xs text-slate-300">
        Demo storefront · the chat bubble in the corner is the AI agent ·{" "}
        <Link href="/admin" className="font-medium text-white underline">
          Open the admin dashboard →
        </Link>
      </div>

      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <div className="text-xl font-bold tracking-tight">Northwind Outfitters</div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white p-1 text-sm shadow-sm ring-1 ring-slate-200">
          <span className="px-2 text-xs text-slate-500">Browse as</span>
          {PERSONAS.map((p) => (
            // Full reload so the widget re-initialises with the new identity.
            <a
              key={p.key}
              href={p.key === "guest" ? "/" : `/?as=${p.key}`}
              className={`rounded-md px-2.5 py-1 ${persona === p.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-800 to-slate-900 px-6 py-16 text-white sm:px-12">
          <p className="text-sm uppercase tracking-widest text-emerald-200">Fall collection</p>
          <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">Gear built for the long way round.</h1>
          <p className="mt-4 max-w-md text-emerald-50/80">Free shipping over $75 · 30-day returns · Lifetime craftsmanship warranty</p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 pb-24 md:grid-cols-4">
          {PRODUCTS.map((p) => (
            <div key={p.name} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              <div className={`aspect-square bg-gradient-to-br ${p.color}`} />
              <div className="p-3">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-sm text-slate-500">${p.price}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
