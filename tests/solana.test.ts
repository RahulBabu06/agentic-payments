import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, Transaction, VersionedTransactionResponse } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DEVNET_USDC, Invoice } from "../src/lib/domain";
import { inspectTransfer } from "../src/lib/solana";

function fixture(options: {
  amount?: bigint; mint?: PublicKey; recipient?: PublicKey; reference?: PublicKey;
  failed?: boolean; delta?: bigint; self?: boolean;
} = {}) {
  const payer = Keypair.generate();
  const merchant = Keypair.generate().publicKey;
  const reference = Keypair.generate().publicKey;
  const invoice: Invoice = {
    id: "invoice-1", number: "VP-1", customer: "Acme", dueDate: "", lines: [{ description: "Demo", quantity: 1, unitCents: 100 }],
    totalCents: 100, version: 1, status: "issued", merchant: merchant.toBase58(), reference: reference.toBase58(),
    signature: null, settlement: null, createdAt: new Date().toISOString(), paidAt: null,
  };
  const mint = options.mint || new PublicKey(DEVNET_USDC);
  const dest = getAssociatedTokenAddressSync(mint, options.recipient || merchant);
  const source = options.self ? dest : getAssociatedTokenAddressSync(mint, payer.publicKey);
  const transfer = createTransferCheckedInstruction(source, mint, dest, payer.publicKey, options.amount ?? 1000000n, 6);
  transfer.keys.push({ pubkey: options.reference || reference, isSigner: false, isWritable: false });
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(transfer);
  const message = tx.compileMessage();
  const destIndex = message.accountKeys.findIndex(k => k.equals(dest));
  const response = {
    blockTime: 1, slot: 1, version: "legacy",
    transaction: { message, signatures: ["test-signature"] },
    meta: {
      err: options.failed ? { InstructionError: [0, "Custom"] } : null,
      fee: 5000, preBalances: [], postBalances: [],
      preTokenBalances: [{ accountIndex: destIndex, mint: mint.toBase58(), uiTokenAmount: { amount: "0", decimals: 6, uiAmount: 0 } }],
      postTokenBalances: [{ accountIndex: destIndex, mint: mint.toBase58(), uiTokenAmount: { amount: (options.delta ?? options.amount ?? 1000000n).toString(), decimals: 6, uiAmount: 1 } }],
    },
  } as unknown as VersionedTransactionResponse;
  return { response, invoice };
}
test("matches a successful transfer to the exact invoice", () => {
  const { response, invoice } = fixture();
  assert.equal(inspectTransfer(response, invoice), null);
});
test("does not match another invoice with the same amount", () => {
  const { response, invoice } = fixture({ reference: Keypair.generate().publicKey });
  assert.match(inspectTransfer(response, invoice)!, /No matching/);
});
test("rejects wrong mint, wrong recipient and failed execution", () => {
  for (const options of [
    { mint: Keypair.generate().publicKey }, { recipient: Keypair.generate().publicKey }, { failed: true },
  ]) {
    const { response, invoice } = fixture(options);
    assert.notEqual(inspectTransfer(response, invoice), null);
  }
});
test("flags underpayment and overpayment", () => {
  for (const [amount, expected] of [[999999n, /Underpayment/], [1000001n, /Overpayment/]] as const) {
    const { response, invoice } = fixture({ amount });
    assert.match(inspectTransfer(response, invoice)!, expected);
  }
});
test("rejects self-transfer and a transaction that moves the funds back out", () => {
  for (const options of [{ self: true }, { delta: 0n }]) {
    const { response, invoice } = fixture(options);
    assert.notEqual(inspectTransfer(response, invoice), null);
  }
});
