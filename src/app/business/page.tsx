"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Brand, errorText, TestBanner } from "@/components/shared";
import { merchants, getMerchant } from "@/lib/merchants";
import type { CustomerOrder } from "@/lib/customer-orders";

export default function Business() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [merchantId, setMerchantId] = useState(merchants[0].id);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("config").then(c => setAuthenticated(c.authenticated)).catch(e => setError(errorText(e))); }, []);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    setOrders([]);
    const load = () => api(`business/${merchantId}/orders`).then(d => { if (!stopped) setOrders(d.orders); }).catch(e => { if (!stopped) setError(errorText(e)); });
    load(); const timer = setInterval(load, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [authenticated, merchantId]);
  async function act(order: CustomerOrder, action: string) {
    setBusy(true); setError("");
    try { const data = await api(`business/${merchantId}/orders/${order.id}`, "POST", { action }); setOrders(rows => rows.map(o => o.id === order.id ? data.order : o)); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <div className="customer-shell"><header className="customer-header"><Brand /><Link href="/customer">Customer account ↗</Link></header><TestBanner /><main className="customer-main">
    <p className="eyebrow">BUSINESS ACCOUNTS / NO AI REQUIRED</p><h1>Orders in.<br />Good service out.</h1>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!authenticated ? <form className="card" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api("session", "POST", { password }); setAuthenticated(true); setPassword(""); setError(""); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } }}>
      <h2>Business sign in</h2><p>One demo password unlocks all five business accounts.</p><label>Business password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="button dark" disabled={busy}>Unlock business dashboards</button></form> : <>
      <div className="section-heading"><label>Business account<select value={merchantId} disabled={busy} onChange={e => { setMerchantId(e.target.value); setError(""); }}>{merchants.map(m => <option key={m.id} value={m.id}>{m.name} · {m.area}</option>)}</select></label><button className="button secondary" onClick={async () => { await api("logout", "POST", {}); setAuthenticated(false); setOrders([]); }}>Sign out</button></div>
      <h2>{getMerchant(merchantId).name} dashboard</h2><p className="notice">Fictional business · verification simulated. Only finalized, matched USDC payments appear. Send the receipt before starting preparation.</p>
      {!orders.length && <p>No paid orders for this business yet.</p>}
      {orders.map(o => <section className="card" key={o.id}><div className="section-heading"><h3>Alex Demo · {(o.totalCents / 100).toFixed(2)} test USDC</h3><strong>Paid · finalized</strong></div><p className="small muted">Order {o.id}</p><p>{o.lines.map(l => `${l.quantity} × ${l.description}`).join(", ")}</p><p>Processing: {o.fulfilment.replaceAll("_", " ")}</p>
        {!o.receiptSentAt ? <button className="button dark" disabled={busy} onClick={() => act(o, "send_receipt")}>Send receipt to customer account</button> : <><p>Receipt delivered to Alex Demo’s VoicePay inbox.</p>{o.fulfilment === "not_started" && <button className="button dark" disabled={busy} onClick={() => act(o, "preparing")}>Start preparing order</button>}{o.fulfilment === "preparing" && <button className="button dark" disabled={busy} onClick={() => act(o, "ready")}>Mark ready for collection</button>}{o.fulfilment === "ready" && <button className="button dark" disabled={busy} onClick={() => act(o, "collected")}>Mark collected</button>}</>}
      </section>)}
    </>}
  </main></div>;
}
