import Link from "next/link";
import { Brand, TestBanner } from "@/components/shared";

export default function Home() {
  return <div className="customer-shell"><header className="customer-header"><Brand /></header><TestBanner />
    <main className="customer-main"><p className="eyebrow">VOICEPAY / TWO SIDES, ONE ORDER</p><h1>Order by voice.<br />Pay with your wallet.</h1>
      <p className="subtitle">Five fictional local businesses. One demo customer. Solana devnet USDC.</p>
      <div className="store-grid"><section className="card"><h2>Customer account</h2><p>Ask for a menu, build your order, confirm it, and approve payment in Phantom. Receipts arrive in your account.</p><Link className="button dark" href="/customer">Enter customer demo →</Link></section>
        <section className="card"><h2>Business accounts</h2><p>Unlock all five demo business dashboards with the business password. Receive paid orders, send receipts, and manage preparation. No AI required.</p><Link className="button secondary" href="/business">Business sign in →</Link></section></div>
      <p className="notice">Demo only: merchant verification is simulated. Customer access is a shared demonstration account, not production authentication. No real orders or fulfilment.</p>
    </main></div>;
}
