import { PublicKey } from "@solana/web3.js";
import { getMerchant, merchants } from "./merchants";

type Environment = Record<string, string | undefined>;
function address(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const key = new PublicKey(value.trim());
    return PublicKey.isOnCurve(key.toBytes()) ? key.toBase58() : null;
  } catch { return null; }
}

export function merchantWalletStatus(id: string, env: Environment = process.env) {
  const merchant = getMerchant(id);
  const wallet = address(env[merchant.walletEnv]);
  if (!env[merchant.walletEnv]?.trim()) return { ready: false, reason: "Receiving wallet not configured." };
  if (!wallet) return { ready: false, reason: "Receiving wallet must be a valid Solana wallet public address." };
  if (merchants.some(other => other.id !== id && address(env[other.walletEnv]) === wallet)) {
    return { ready: false, reason: "Each demo store needs a different receiving wallet." };
  }
  return { ready: true, reason: "" };
}

export function merchantWallet(id: string, env: Environment = process.env) {
  const merchant = getMerchant(id);
  const status = merchantWalletStatus(id, env);
  if (!status.ready) throw new Error(`${merchant.name}: ${status.reason} Configure ${merchant.walletEnv} on the server.`);
  return address(env[merchant.walletEnv])!;
}

export function publicMerchants() {
  return merchants.map(({ walletEnv: _walletEnv, ...merchant }) => {
    const status = merchantWalletStatus(merchant.id);
    return {
      ...merchant, verification: "simulated" as const, network: "devnet" as const,
      paymentReady: status.ready, paymentSetup: status.reason,
    };
  });
}
