import { cookies } from "next/headers";
import { Keypair, PublicKey, SendTransactionError, Transaction } from "@solana/web3.js";
import { randomBytes, createHash } from "node:crypto";
import bs58 from "bs58";
import { z } from "zod";
import { authenticated, body, equalSecret, failure, requireAuth, sameOrigin } from "@/lib/http";
import { createInvoice, db, getInvoice, listInvoices, paymentRecords, rateLimit, saveInvoice } from "@/lib/db";
import { atomicAmount, DEVNET_USDC, draftSchema, totalCents } from "@/lib/domain";
import { draftWithGemini, invoiceHelp, orderSchema, orderWithGemini } from "@/lib/gemini";
import { catalog } from "@/lib/catalog";
import { voiceConfigured, voiceSession } from "@/lib/elevenlabs";
import { orderVoiceReply, voiceContext, voiceTurn } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const textSchema = z.string().trim().min(1).max(2000);
const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
const publicInvoice = (id: string) => {
  const invoice = getInvoice(id);
  if (!invoice || invoice.status === "draft") throw new Error("Invoice not found");
  return invoice;
};
async function merchantAddress() {
  const { devnetConnection } = await import("@/lib/solana");
  if (!process.env.MERCHANT_WALLET) throw new Error("Set MERCHANT_WALLET to a devnet receiving wallet public address first.");
  const address = new PublicKey(process.env.MERCHANT_WALLET);
  if (!PublicKey.isOnCurve(address.toBytes())) throw new Error("Merchant must be a regular wallet address.");
  await devnetConnection();
  return address.toBase58();
}
function issue(invoice: NonNullable<ReturnType<typeof getInvoice>>, merchant: string) {
  invoice.merchant = merchant;
  invoice.reference = Keypair.generate().publicKey.toBase58();
  invoice.status = "issued";
  invoice.version++;
  saveInvoice(invoice);
  return invoice;
}
export async function GET(req: Request, ctx: Context) {
  try {
    const path = (await ctx.params).path;
    if (path[0] === "config") return Response.json({
      authenticated: await authenticated(),
      authConfigured: !!process.env.BUSINESS_PASSWORD,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      voiceConfigured: voiceConfigured(),
      merchantConfigured: !!process.env.MERCHANT_WALLET,
      network: "devnet", catalog,
    });
    if (path[0] === "invoices") {
      await requireAuth();
      return Response.json({ invoices: listInvoices(), payments: paymentRecords() });
    }
    if (path[0] === "checkout" && path[1]) return Response.json({
      invoice: publicInvoice(path[1]),
      pending: db().prepare("SELECT signature FROM submissions WHERE invoice_id=? AND status='pending'").all(path[1]),
    });
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, ctx: Context) {
  try {
    sameOrigin(req);
    const path = (await ctx.params).path;
    const input = await body(req);
    if (path.join("/") === "voice/session") {
      rateLimit("voice-sessions", 5, 60000);
      const context = voiceContext.parse(input);
      if (context.scope === "checkout") publicInvoice(context.invoiceId);
      return Response.json(await voiceSession(), { headers: { "Cache-Control": "no-store" } });
    }
    if (path.join("/") === "voice/turn") {
      rateLimit("public-ai", 15, 60000);
      const turn = voiceTurn.parse(input);
      if (turn.context.scope === "order") {
        const result = await orderWithGemini(turn.message, turn.current);
        return Response.json({ ...result, say: result.order ? orderVoiceReply(result.order) : result.reply });
      }
      const invoice = publicInvoice(turn.context.invoiceId);
      const result = await invoiceHelp(turn.message, invoice);
      // Always include authoritative payment state, not the agent's memory.
      const state = invoice.status === "paid" ? "Payment is finalized and matched." : "This invoice is awaiting verified payment.";
      return Response.json({ say: `${state} ${result.reply}`, status: invoice.status });
    }
    if (path[0] === "session") {
      rateLimit("login", 20, 60000);
      if (!process.env.BUSINESS_PASSWORD) throw new Error("Set BUSINESS_PASSWORD in .env.local and restart the server.");
      const password = z.string().min(1).max(1000).parse(input.password);
      if (!equalSecret(password, process.env.BUSINESS_PASSWORD)) throw new Error("Incorrect password");
      const token = randomBytes(32).toString("hex");
      db().prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db().prepare("INSERT INTO sessions VALUES (?,?)").run(token, Date.now() + 86400000);
      (await cookies()).set("voicepay_session", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 86400, path: "/" });
      return Response.json({ ok: true });
    }
    if (path[0] === "logout") {
      const jar = await cookies();
      db().prepare("DELETE FROM sessions WHERE token=?").run(jar.get("voicepay_session")?.value || "");
      jar.delete("voicepay_session");
      return Response.json({ ok: true });
    }
    if (path[0] === "invoices") {
      await requireAuth();
      return Response.json({ invoice: createInvoice(draftSchema.parse(input)) });
    }
    if (path[0] === "assistant") {
      await requireAuth();
      rateLimit("business-ai", 20, 60000);
      return Response.json(await draftWithGemini(textSchema.parse(input.message), input.current ? draftSchema.parse(input.current) : undefined));
    }
    if (path[0] === "order-assistant") {
      rateLimit("public-ai", 15, 60000);
      return Response.json(await orderWithGemini(textSchema.parse(input.message), input.current ? orderSchema.parse(input.current) : undefined));
    }
    if (path[0] === "orders") {
      rateLimit("orders", 30, 60000);
      const order = orderSchema.parse(input);
      const customer = z.string().trim().min(1).max(120).parse(input.customer);
      const merchant = await merchantAddress();
      const lines = order.items.map(item => {
        const product = catalog.find(p => p.id === item.id)!;
        return { description: product.description, quantity: item.quantity, unitCents: product.unitCents };
      });
      return Response.json({ invoice: issue(createInvoice({ customer, dueDate: "", lines }), merchant) });
    }
    if (path[0] === "checkout" && path[1] && path[2] === "assistant") {
      rateLimit("public-ai", 15, 60000);
      const invoice = publicInvoice(path[1]);
      return Response.json(await invoiceHelp(textSchema.parse(input.message), invoice));
    }
    if (path[0] === "checkout" && path[1] && path[2] === "prepare") {
      const { devnetConnection } = await import("@/lib/solana");
      const { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
      rateLimit(`prepare:${path[1]}`, 15, 60000);
      const invoice = publicInvoice(path[1]);
      if (invoice.status === "paid") throw new Error("This invoice is already paid.");
      if (db().prepare("SELECT signature FROM submissions WHERE invoice_id=? AND status='pending'").get(invoice.id)) {
        throw new Error("A payment is awaiting verification. Do not pay again.");
      }
      const payer = new PublicKey(z.string().parse(input.payer));
      if (!PublicKey.isOnCurve(payer.toBytes()) || payer.toBase58() === invoice.merchant) throw new Error("Use a separate customer wallet.");
      const connection = await devnetConnection();
      const mint = new PublicKey(DEVNET_USDC);
      const destination = getAssociatedTokenAddressSync(mint, new PublicKey(invoice.merchant!));
      const source = getAssociatedTokenAddressSync(mint, payer);
      const transfer = createTransferCheckedInstruction(source, mint, destination, payer, atomicAmount(invoice.totalCents), 6);
      transfer.keys.push({ pubkey: new PublicKey(invoice.reference!), isSigner: false, isWritable: false });
      const latest = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: payer, ...latest }).add(
        createAssociatedTokenAccountIdempotentInstruction(payer, destination, new PublicKey(invoice.merchant!), mint),
        transfer,
      );
      const hash = createHash("sha256").update(tx.serializeMessage()).digest("hex");
      db().prepare("DELETE FROM prepared WHERE expires<?").run(Date.now());
      db().prepare("INSERT OR REPLACE INTO prepared VALUES (?,?,?)").run(hash, invoice.id, Date.now() + 120000);
      return Response.json({ transaction: tx.serialize({ requireAllSignatures: false }).toString("base64") });
    }
    if (path[0] === "checkout" && path[1] && path[2] === "submit") {
      const { devnetConnection } = await import("@/lib/solana");
      rateLimit(`submit:${path[1]}`, 15, 60000);
      const invoice = publicInvoice(path[1]);
      const tx = Transaction.from(Buffer.from(z.string().max(4000).parse(input.transaction), "base64"));
      const hash = createHash("sha256").update(tx.serializeMessage()).digest("hex");
      const prepared = db().prepare("SELECT hash FROM prepared WHERE hash=? AND invoice_id=? AND expires>?").get(hash, invoice.id, Date.now());
      if (!prepared || !tx.signature || !tx.verifySignatures()) throw new Error("Payment differs from the prepared request or has expired.");
      const signature = bs58.encode(tx.signature);
      const existing = db().prepare("SELECT signature FROM submissions WHERE invoice_id=? AND status='pending'").get(invoice.id) as { signature: string } | undefined;
      if (invoice.status === "paid" || (existing && existing.signature !== signature)) throw new Error("A payment already exists. Check its status before paying again.");
      const connection = await devnetConnection();
      // Store the signature before broadcasting, so a dropped HTTP response cannot lose the payment.
      db().prepare("INSERT INTO submissions VALUES (?,?,'pending') ON CONFLICT(signature) DO NOTHING").run(signature, invoice.id);
      try {
        await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      } catch (error) {
        if (error instanceof SendTransactionError) {
          db().prepare("UPDATE submissions SET status='failed' WHERE signature=?").run(signature);
          return Response.json({ signature, rejected: true, message: "Transaction simulation failed. Check devnet USDC and SOL balances. Nothing was broadcast." });
        }
        // A transport error may follow a successful broadcast. Retain the signature and reconcile, never invite a second payment.
      }
      return Response.json({ signature, pending: true });
    }
    if (path[0] === "checkout" && path[1] && path[2] === "verify") {
      const { devnetConnection, inspectTransfer } = await import("@/lib/solana");
      rateLimit(`verify:${path[1]}`, 60, 60000);
      const invoice = publicInvoice(path[1]);
      const signature = signatureSchema.parse(input.signature);
      const previous = db().prepare("SELECT invoice_id, outcome FROM payments WHERE signature=?").get(signature) as { invoice_id: string; outcome: string } | undefined;
      if (previous && previous.invoice_id !== invoice.id) throw new Error("This transaction is already associated with another invoice.");
      if (invoice.status === "paid" && invoice.signature === signature) return Response.json({ invoice, paid: true });
      const connection = await devnetConnection();
      const tx = await connection.getTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
      if (!tx) return Response.json({ pending: true, message: "Waiting for finalized settlement. Do not pay again." });
      // Require this reference to be present before recording anything against this invoice.
      const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
      if (!Array.from({ length: keys.length }, (_, i) => keys.get(i)?.toBase58()).includes(invoice.reference!)) {
        throw new Error("Transaction does not belong to this invoice.");
      }
      const mismatch = inspectTransfer(tx, invoice);
      // No awaits inside this transaction: serialize competing verification requests.
      db().exec("BEGIN IMMEDIATE");
      try {
        const latest = publicInvoice(invoice.id);
        const outcome = mismatch || (latest.status === "paid" && latest.signature !== signature ? "Additional payment: manual review required." : "Matched");
        db().prepare("INSERT INTO payments VALUES (?,?,?,?) ON CONFLICT(signature) DO NOTHING").run(signature, invoice.id, outcome, new Date().toISOString());
        db().prepare("UPDATE submissions SET status='resolved' WHERE signature=?").run(signature);
        if (outcome === "Matched" && latest.status !== "paid") {
          latest.status = "paid";
          latest.signature = signature;
          latest.settlement = "finalized";
          latest.paidAt = new Date().toISOString();
          latest.version++;
          saveInvoice(latest);
        }
        db().exec("COMMIT");
        return Response.json({ invoice: latest, paid: outcome === "Matched", exception: outcome === "Matched" ? undefined : outcome });
      } catch (error) {
        db().exec("ROLLBACK");
        throw error;
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return failure(error); }
}

export async function PATCH(req: Request, ctx: Context) {
  try {
    sameOrigin(req);
    await requireAuth();
    const path = (await ctx.params).path;
    if (path[0] !== "invoices" || !path[1]) throw new Error("Not found");
    const input = await body(req);
    const expectedVersion = z.number().int().parse(input.version);
    // Perform network validation before entering the synchronous state transition.
    const merchant = input.action === "issue" ? await merchantAddress() : null;
    const invoice = getInvoice(path[1]);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.version !== expectedVersion) throw new Error("Invoice changed. Refresh and review it again.");
    if (invoice.status !== "draft") throw new Error("Issued invoices are immutable. Create a new draft.");
    if (input.action === "issue" && merchant) return Response.json({ invoice: issue(invoice, merchant) });
    const draft = draftSchema.parse(input.draft);
    Object.assign(invoice, draft, { totalCents: totalCents(draft.lines), version: invoice.version + 1 });
    saveInvoice(invoice);
    return Response.json({ invoice });
  } catch (error) { return failure(error); }
}
