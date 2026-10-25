"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CustomerOrder } from "@/lib/customer-orders";
import { pulseHaptics } from "@/lib/haptics";

export default function OrderConfirmation({ order, busy, error, onConfirm, onDismiss }: {
  order: CustomerOrder;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const sheet = dialog.current;
    sheet?.showModal();
    pulseHaptics([25, 70, 25]);
    return () => { sheet?.close(); };
  }, []);
  return <dialog ref={dialog} className="order-confirmation" aria-labelledby="confirm-order-title" onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}>
    <div className="confirmation-heading"><span className="eyebrow">READY WHEN YOU ARE</span><button className="text-button" aria-label="Close order confirmation" disabled={busy} onClick={onDismiss}>✕</button></div>
    <h2 id="confirm-order-title">{order.invoiceId ? "Ready for Phantom" : "Confirm your internal order"}</h2>
    <p>{order.merchantName} · {order.merchantArea}</p>
    <div className="confirmation-items">{order.lines.map((line, index) => <div className="summary-row" key={index}><span>{line.quantity} × {line.description}</span><strong>{(line.quantity * line.unitCents / 100).toFixed(2)}</strong></div>)}</div>
    <p className="confirmation-total">{(order.totalCents / 100).toFixed(2)} <small>test USDC</small></p>
    <details><summary>Receiving wallet & order details</summary><code>{order.recipient}</code><p className="small">Order {order.id}</p></details>
    <p className="small muted">Devnet test only. Confirming accepts this order and total. No funds move until you approve in Phantom.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {order.invoiceId ? <Link className="button dark full" href={`/pay/${order.invoiceId}`}>Open wallet payment →</Link> : <button className="button dark full" disabled={busy} onClick={onConfirm}>{busy ? "Opening checkout…" : "Confirm order & open wallet payment →"}</button>}
    <button className="text-button full" disabled={busy} onClick={onDismiss}>Keep talking / change order</button>
  </dialog>;
}
