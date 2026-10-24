"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Assistant, api, Badge, Brand, errorText, TestBanner } from "@/components/shared";
import { Draft, Invoice, money, totalCents } from "@/lib/domain";
import QRCode from "qrcode";

const empty: Draft = { customer: "", dueDate: "", lines: [{ description: "", quantity: 1, unitCents: 100 }] };
export default function Dashboard() {
  const [config, setConfig] = useState<any>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const editorRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [qr, setQr] = useState("");
  const [tab, setTab] = useState("invoices");
  async function refresh(reloadConfig = true) {
    const c = reloadConfig ? await api("config") : config;
    if (reloadConfig) setConfig(c);
    if (c.authenticated) {
      const data = await api("invoices");
      setInvoices(data.invoices); setPayments(data.payments);
      setSelected(previous => previous ? data.invoices.find((i: Invoice) => i.id === previous.id) || null : null);
    }
  }
  useEffect(() => { refresh().catch(e => setError(errorText(e))); }, []);
  useEffect(() => {
    if (!config?.authenticated) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try { await refresh(false); } catch { /* Keep the current view during a transient poll failure. */ }
      finally { running = false; }
    }, 10000);
    return () => clearInterval(timer);
  }, [config?.authenticated]);
  useEffect(() => {
    setQr("");
    if (selected && selected.status !== "draft") {
      QRCode.toDataURL(`${window.location.origin}/pay/${selected.id}`, { width: 200, margin: 1 }).then(setQr);
    }
  }, [selected?.id, selected?.status]);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  function choose(invoice: Invoice | null) {
    setSelected(invoice);
    setDraft(invoice ? { customer: invoice.customer, dueDate: invoice.dueDate, lines: invoice.lines } : structuredClone(empty));
    setReviewed(false); setError(""); setSuccess("");
  }
  const readOnly = selected !== null && selected.status !== "draft";
  const edited = selected && JSON.stringify({ customer: selected.customer, dueDate: selected.dueDate, lines: selected.lines }) !== JSON.stringify(draft);
  const paid = invoices.filter(i => i.status === "paid");
  const outstanding = invoices.filter(i => i.status === "issued");
  const exceptions = payments.filter(p => p.outcome !== "Matched");
  let total = 0; try { total = totalCents(draft.lines); } catch {}
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="workspace"><span className="workspace-avatar">D</span><div>Demo Studio<small>Business workspace</small></div><span className="muted">⌄</span></div>
      <p className="nav-label">WORKSPACE</p>
      <nav>
        <button className={tab === "invoices" ? "nav-item active" : "nav-item"} onClick={() => setTab("invoices")}><span>▤</span> Invoices <small>{invoices.length}</small></button>
        <button className={tab === "payments" ? "nav-item active" : "nav-item"} onClick={() => setTab("payments")}><span>⇄</span> Payment matching {exceptions.length > 0 && <small>{exceptions.length}</small>}</button>
        <Link className="nav-item" href="/order"><span>↗</span> Customer storefront</Link>
      </nav>
      <div className="sidebar-bottom"><div className="network-pill"><span className="live-dot" /> Solana devnet</div><p>Real transactions.<br />Test tokens. Zero real funds.</p><span className="sidebar-caption">BUILT FOR THE WAY YOU WORK</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><span>Workspace <span className="muted">/</span> <strong>{tab === "invoices" ? "Invoices" : "Payment matching"}</strong></span><div><span className="network-pill">◎ Devnet USDC</span>{config?.authenticated && <button className="text-button" onClick={() => action(async () => { await api("logout", "POST", {}); setInvoices([]); setPayments([]); choose(null); await refresh(); })}>Sign out</button>}</div></header>
      <TestBanner />
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">LESS ADMIN. MORE BUSINESS.</p><h1>{tab === "invoices" ? "Payments, in conversation." : "Every payment, accounted for."}</h1><p className="subtitle">{tab === "invoices" ? "Create an invoice. Share a link. Let settlement handle the rest." : "On-chain evidence, matched to the right invoice. No guesswork."}</p></div>{config?.authenticated && <button className="button dark" onClick={() => { setTab("invoices"); choose(null); }}>＋ New invoice</button>}</div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {success && <div className="notice" role="status">{success}</div>}
        {!config ? <div className="card empty-state">Loading your workspace…</div> : !config.authenticated ? <div className="login-layout"><section className="card login-card"><span className="large-icon">↗</span><h2>Your business, connected.</h2><p>Sign in to create invoices and reconcile test USDC payments.</p>
          {!config.authConfigured && <div className="notice">Set <code>BUSINESS_PASSWORD</code> in <code>.env.local</code> and restart the app. See the setup guide in README.</div>}
          <form onSubmit={e => { e.preventDefault(); action(async () => { await api("session", "POST", { password }); setPassword(""); await refresh(); }); }}>
            <label>Workspace password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            <button className="button dark full" disabled={busy || !config.authConfigured}>{busy ? "Signing in…" : "Open workspace →"}</button>
          </form><Link className="inline-link" href="/order">Explore customer checkout instead ↗</Link>
        </section><section className="login-pitch"><span className="eyebrow">ONE CONNECTED WORKFLOW</span><h2>From a simple request<br />to a settled invoice.</h2><p>Gemini-assisted drafting. Customer-signed payments. Receipts backed by the chain.</p><div className="flow-step"><span>01</span> Prepare and review</div><div className="flow-step"><span>02</span> Share and collect</div><div className="flow-step"><span>03</span> Verify and reconcile</div></section></div> : <>
          <div className="stats-grid">
            <div className="card stat"><span>Collected · test USDC <b>↗</b></span><strong>{money(paid.reduce((s, i) => s + i.totalCents, 0))}</strong><small>{paid.length} finalized {paid.length === 1 ? "payment" : "payments"}</small></div>
            <div className="card stat"><span>Awaiting payment <b>◷</b></span><strong>{money(outstanding.reduce((s, i) => s + i.totalCents, 0))}</strong><small>{outstanding.length} open invoices</small></div>
            <div className="card stat"><span>Payment exceptions <b>⇄</b></span><strong>{exceptions.length.toString().padStart(2, "0")}</strong><small>Flagged for manual review</small></div>
          </div>
          {(!config.merchantConfigured || !config.geminiConfigured) && <div className="notice">Setup remaining: {!config.merchantConfigured && <span><code>MERCHANT_WALLET</code> for payment requests. </span>}{!config.geminiConfigured && <span><code>GEMINI_API_KEY</code> for the assistant. Manual drafting works without it.</span>}</div>}
          {tab === "payments" ? <section className="card table-card"><div className="section-heading"><h2>Verified payment records</h2><span className="muted">Only finalized transactions are matched</span></div>{payments.length === 0 ? <div className="empty-state"><span className="large-icon">⇄</span><h3>Nothing to reconcile. Yet.</h3><p>Verified transfers will appear here with their matching outcome.</p></div> : <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Invoice</th><th>Outcome</th><th>Verified</th></tr></thead><tbody>{payments.map(p => <tr key={p.signature}><td><a className="inline-link" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`}>{p.signature.slice(0, 12)}… ↗</a></td><td>{invoices.find(i => i.id === p.invoiceId)?.number}</td><td>{p.outcome}</td><td>{new Date(p.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</section> : <>
          <div className="editor-grid">
            <section ref={editorRef} className="card invoice-editor"><div className="section-heading"><div><p className="eyebrow">{selected?.number || "START SOMETHING NEW"}</p><h2>{readOnly ? "Invoice details" : selected ? "Edit draft" : "Create an invoice"}</h2></div>{selected ? <Badge status={selected.status} /> : <span className="badge draft">Not saved</span>}</div>
              {!readOnly && (!selected || edited) && <div className="notice">Unsaved draft preview. Review the details, then click <strong>Save draft</strong> to add it to <strong>Your invoices</strong>. This does not issue a payment request.</div>}
              <form onSubmit={e => { e.preventDefault(); action(async () => {
                const result = selected ? await api(`invoices/${selected.id}`, "PATCH", { version: selected.version, draft }) : await api("invoices", "POST", draft);
                choose(result.invoice);
                setFilter("all");
                await refresh();
                setSuccess(`${result.invoice.number} saved as a draft. It is now in Your invoices below. Review and approve it separately when you are ready to issue a payment request.`);
              }); }}>
                <fieldset disabled={readOnly || busy}>
                  <div className="form-row"><label>Bill to<input placeholder="Customer or company name" value={draft.customer} required maxLength={120} onChange={e => { setDraft({ ...draft, customer: e.target.value }); setReviewed(false); }} /></label><label>Due date <span className="muted">(optional)</span><input type="date" value={draft.dueDate} onChange={e => { setDraft({ ...draft, dueDate: e.target.value }); setReviewed(false); }} /></label></div>
                  <div className="line-labels"><span>Description</span><span>Qty</span><span>Unit price · USD</span><span /></div>
                  {draft.lines.map((line, index) => <div className="line-row" key={index}>
                    <input aria-label={`Item ${index + 1} description`} placeholder="What are you billing for?" value={line.description} required maxLength={160} onChange={e => { setDraft({ ...draft, lines: draft.lines.map((l, i) => i === index ? { ...l, description: e.target.value } : l) }); setReviewed(false); }} />
                    <input aria-label={`Item ${index + 1} quantity`} type="number" min="1" max="10000" step="1" value={line.quantity} required onChange={e => { setDraft({ ...draft, lines: draft.lines.map((l, i) => i === index ? { ...l, quantity: Number(e.target.value) } : l) }); setReviewed(false); }} />
                    <input aria-label={`Item ${index + 1} unit price`} type="number" min="0.01" max="1000000" step="0.01" value={line.unitCents / 100 || ""} required onChange={e => { setDraft({ ...draft, lines: draft.lines.map((l, i) => i === index ? { ...l, unitCents: Math.round(Number(e.target.value) * 100) } : l) }); setReviewed(false); }} />
                    <button aria-label={`Remove item ${index + 1}`} type="button" className="remove-button" disabled={draft.lines.length === 1} onClick={() => { setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) }); setReviewed(false); }}>×</button>
                  </div>)}
                  {!readOnly && <button className="text-button add-line" type="button" disabled={draft.lines.length >= 30} onClick={() => { setDraft({ ...draft, lines: [...draft.lines, { description: "", quantity: 1, unitCents: 100 }] }); setReviewed(false); }}>＋ Add line item</button>}
                </fieldset>
                <div className="invoice-total"><span>Total <small>Payable in devnet USDC · no taxes added</small></span><strong>{money(total)} <small>USD</small></strong></div>
                {!readOnly && <button className="button dark" disabled={busy}>{busy ? "Saving…" : "Save draft →"}</button>}
              </form>
              {selected?.status === "draft" && <div className="issue-section"><label className="checkbox"><input type="checkbox" checked={reviewed} disabled={!!edited} onChange={e => setReviewed(e.target.checked)} /> I reviewed this saved invoice and approve its amount and customer.</label><button className="button green" disabled={busy || !reviewed || !!edited} onClick={() => action(async () => { const result = await api(`invoices/${selected.id}`, "PATCH", { action: "issue", version: selected.version }); choose(result.invoice); await refresh(); })}>Issue payment request ↗</button>{edited && <small>Save your changes before issuing.</small>}</div>}
              {readOnly && selected && <div className="issued-details"><div><h3>{selected.status === "paid" ? "Payment finalized" : "Ready to share"}</h3><p>{selected.status === "paid" ? "The receipt is backed by a verified devnet transaction." : "The customer reviews and signs in their own wallet."}</p><Link className="button dark" href={`/pay/${selected.id}`}>Open checkout ↗</Link> <Link className="button secondary" href={`/document/${selected.id}`}>Invoice / receipt</Link><p><button className="text-button" onClick={() => action(async () => { await navigator.clipboard.writeText(`${window.location.origin}/pay/${selected.id}`); })}>Copy payment link</button></p></div>{qr && <img src={qr} width={120} height={120} alt="QR code linking to customer checkout" />}</div>}
            </section>
            <div><Assistant endpoint="assistant" current={draft.customer && draft.lines.every(l => l.description) ? draft : undefined} onResult={result => {
              if (!result.draft) return;
              if (readOnly) {
                setError("This invoice has already been issued and cannot be edited. Click New invoice to prepare another draft.");
                return;
              }
              setDraft(result.draft);
              setReviewed(false);
              setSuccess("");
              editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }} /><div className="trust-card"><span>◇</span><div><h3>You stay in control.</h3><p>Gemini fills the draft preview. Save it to add it to your invoice list, then approve it to issue a payment request. The customer signs every payment.</p></div></div>{!config.geminiConfigured && <p className="muted small">Gemini needs a server-side API key. The invoice form is fully usable without one.</p>}</div>
          </div>
          <section className="card table-card"><div className="section-heading"><h2>Your invoices <span className="count">{invoices.length}</span></h2><select aria-label="Filter invoices" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="draft">Drafts</option><option value="issued">Awaiting payment</option><option value="paid">Paid</option></select></div>
          {invoices.length === 0 ? <div className="empty-state"><h3>A clean slate.</h3><p>Create your first invoice above, or let Gemini help draft it.</p></div> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{invoices.filter(i => filter === "all" || i.status === filter).map(invoice => <tr key={invoice.id}><td><button className="table-link" onClick={() => choose(invoice)}>{invoice.number}</button></td><td>{invoice.customer}</td><td className="amount-cell">{money(invoice.totalCents)} <small>USDC test</small></td><td><Badge status={invoice.status} /></td><td>{new Date(invoice.createdAt).toLocaleDateString()}</td><td><button aria-label={`Open ${invoice.number}`} className="text-button" onClick={() => choose(invoice)}>↗</button></td></tr>)}</tbody></table></div>}
          </section></>}
        </>}
        <footer className="page-footer"><span>voicepay · a more natural way to get paid</span><span>Non-custodial by design · Devnet only</span></footer>
      </div>
    </main>
  </div>;
}
