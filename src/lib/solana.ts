import {
  Connection, PublicKey, TransactionInstruction, VersionedTransactionResponse,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, decodeTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { atomicAmount, DEVNET_GENESIS, DEVNET_USDC, Invoice } from "./domain";

export async function devnetConnection() {
  const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) {
    throw new Error("RPC must connect to Solana devnet. Mainnet is not supported.");
  }
  return connection;
}

export function inspectTransfer(tx: VersionedTransactionResponse, invoice: Invoice): string | null {
  if (!tx.meta || tx.meta.err) return "Transaction failed.";
  if (!invoice.merchant || !invoice.reference) return "Invoice is not issued.";
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
  const mint = new PublicKey(DEVNET_USDC);
  const recipient = getAssociatedTokenAddressSync(mint, new PublicKey(invoice.merchant));
  let mismatch = "No matching USDC transfer with this invoice reference.";
  for (const compiled of tx.transaction.message.compiledInstructions) {
    const programId = keys.get(compiled.programIdIndex);
    if (!programId?.equals(TOKEN_PROGRAM_ID)) continue;
    const accounts = Array.from(compiled.accountKeyIndexes).map(index => {
      const pubkey = keys.get(index);
      if (!pubkey) throw new Error("Invalid transaction accounts");
      return { pubkey, isSigner: tx.transaction.message.isAccountSigner(index), isWritable: tx.transaction.message.isAccountWritable(index) };
    });
    if (!accounts.some(a => a.pubkey.toBase58() === invoice.reference && !a.isSigner && !a.isWritable)) continue;
    try {
      const decoded = decodeTransferCheckedInstruction(new TransactionInstruction({ programId, keys: accounts, data: Buffer.from(compiled.data) }));
      if (!decoded.keys.mint.pubkey.equals(mint) || decoded.data.decimals !== 6) continue;
      if (!decoded.keys.destination.pubkey.equals(recipient)) continue;
      if (decoded.keys.source.pubkey.equals(recipient)) return "Self-transfers do not satisfy an invoice.";
      if (decoded.data.amount !== atomicAmount(invoice.totalCents)) {
        mismatch = decoded.data.amount < atomicAmount(invoice.totalCents) ? "Underpayment: manual review required." : "Overpayment: manual review required.";
        continue;
      }
      // A successful transfer instruction alone is insufficient if other instructions move funds back out.
      const destinationIndex = Array.from({ length: keys.length }, (_, i) => i).find(i => keys.get(i)?.equals(recipient));
      const before = tx.meta.preTokenBalances?.find(b => b.accountIndex === destinationIndex && b.mint === DEVNET_USDC);
      const after = tx.meta.postTokenBalances?.find(b => b.accountIndex === destinationIndex && b.mint === DEVNET_USDC);
      const delta = BigInt(after?.uiTokenAmount.amount || "0") - BigInt(before?.uiTokenAmount.amount || "0");
      if (delta !== atomicAmount(invoice.totalCents)) return "Recipient balance change does not match the invoice.";
      return null;
    } catch {
      continue;
    }
  }
  return mismatch;
}
