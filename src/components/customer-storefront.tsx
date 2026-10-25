"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Assistant, api, Brand, errorText, TestBanner } from "@/components/shared";
import { getMerchant, merchants, searchMerchants } from "@/lib/merchants";
import { cartLines, cartSchema, sameCart, Cart } from "@/lib/catalog";
import { money } from "@/lib/domain";
import dynamic from "next/dynamic";
import type { CustomerOrder } from "@/lib/customer-orders";
import OrderConfirmation from "@/components/order-confirmation";

const VoiceAgent = dynamic(() => import("@/components/voice-agent"), { ssr: false });

// Deduplicate Strict Mode mounts and simultaneous customer entry points.
let sessionRequest: Promise<void> | undefined;
function openDemoSession() {
  if (!sessionRequest) {
    sessionRequest = api("customer/account").then(async account => {
      if (!account.authenticated) await api("customer/session", "POST", {});
    }).finally(() => { sessionRequest = undefined; });
  }
  return sessionRequest;
}

export default function Storefront() {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState(merchants[0].id);
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [internalOrder, setInternalOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const confirming = useRef(false);
  const [wallets, setWallets] = useState<Record<string, { paymentReady: boolean; paymentSetup: string }>>({});
  useEffect(() => {
    let mounted = true;
    setRequestId(crypto.randomUUID());
    const selected = new URLSearchParams(window.location.search).get("store");
    if (selected && merchants.some(store => store.id === selected)) setMerchantId(selected);
    const review = new URLSearchParams(window.location.search).get("review");
    openDemoSession().then(async () => {
      if (!mounted) return;
      setAuthenticated(true);
      if (review) {
        const { order } = await api(`customer/orders/${review}`);
        if (!mounted) return;
        setMerchantId(order.merchantId);
        setQuantities(Object.fromEntries(order.cart.items.map((i: { id: string; quantity: number }) => [i.id, i.quantity])));
        setInternalOrder(order);
        setShowConfirmation(true);
      }
    }).catch(e => { if (mounted) setError(errorText(e)); });
    api("merchants").then(c => setWallets(Object.fromEntries(c.merchants.map((store: any) => [store.id, store])))).catch(e => setError(errorText(e)));
    return () => { mounted = false; };
  }, [router]);
  const store = getMerchant(merchantId);
  const items = store.menu.filter(p => quantities[p.id] > 0).map(p => ({ id: p.id, quantity: quantities[p.id] }));
  const current: Cart = { merchantId, items };
  const total = cartLines(current).reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  const configured = wallets[merchantId]?.paymentReady === true;
  function resetReview() { setInternalOrder(null); setShowConfirmation(false); setRequestId(crypto.randomUUID()); }
  function chooseStore(id: string) {
    getMerchant(id);
    setMerchantId(id); setQuantities({}); resetReview(); setError("");
    window.history.replaceState(null, "", `/customer?store=${id}`);
  }
  function applyOrder(input: unknown) {
    if (busy) return;
    try {
      const order = cartSchema.parse(input);
      cartLines(order);
      setMerchantId(order.merchantId);
      setQuantities(Object.fromEntries(order.items.map(item => [item.id, item.quantity])));
      if (!sameCart(order, current)) resetReview();
      setError("");
      window.history.replaceState(null, "", `/customer?store=${order.merchantId}`);
    } catch { setError("The assistant returned an invalid cart. Please choose items from the menu."); }
  }
  function assistantResult(result: any) {
    // Menu retrieval is spoken from the catalog and must not replace the cart.
    if (result.action === "show_menu") return;
    if (result.order) applyOrder(result.order);
    if (result.internalOrder) { setInternalOrder(result.internalOrder); setShowConfirmation(true); }
  }
  async function confirmOrder() {
    if (!internalOrder || confirming.current) return;
    confirming.current = true;
    setBusy(true); setError("");
    try {
      const { order } = await api(`customer/orders/${internalOrder.id}/confirm`, "POST", { confirmed: true });
      setInternalOrder(order);
      router.push(`/pay/${order.invoiceId}`);
    } catch (err) { setError(errorText(err)); }
    finally { confirming.current = false; setBusy(false); }
  }
  if (!authenticated) return <main className="customer-main">{error ? <><p className="notice error" role="alert">{error}</p><button className="button secondary" onClick={() => window.location.reload()}>Retry opening demo</button></> : <p>Opening voice ordering…</p>}</main>;
  return <div className="customer-shell voice-first-shell"><header className="customer-header"><Brand /><Link className="inline-link" href="/customer/receipts">Receipts ↗</Link></header><TestBanner /><main className="customer-main">
    <h1>Just say the word.</h1><p className="subtitle">Order with your voice. Approve with your wallet.</p>
    <VoiceAgent scope="order" disabled={busy} current={current} requestId={requestId} pendingOrderId={internalOrder?.id} onResult={assistantResult} />
    {internalOrder && <button className="button secondary full" onClick={() => setShowConfirmation(true)}>Review {internalOrder.merchantName} · {(internalOrder.totalCents / 100).toFixed(2)} test USDC</button>}
    {internalOrder && showConfirmation && <OrderConfirmation order={internalOrder} busy={busy} error={error} onConfirm={confirmOrder} onDismiss={() => { if (!busy) setShowConfirmation(false); }} />}
    <p className="small muted">Five fictional stores. Shared Alex Demo account. No real orders or fulfilment. Merchant verification is simulated.</p>
    <details className="manual-fallback"><summary>Can’t use voice? Order manually or type instead</summary>
    <section className="merchant-directory" aria-label="Find a demo store">
      <label>Search stores<input type="search" placeholder="Try Maple, Soho, pizza or bar…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="merchant-grid">{searchMerchants(query).map(merchant => <button key={merchant.id} className={`card merchant-option ${merchant.id === merchantId ? "selected" : ""}`} disabled={busy} onClick={() => chooseStore(merchant.id)} aria-pressed={merchant.id === merchantId}>
        <span className="eyebrow">{merchant.category} · {merchant.area}</span><strong>{merchant.name}</strong><span>{merchant.description}</span><small>Simulated verification · {wallets[merchant.id]?.paymentReady ? "Devnet payments ready" : "Wallet setup pending"}</small>
      </button>)}</div>
      {!searchMerchants(query).length && <p className="notice">No demo stores match. Try coffee, restaurant, bar, Soho or Maple.</p>}
    </section>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="store-heading"><p className="eyebrow">SELECTED STORE · {store.category}</p><h2>{store.name}</h2><p className="muted">{store.area} · All menu prices in test USDC. No taxes or service charges added.</p></div>
    {!configured && <div className="notice">{store.name}: {wallets[merchantId]?.paymentSetup || "Checking receiving wallet configuration…"} You can browse and draft an order, but checkout is unavailable.</div>}
    <div className="store-grid"><section><fieldset disabled={busy}><div className="catalog-grid">{store.menu.map(p => <div className="card product-card" key={p.id}><span className="product-icon">◎</span><h3>{p.description}</h3><p>{p.detail}</p><div className="product-bottom"><strong>{(p.unitCents / 100).toFixed(2)} <small>USDC</small></strong><label className="quantity-control">Qty<input aria-label={`${p.description} quantity`} type="number" min="0" max="100" step="1" value={quantities[p.id] || 0} onChange={e => { setQuantities({ ...quantities, [p.id]: Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0))) }); resetReview(); }} /></label></div></div>)}</div></fieldset>
    <section className="card checkout-summary"><h2>Your order · {store.name}</h2>{items.length === 0 ? <p className="muted">Choose something above to get started.</p> : items.map(i => <div className="summary-row" key={i.id}><span>{i.quantity} × {store.menu.find(p => p.id === i.id)!.description}</span><strong>{money(i.quantity * store.menu.find(p => p.id === i.id)!.unitCents)}</strong></div>)}<div className="invoice-total"><span>Total · test USDC</span><strong>{(total / 100).toFixed(2)} USDC</strong></div>
      <p>Ordering as Alex Demo. No payment is made until your wallet signs.</p>
      {!internalOrder ? <button className="button dark full" disabled={busy || !items.length || !configured || !requestId} onClick={async () => { setBusy(true); setError(""); try { const { order } = await api("customer/orders", "POST", { merchantId, items, requestId }); setInternalOrder(order); setShowConfirmation(true); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } }}>Place order for confirmation →</button> : <button className="text-button" disabled={busy} onClick={resetReview}>Discard review / request a fresh quote</button>}
    </section></section><div>
      <Assistant key={merchantId} endpoint="order-assistant" current={current} requestId={requestId} pendingOrderId={internalOrder?.id} disabled={busy} title="Meet your order assistant" placeholder="Two black coffees and a latte from Maple Coffee in Oxford Circus…" onResult={assistantResult} /><div className="trust-card"><span>◇</span><div><h3>Your wallet. Your approval.</h3><p>No seed phrases, no stored keys. You review every payment in Phantom before it is sent. One store per checkout; changing stores clears your cart.</p></div></div>
    </div></div>
    </details>
  </main></div>;
}
