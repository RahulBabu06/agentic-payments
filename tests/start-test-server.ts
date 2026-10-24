// Isolated browser harness. This RPC is a deterministic fixture, NOT a live devnet test.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { DEVNET_GENESIS, DEVNET_USDC } from "../src/lib/domain";

const directory = mkdtempSync(join(tmpdir(), "voicepay-browser-"));
const transactions = new Map<string, unknown>();
const rpc = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const request = JSON.parse(Buffer.concat(chunks).toString());
  let result: unknown;
  if (request.method === "getGenesisHash") result = DEVNET_GENESIS;
  else if (request.method === "getLatestBlockhash") result = { context: { slot: 1 }, value: { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 } };
  else if (request.method === "sendTransaction") {
    const tx = Transaction.from(Buffer.from(request.params[0], "base64"));
    const signature = bs58.encode(tx.signature!);
    const message = tx.compileMessage();
    const transfer = tx.instructions[tx.instructions.length - 1];
    const recipient = transfer.keys[2].pubkey;
    const accountIndex = message.accountKeys.findIndex(k => k.equals(recipient));
    const amount = transfer.data.readBigUInt64LE(1).toString();
    transactions.set(signature, {
      slot: 1, blockTime: Math.floor(Date.now() / 1000), version: "legacy",
      transaction: {
        signatures: [signature],
        message: {
          accountKeys: message.accountKeys.map(k => k.toBase58()),
          header: message.header, instructions: message.instructions, recentBlockhash: message.recentBlockhash,
        },
      },
      meta: {
        err: null, fee: 5000, preBalances: message.accountKeys.map(() => 0), postBalances: message.accountKeys.map(() => 0),
        preTokenBalances: [{ accountIndex, mint: DEVNET_USDC, uiTokenAmount: { amount: "0", decimals: 6, uiAmount: 0 } }],
        postTokenBalances: [{ accountIndex, mint: DEVNET_USDC, uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6 } }],
      },
    });
    result = signature;
  } else if (request.method === "getTransaction") result = transactions.get(request.params[0]) || null;
  else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Not implemented in test fixture" } }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
});
rpc.listen(0, "127.0.0.1", () => {
  const address = rpc.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  const production = process.env.VOICEPAY_TEST_PRODUCTION === "1";
  const command = production ? ["start", "--port", "3100"] : ["dev", "--webpack", "--port", "3100"];
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...command], {
    stdio: "inherit",
    env: {
      ...process.env,
      BUSINESS_PASSWORD: "browser-test-only-not-a-real-credential",
      GEMINI_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      ELEVENLABS_AGENT_ID: "",
      MERCHANT_WALLET: Keypair.generate().publicKey.toBase58(),
      MERCHANT_WALLET_BEAN_AND_BREW: Keypair.generate().publicKey.toBase58(),
      MERCHANT_WALLET_LITTLE_OLIVE: Keypair.generate().publicKey.toBase58(),
      MERCHANT_WALLET_CORNER_PIZZA: Keypair.generate().publicKey.toBase58(),
      // Deliberately unset to exercise pending-wallet storefronts.
      MERCHANT_WALLET_COPPER_TAP: "",
      SOLANA_RPC_URL: `http://127.0.0.1:${address.port}`,
      DATABASE_PATH: join(directory, "test.sqlite"),
      NEXT_BUILD_DIR: production ? ".next" : ".next-test",
    },
  });
  const cleanup = () => { child.kill("SIGTERM"); rpc.close(); rmSync(directory, { recursive: true, force: true }); };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  child.on("exit", code => { rpc.close(); rmSync(directory, { recursive: true, force: true }); process.exit(code || 0); });
});
