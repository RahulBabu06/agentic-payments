"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Assistant, api, Brand, errorText, TestBanner } from "@/components/shared";
import { catalog } from "@/lib/catalog";
import { money } from "@/lib/domain";
import dynamic from "next/dynamic";

const VoiceAgent = dynamic(() => import("@/components/voice-agent"), { ssr: false });

export default function Storefront() {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState("");
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);
  useEffect(() => { api("config").then(c => setConfigured(c.merchantConfigured)).catch(e => setError(errorText(e))); }, []);
  const items = catalog.filter(p => quantities[p.id] > 0).map(p => ({ id: p.id, quantity: quantities[p.id] }));
  const total = catalog.reduce((sum, p) => sum + p.unitCents * (quantities[p.id] || 0), 0);
  return <div className="customer-shell"><header className="customer-header"><Brand /><Link className="inline-link" href="/">Business workspace ↗</Link></header><TestBanner /><main className="customer-main">
    <p className="eyebrow">DEMO STUDIO / CUSTOMER CHECKOUT</p><h1>A little less checkout.<br />A little more conversation.</h1><p className="subtitle">Pick a service or ask Gemini to help. Pay from your own wallet.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    {!configured && <div className="notice">The business must configure its receiving wallet before checkout can open.</div>}
    <div className="store-grid"><section><div className="catalog-grid">{catalog.map(p => <div className="card product-card" key={p.id}><span className="product-icon">{p.id === "demo" ? "◎" : p.id === "design" ? "✧" : p.id === "support" ? "⌘" : "↗"}</span><h3>{p.description}</h3><p>{p.detail}</p><div className="product-bottom"><strong>{money(p.unitCents)}</strong><label className="quantity-control">Qty<input aria-label={`${p.description} quantity`} type="number" min="0" max="100" step="1" value={quantities[p.id] || 0} onChange={e => { setQuantities({ ...quantities, [p.id]: Math.max(0, Math.min(100, Math.floor(Number(e.target.value)))) }); setApproved(false); }} /></label></div></div>)}</div>
    <section className="card checkout-summary"><h2>Your order</h2>{items.length === 0 ? <p className="muted">Choose something above to get started.</p> : items.map(i => <div className="summary-row" key={i.id}><span>{i.quantity} × {catalog.find(p => p.id === i.id)!.description}</span><strong>{money(i.quantity * catalog.find(p => p.id === i.id)!.unitCents)}</strong></div>)}<div className="invoice-total"><span>Total · test USDC</span><strong>{money(total)}</strong></div>
      <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const { invoice } = await api("orders", "POST", { items, customer }); router.push(`/pay/${invoice.id}`); } catch (err) { setError(errorText(err)); setBusy(false); } }}>
        <label>Your name or business<input value={customer} required maxLength={120} onChange={e => setCustomer(e.target.value)} placeholder="Who should the invoice be made out to?" /></label>
        <label className="checkbox"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> I reviewed this order and its total. This is a devnet test.</label>
        <button className="button dark full" disabled={busy || !approved || !items.length || !configured}>{busy ? "Preparing checkout…" : "Proceed to wallet payment →"}</button>
      </form>
    </section></section><div>
      <VoiceAgent scope="order" disabled={busy} current={items.length ? { items } : undefined} onOrder={order => { setQuantities(Object.fromEntries(order.items.map(i => [i.id, i.quantity]))); setApproved(false); }} />
      <Assistant endpoint="order-assistant" current={items.length ? { items } : undefined} title="Meet your order assistant" placeholder="What do you offer? Or: add one demo service…" onResult={r => { if (r.order && !busy) { setQuantities(Object.fromEntries(r.order.items.map((i: any) => [i.id, i.quantity]))); setApproved(false); } }} /><div className="trust-card"><span>◇</span><div><h3>Your wallet. Your approval.</h3><p>No seed phrases, no stored keys. You review every payment in Phantom before it is sent.</p></div></div>
    </div></div>
  </main></div>;
}
