"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { ApiError, Assistant, api, Badge, Brand, errorText, TestBanner } from "@/components/shared";
import { Invoice, money } from "@/lib/domain";
import dynamic from "next/dynamic";

const VoiceAgent = dynamic(() => import("@/components/voice-agent"), { ssr: false });

type Phantom = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};
function provider(): Phantom | undefined {
  const w = window as unknown as { phantom?: { solana?: Phantom }; solana?: Phantom };
  return w.phantom?.solana || (w.solana?.isPhantom ? w.solana : undefined);
}
export default function Checkout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [address, setAddress] = useState("");
  const [signature, setSignature] = useState("");
  const [manualSignature, setManualSignature] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const load = useCallback(async () => {
    const data = await api(`checkout/${id}`);
    setInvoice(data.invoice);
    const existing = data.pending?.[0]?.signature || localStorage.getItem(`voicepay:${id}`);
    if (existing && data.invoice.status !== "paid") setSignature(existing);
  }, [id]);
  useEffect(() => { load().catch(e => setError(errorText(e))); }, [load]);
  useEffect(() => {
    if (!signature || invoice?.status === "paid") return;
    let stopped = false;
    let running = false;
    async function verify() {
      if (running) return;
      running = true;
      try {
        const data = await api(`checkout/${id}/verify`, "POST", { signature });
        if (stopped) return;
        if (data.invoice) setInvoice(data.invoice);
        setStatus(data.pending ? data.message : data.paid ? "Payment finalized. Check your account for the business receipt." : data.exception || "Payment needs review.");
        if (!data.pending) {
          localStorage.removeItem(`voicepay:${id}`);
          setSignature("");
        }
      } catch (e) { if (!stopped) setStatus(`${errorText(e)} Verification will retry. Do not pay again.`); }
      finally { running = false; }
    }
    verify();
    const timer = setInterval(verify, 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [signature, id, invoice?.status]);
  async function connect() {
    setError("");
    const wallet = provider();
    if (!wallet) { setError("Install Phantom or open this page in Phantom’s in-app browser. Never share a seed phrase with this app."); return; }
    try { setAddress((await wallet.connect()).publicKey.toBase58()); }
    catch { setError("Wallet connection was cancelled."); }
  }
  async function pay() {
    setBusy(true); setError(""); setStatus("");
    let signed = false;
    try {
      const wallet = provider();
      if (!wallet) throw new Error("Connect Phantom first.");
      const connected = await wallet.connect();
      const payer = connected.publicKey.toBase58();
      if (payer !== address) { setAddress(payer); setReviewed(false); throw new Error("Wallet account changed. Review the payment again."); }
      const prepared = await api(`checkout/${id}/prepare`, "POST", { payer });
      setStatus("Review the USDC amount and merchant in your wallet.");
      const transaction = Transaction.from(Uint8Array.from(atob(prepared.transaction), c => c.charCodeAt(0)));
      const approved = await wallet.signTransaction(transaction);
      if (!approved.signature) throw new Error("Wallet did not sign.");
      signed = true;
      const sig = bs58.encode(approved.signature);
      // Keep the signature even if the broadcast response is lost.
      localStorage.setItem(`voicepay:${id}`, sig);
      setStatus("Submitting your signed payment…");
      try {
        const submitted = await api(`checkout/${id}/submit`, "POST", { transaction: btoa(String.fromCharCode(...approved.serialize())) });
        if (submitted.rejected) {
          localStorage.removeItem(`voicepay:${id}`);
          setSignature("");
          setStatus("");
          setError(submitted.message);
          return;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          localStorage.removeItem(`voicepay:${id}`);
          setStatus("");
          setError(`${errorText(e)} The server did not broadcast this request. Refresh to check for an existing payment.`);
          await load();
          return;
        }
        setError(`${errorText(e)} Your signed payment may not have reached the network. Check the transaction before trying again.`);
      }
      setSignature(sig);
      setStatus("Awaiting finalized settlement. Do not pay again.");
    } catch (e) {
      setError(errorText(e));
      if (!signed) setStatus("No payment was submitted by this checkout.");
    } finally { setBusy(false); }
  }
  const paid = invoice?.status === "paid";
  return <div className="customer-shell"><header className="customer-header"><Brand /><span className="network-pill">◎ Secure wallet checkout</span></header><TestBanner />
    <main className="payment-main">
      <div className="payment-title"><p className="eyebrow">{invoice?.merchantName || "VOICEPAY"} · PAYMENT REQUEST</p><h1>{paid ? "All settled." : "Your wallet. Your payment."}</h1><p className="subtitle">{paid ? "Matched on-chain. Recorded automatically." : "Review your invoice, then approve in your own wallet."}</p></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {status && <div className="notice" role="status">{status}</div>}
      {!invoice ? <section className="card empty-state">{error ? "Unable to open this payment request." : "Loading payment request…"}</section> : <div className="payment-grid">
        <section className="card payment-card"><div className="section-heading"><span className="eyebrow">{invoice.number}</span><Badge status={invoice.status} /></div>
          <div className="notice"><strong>Paying {invoice.merchantName || "Legacy Demo Studio"}</strong>{invoice.merchantArea && <span> · {invoice.merchantArea}</span>}<br />Fictional demo merchant · verification simulated · no real fulfilment.</div>
          <p className="muted">Billed to</p><h2>{invoice.customer}</h2>{invoice.dueDate && <p className="small muted">Due {invoice.dueDate}</p>}
          <div className="payment-lines">{invoice.lines.map((line, i) => <div className="summary-row" key={i}><div>{line.description}<small>{line.quantity} × {money(line.unitCents)}</small></div><strong>{money(line.quantity * line.unitCents)}</strong></div>)}</div>
          <div className="payment-amount"><span>Total payable</span><strong>{(invoice.totalCents / 100).toFixed(2)} <small>USDC</small></strong><span>Solana devnet · test tokens only</span></div>
          <div className="address-box"><span>Receiving wallet</span><code>{invoice.merchant}</code></div>
          {paid ? <div className="paid-panel"><span className="success-icon">✓</span><h2>Payment finalized</h2><p>Your payment was verified and matched to this invoice. The business sends your receipt to your VoicePay account.</p><Link className="button dark full" href="/customer">Orders & receipt inbox →</Link><Link className="inline-link" href={`/document/${id}`}>View payment document →</Link><a className="inline-link" href={`https://explorer.solana.com/tx/${invoice.signature}?cluster=devnet`} target="_blank" rel="noreferrer">View transaction on Solana ↗</a></div> : <>
            <div className="wallet-section"><h3>Pay with Phantom</h3><p>You need devnet USDC plus a little devnet SOL for network fees and, if needed, token-account creation.</p>
              {!address ? <button className="button secondary full" onClick={connect}>Connect Phantom wallet</button> : <div className="connected-wallet"><span className="live-dot" /> {address.slice(0, 6)}…{address.slice(-6)} <button className="text-button" disabled={busy || !!signature} onClick={async () => { await provider()?.disconnect(); setAddress(""); setReviewed(false); }}>Disconnect</button></div>}
              <label className="checkbox"><input type="checkbox" checked={reviewed} disabled={!!signature} onChange={e => setReviewed(e.target.checked)} /> I reviewed the recipient and amount. I understand these are devnet test tokens.</label>
              <button className="button green full" disabled={busy || !!signature || !address || !reviewed || acknowledged} onClick={pay}>{busy ? "Waiting for wallet…" : signature ? "Verifying payment…" : acknowledged ? "Check existing payment first" : `Approve ${(invoice.totalCents / 100).toFixed(2)} test USDC →`}</button>
              <label className="checkbox"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> I already sent a payment. Do not prepare another.</label>
            </div>
            <details className="reconcile"><summary>Already paid? Verify a transaction</summary><p className="small">Paste the signature of a payment made through this checkout. The backend will verify it; a signature alone is not proof.</p><form onSubmit={e => { e.preventDefault(); localStorage.setItem(`voicepay:${id}`, manualSignature.trim()); setSignature(manualSignature.trim()); }}><input aria-label="Transaction signature" value={manualSignature} onChange={e => setManualSignature(e.target.value)} required pattern="[1-9A-HJ-NP-Za-km-z]{64,88}" placeholder="Solana transaction signature" /><button className="button secondary" disabled={!!signature}>Verify transaction</button></form></details>
          </>}
        </section>
        <div><VoiceAgent key={id} scope="checkout" invoiceId={id} disabled={busy} /><Assistant key={invoice.status} endpoint={`checkout/${id}/assistant`} title="A little help at checkout" placeholder="How do I get test USDC? Has this invoice been paid?" /><div className="trust-card"><span>◇</span><div><h3>Never share your seed phrase.</h3><p>VoicePay prepares the payment. Only your wallet can approve it. We never hold your keys or your funds.</p></div></div><div className="funding-links"><h3>Need test funds?</h3><a target="_blank" rel="noreferrer" href="https://faucet.solana.com/">Get devnet SOL ↗</a><a target="_blank" rel="noreferrer" href="https://faucet.circle.com/">Get devnet USDC from Circle ↗</a><p className="small muted">Select Solana devnet. Test SOL and test USDC are separate assets. Use a dedicated test wallet.</p></div><Link href={`/document/${id}`} className="inline-link">View printable invoice ↗</Link></div>
      </div>}
    </main>
  </div>;
}
