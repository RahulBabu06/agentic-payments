"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { boundedTranscript } from "@/lib/assistant-transcript";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
export async function api(path: string, method = "GET", data?: unknown) {
  const response = await fetch(`/api/${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || "Request failed", response.status);
  return result;
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
export function Brand() {
  return <Link className="brand" href="/"><span className="brand-icon">v<span>p</span></span>voicepay<span className="brand-dot">.</span></Link>;
}
export function TestBanner() {
  return <div className="test-banner"><span className="live-dot" /> SOLANA DEVNET <span>Test payments only. Tokens have no monetary value.</span></div>;
}
export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status === "issued" ? "Awaiting payment" : status}</span>;
}
export function Assistant({ endpoint, current, requestId, pendingOrderId, onResult, disabled = false, title = "Your billing copilot", placeholder = "Invoice Acme for 2 sessions at $25 each…" }: {
  endpoint: string; current?: unknown; requestId?: string; pendingOrderId?: string; onResult?: (result: any) => void; disabled?: boolean; title?: string; placeholder?: string;
}) {
  const latest = useRef({ current, onResult, disabled });
  latest.current = { current, onResult, disabled };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [modelNotice, setModelNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || disabled) return;
    const before = JSON.stringify(current);
    setBusy(true);
    setModelNotice("");
    try {
      const result = await api(endpoint, "POST", { message: boundedTranscript(history, message), current, requestId, pendingOrderId });
      if (!mounted.current) return;
      if (latest.current.disabled || before !== JSON.stringify(latest.current.current)) {
        setReply("Your selection changed while I was thinking. Please repeat your request for the current order.");
        return;
      }
      setHistory(h => [...h, `Customer: ${message}`, `Assistant: ${result.reply}`].slice(-6));
      setReply(result.reply);
      setModelNotice(result.modelNotice || "");
      latest.current.onResult?.(result);
      setMessage("");
    } catch (error) { if (mounted.current) setReply(errorText(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className="assistant card">
    <div className="assistant-heading"><span className="sparkle">✦</span><div><h3>{title}</h3><p>Powered by Gemini · proposals, never autonomous spending</p></div></div>
    <p className="assistant-intro">Say it naturally. We’ll help with the details.</p>
    {reply && <div className="assistant-reply" role="status">{reply}</div>}
    {modelNotice && <p className="small muted">{modelNotice}</p>}
    <form onSubmit={send}>
      <label className="sr-only" htmlFor={`prompt-${endpoint}`}>Ask Gemini</label>
      <textarea id={`prompt-${endpoint}`} value={message} disabled={disabled} maxLength={1200} onChange={e => setMessage(e.target.value)} placeholder={placeholder} required rows={3} />
      <div className="assistant-footer"><span>Review all suggestions before proceeding.</span><button disabled={disabled || busy || !message.trim()} className="button dark">{busy ? "Thinking…" : "Ask Gemini ↗"}</button></div>
    </form>
  </section>;
}
