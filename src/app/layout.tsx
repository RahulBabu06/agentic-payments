import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoicePay · payments, in conversation",
  description: "Gemini-assisted invoices and verified Solana devnet USDC payments.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
