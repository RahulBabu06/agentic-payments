"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Brand, errorText, TestBanner } from "@/components/shared";
import type { CustomerOrder } from "@/lib/customer-orders";

type Order = CustomerOrder & { paymentStatus: string };
export default function CustomerAccount() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("customer/account").then(c => { setAuthenticated(c.authenticated); setLoaded(true); }).catch(e => setError(errorText(e))); }, []);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    const load = () => api("customer/orders").then(d => { if (!stopped) setOrders(d.orders); }).catch(e => { if (!stopped) setError(errorText(e)); });
    load(); const timer = setInterval(load, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [authenticated]);
  return <div className="customer-shell"><header className="customer-header"><Brand /><Link href="/business">Business sign in ↗</Link></header><TestBanner /><main className="customer-main">
    <p className="eyebrow">CUSTOMER ACCOUNT</p><h1>Welcome, Alex Demo.</h1>
    <p className="notice">One shared demo account. Anyone entering this demo can see its test orders and receipts. Do not enter personal information.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {!loaded ? <p>Loading account…</p> : !authenticated ? <button className="button dark" disabled={busy} onClick={async () => { setBusy(true); try { await api("customer/session", "POST", {}); setAuthenticated(true); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>Enter demo customer account</button> : <>
      <div className="section-heading"><Link className="button dark" href="/customer/shop">Order food & drinks →</Link><button className="button secondary" onClick={async () => { await api("customer/logout", "POST", {}); setAuthenticated(false); setOrders([]); }}>Sign out</button></div>
      <h2>Your orders</h2>{!orders.length && <p className="notice">No orders yet. Browse a store or speak to your ordering agent.</p>}
      {orders.map(order => <section className="card" key={order.id}><div className="section-heading"><h3>{order.merchantName}</h3><strong>{(order.totalCents / 100).toFixed(2)} test USDC</strong></div>
        <p className="small muted">Order {order.id}</p><p>{order.lines.map(l => `${l.quantity} × ${l.description}`).join(", ")}</p>
        <p>Payment: {order.paymentStatus.replaceAll("_", " ")} · Processing: {order.fulfilment.replaceAll("_", " ")}</p>
        {order.invoiceId ? <Link className="inline-link" href={`/pay/${order.invoiceId}`}>{order.paymentStatus === "paid" ? "Payment confirmation" : "Continue wallet payment"} →</Link> : <Link className="inline-link" href={`/customer/shop?review=${order.id}`}>Review internal order →</Link>}
        {order.paymentStatus === "paid" && !order.receiptSentAt && <p>Waiting for the business to send your receipt.</p>}
      </section>)}
      <h2>Receipt inbox</h2>{!orders.some(o => o.receiptSentAt) && <p className="notice">Receipts appear here when the business sends them after finalized payment.</p>}
      {orders.filter(o => o.receiptSentAt).map(o => <section className="card" key={o.id}><h3>{o.merchantName}</h3><p>Received {new Date(o.receiptSentAt!).toLocaleString()} · {(o.totalCents / 100).toFixed(2)} test USDC</p><Link className="button secondary" href={`/document/${o.invoiceId}`}>Open merchant receipt →</Link></section>)}
    </>}
  </main></div>;
}
