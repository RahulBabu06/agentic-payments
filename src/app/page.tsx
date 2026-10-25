import Link from "next/link";
import { Brand, TestBanner } from "@/components/shared";

export default function Home() {
  return <div className="customer-shell"><header className="customer-header"><Brand /></header><TestBanner />
    <main className="customer-main voice-welcome"><p className="eyebrow">VOICEPAY</p><h1>Order by voice.<br />Pay with your wallet.</h1>
      <p className="subtitle">Five fictional local businesses. One demo customer. Solana devnet USDC.</p>
      <p>Speak your order. Review one confirmation. Pay in Phantom.</p>
      <Link className="button dark" href="/customer">Enter customer demo →</Link>
      <p><Link className="inline-link" href="/business">Business dashboard →</Link></p>
      <p className="notice">Demo only: merchant verification is simulated. Customer access is a shared demonstration account, not production authentication. No real orders or fulfilment.</p>
    </main></div>;
}
