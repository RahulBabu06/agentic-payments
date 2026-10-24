"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, Brand, errorText, TestBanner } from "@/components/shared";
import { Invoice, money } from "@/lib/domain";

export default function Document({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api(`checkout/${id}`).then(d => setInvoice(d.invoice)).catch(e => setError(errorText(e))); }, [id]);
  return <div className="document-shell"><div className="no-print customer-header"><Brand /><div><Link className="button secondary" href={`/pay/${id}`}>Back to checkout</Link> <button className="button dark" onClick={() => window.print()}>Print / Save PDF</button></div></div><TestBanner />
    <main className="document card">{!invoice ? <p>{error || "Loading document…"}</p> : <>
      <div className="document-heading"><div><h1>{invoice.status === "paid" ? "Payment receipt" : "Invoice"}</h1><p>{invoice.number}{invoice.status === "paid" ? "-R" : ""}</p></div><div><h3>Demo Studio</h3><p>VoicePay test workspace</p><strong>DEVNET TEST · NO MONETARY VALUE</strong></div></div>
      <div className="form-row"><div><p className="eyebrow">BILLED TO</p><h2>{invoice.customer}</h2></div><div><p>Created: {new Date(invoice.createdAt).toLocaleDateString()}</p>{invoice.dueDate && <p>Due: {invoice.dueDate}</p>}<p>Status: {invoice.status === "paid" ? "Paid · finalized" : "Awaiting payment"}</p></div></div>
      <table><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{invoice.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{l.quantity}</td><td>{money(l.unitCents)}</td><td>{money(l.quantity * l.unitCents)}</td></tr>)}</tbody></table>
      <div className="invoice-total"><span>{invoice.status === "paid" ? "Total received" : "Total due"}</span><strong>{(invoice.totalCents / 100).toFixed(2)} test USDC</strong></div>
      <p>Network: Solana devnet · USD-denominated test invoice · No taxes calculated</p>
      <div className="address-box"><span>Merchant receiving wallet</span><code>{invoice.merchant}</code></div>
      {invoice.signature && <><div className="address-box"><span>Verified transaction signature</span><code>{invoice.signature}</code></div><p>Finalized and recorded: {new Date(invoice.paidAt!).toLocaleString()}</p><a className="inline-link" href={`https://explorer.solana.com/tx/${invoice.signature}?cluster=devnet`} target="_blank" rel="noreferrer">Verify in Solana Explorer ↗</a></>}
      <hr /><p className="muted small">This document records a devnet test transaction, not a transfer of real monetary value. It is not a tax-compliant invoice certification. Checkout links grant access to this invoice; share them only with the intended recipient.</p>
    </>}</main></div>;
}
