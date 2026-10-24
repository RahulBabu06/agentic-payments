import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { createCustomerOrder, confirmCustomerOrder, businessOrders, businessOrderAction, customerOrders } from "../src/lib/customer-orders";
import { db, getInvoice, saveInvoice } from "../src/lib/db";

process.env.DATABASE_PATH = ":memory:";
process.env.MERCHANT_WALLET = Keypair.generate().publicKey.toBase58();
const cart = { merchantId: "maple-coffee", items: [{ id: "black-coffee" as const, quantity: 2 }] };

test("internal order, confirmation, finalized settlement, receipt and preparation are distinct states", () => {
  const key = randomUUID();
  const order = createCustomerOrder(cart, key);
  assert.equal(order.totalCents, 600);
  assert.equal(order.invoiceId, null);
  assert.equal(createCustomerOrder(cart, key).id, order.id);
  assert.throws(() => createCustomerOrder({ ...cart, items: [{ id: "black-coffee", quantity: 3 }] }, key), /changed/);
  assert.deepEqual(businessOrders("maple-coffee"), []);
  assert.throws(() => businessOrderAction("maple-coffee", order.id, "send_receipt"), /Finalized/);
  const confirmed = confirmCustomerOrder(order.id);
  assert.equal(confirmCustomerOrder(order.id).invoiceId, confirmed.invoiceId);
  const invoice = getInvoice(confirmed.invoiceId!)!;
  assert.equal(invoice.status, "issued");
  assert.equal(invoice.merchant, order.recipient);
  assert.throws(() => businessOrderAction("maple-coffee", order.id, "send_receipt"), /Finalized/);
  // Settlement itself is covered by Solana verifier tests; simulate its persisted result here.
  saveInvoice({ ...invoice, status: "paid", settlement: "finalized", signature: "test-signature" });
  assert.equal(businessOrders("maple-coffee").length, 1);
  assert.equal(businessOrders("bean-and-brew").length, 0);
  assert.throws(() => businessOrderAction("bean-and-brew", order.id, "send_receipt"), /not found/);
  assert.throws(() => businessOrderAction("maple-coffee", order.id, "preparing"), /receipt/);
  const sent = businessOrderAction("maple-coffee", order.id, "send_receipt");
  assert.equal(businessOrderAction("maple-coffee", order.id, "send_receipt").receiptSentAt, sent.receiptSentAt);
  assert.ok(customerOrders().find(o => o.id === order.id)?.receiptSentAt);
  assert.throws(() => businessOrderAction("maple-coffee", order.id, "ready"), /transition/);
  assert.equal(businessOrderAction("maple-coffee", order.id, "preparing").fulfilment, "preparing");
  assert.equal(businessOrderAction("maple-coffee", order.id, "ready").fulfilment, "ready");
  assert.equal(businessOrderAction("maple-coffee", order.id, "collected").fulfilment, "collected");
  assert.throws(() => businessOrderAction("maple-coffee", order.id, "preparing"), /transition/);
});

test("expired quotes and changed receiving wallets cannot be confirmed", () => {
  const expired = createCustomerOrder(cart, randomUUID());
  db().prepare("UPDATE customer_orders SET body=? WHERE id=?").run(JSON.stringify({ ...expired, expiresAt: 1 }), expired.id);
  assert.throws(() => confirmCustomerOrder(expired.id), /expired/);
  const changed = createCustomerOrder(cart, randomUUID());
  process.env.MERCHANT_WALLET = Keypair.generate().publicKey.toBase58();
  assert.throws(() => confirmCustomerOrder(changed.id), /wallet changed/);
  assert.equal(getInvoice(changed.invoiceId || ""), null);
});
