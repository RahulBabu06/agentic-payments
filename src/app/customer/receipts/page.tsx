"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Brand, errorText, TestBanner } from "@/components/shared";
import type { CustomerOrder } from "@/lib/customer-orders";

type Order = CustomerOrder & { paymentStatus: string };

export default function CustomerReceipts() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    api("customer/account").then(account => {
      if (mounted) { setAuthenticated(account.authenticated); setLoaded(true); }
    }).catch(e => { if (mounted) { setError(errorText(e)); setLoaded(true); } });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    const load = () => api("customer/orders").then(data => { if (!stopped) setOrders(data.orders); }).catch(e => { if (!stopped) setError(errorText(e)); });
    load();
    const timer = setInterval(load, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [authenticated]);
  return <div className="customer-shell"><header className="customer-header"><Brand /><Link className="inline-link" href="/customer">Back to voice ordering ↗</Link></header><TestBanner /><main className="customer-main">
    <p className="eyebrow">ALEX DEMO</p><h1>Orders & receipts.</h1>
    <p className="notice">Shared demo account. Do not enter personal information.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {!loaded ? <p>Loading account…</p> : !authenticated ? <Link className="button dark" href="/customer">Open customer demo →</Link> : <>
      <h2>Receipt inbox</h2>
      {!orders.some(order => order.receiptSentAt) && <p className="notice">Receipts appear here when the business sends them after finalized payment.</p>}
      {orders.filter(order => order.receiptSentAt).map(order => <section className="card checkout-summary" key={order.id}><h3>{order.merchantName}</h3><p>Received {new Date(order.receiptSentAt!).toLocaleString()} · {(order.totalCents / 100).toFixed(2)} test USDC</p><Link className="button secondary" href={`/document/${order.invoiceId}`}>Open merchant receipt →</Link></section>)}
      <h2>Your orders</h2>
      {!orders.length && <p>No orders yet. Start with voice ordering.</p>}
      {orders.map(order => <section className="card checkout-summary" key={order.id}>
        <div className="section-heading"><h3>{order.merchantName}</h3><strong>{(order.totalCents / 100).toFixed(2)} test USDC</strong></div>
        <p>{order.lines.map(line => `${line.quantity} × ${line.description}`).join(", ")}</p>
        <p>Payment: {order.paymentStatus.replaceAll("_", " ")} · Processing: {order.fulfilment.replaceAll("_", " ")}</p>
        {order.invoiceId ? <Link className="inline-link" href={`/pay/${order.invoiceId}`}>{order.paymentStatus === "paid" ? "Payment confirmation" : "Continue wallet payment"} →</Link> : <Link className="inline-link" href={`/customer?review=${order.id}`}>Review internal order →</Link>}
        {order.paymentStatus === "paid" && !order.receiptSentAt && <p>Waiting for the business to send your receipt.</p>}
      </section>)}
    </>}
  </main></div>;
}
