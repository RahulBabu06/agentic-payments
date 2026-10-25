import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { cartLines, orderSchema, sameCart, type Cart } from "./catalog";
import { createInvoice, db, getInvoice, saveInvoice } from "./db";
import { totalCents, type Draft } from "./domain";
import { getMerchant } from "./merchants";
import { merchantWallet } from "./merchant-wallets";

export const DEMO_CUSTOMER = { id: "demo-customer", name: "Alex Demo" };
export type CustomerOrder = {
  id: string;
  customerId: string;
  merchantId: string;
  merchantName: string;
  merchantArea: string;
  cart: Cart;
  lines: Draft["lines"];
  totalCents: number;
  recipient: string;
  createdAt: string;
  expiresAt: number;
  confirmedAt: string | null;
  invoiceId: string | null;
  receiptSentAt: string | null;
  fulfilment: "not_started" | "preparing" | "ready" | "collected";
};
export type BusinessAction = "send_receipt" | "preparing" | "ready" | "collected";

export function getCustomerOrder(id: string): CustomerOrder {
  const row = db().prepare("SELECT body FROM customer_orders WHERE id=? AND customer_id=?").get(id, DEMO_CUSTOMER.id) as { body: string } | undefined;
  if (!row) throw new Error("Order not found.");
  return JSON.parse(row.body);
}
export function orderForInvoice(invoiceId: string): CustomerOrder | null {
  const row = db().prepare("SELECT body FROM customer_orders WHERE invoice_id=?").get(invoiceId) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : null;
}
function saveOrder(order: CustomerOrder) {
  db().prepare("UPDATE customer_orders SET invoice_id=?, body=? WHERE id=?").run(order.invoiceId, JSON.stringify(order), order.id);
}
export function orderView(order: CustomerOrder) {
  const invoice = order.invoiceId ? getInvoice(order.invoiceId) : null;
  return {
    ...order,
    paymentStatus: invoice?.status === "paid" ? "paid" : order.invoiceId ? "awaiting_payment" : "awaiting_confirmation",
    signature: invoice?.signature || null,
  };
}
export function customerOrders() {
  const rows = db().prepare("SELECT body FROM customer_orders WHERE customer_id=? ORDER BY rowid DESC").all(DEMO_CUSTOMER.id) as { body: string }[];
  return rows.map(row => orderView(JSON.parse(row.body)));
}
export function businessOrders(merchantId: string) {
  getMerchant(merchantId);
  const rows = db().prepare("SELECT body FROM customer_orders WHERE merchant_id=? ORDER BY rowid DESC").all(merchantId) as { body: string }[];
  return rows.map(row => orderView(JSON.parse(row.body))).filter(order => order.paymentStatus === "paid");
}
export function createCustomerOrder(input: Cart, requestId: string) {
  const cart = orderSchema.parse(input);
  const previous = db().prepare("SELECT body FROM customer_orders WHERE customer_id=? AND request_id=?").get(DEMO_CUSTOMER.id, requestId) as { body: string } | undefined;
  if (previous) {
    const order: CustomerOrder = JSON.parse(previous.body);
    if (!sameCart(order.cart, cart)) throw new Error("Order request changed. Review a new order.");
    return order;
  }
  const store = getMerchant(cart.merchantId);
  const lines = cartLines(cart);
  const order: CustomerOrder = {
    id: randomUUID(), customerId: DEMO_CUSTOMER.id, merchantId: store.id,
    merchantName: store.name, merchantArea: store.area, cart, lines,
    totalCents: totalCents(lines), recipient: merchantWallet(store.id),
    createdAt: new Date().toISOString(), expiresAt: Date.now() + 600000,
    confirmedAt: null, invoiceId: null, receiptSentAt: null, fulfilment: "not_started",
  };
  db().prepare("INSERT INTO customer_orders VALUES (?,?,?,?,?,?)").run(order.id, order.customerId, order.merchantId, requestId, null, JSON.stringify(order));
  return order;
}
export function confirmCustomerOrder(id: string) {
  // Synchronous transaction makes confirmation retries create at most one invoice.
  db().exec("BEGIN IMMEDIATE");
  try {
    const order = getCustomerOrder(id);
    if (!order.invoiceId) {
      if (Date.now() > order.expiresAt) throw new Error("This order quote expired. Review a new order.");
      if (merchantWallet(order.merchantId) !== order.recipient) throw new Error("The store's wallet changed. Review a new order before confirming.");
      const invoice = createInvoice({ customer: DEMO_CUSTOMER.name, dueDate: "", lines: order.lines }, order.merchantId);
      Object.assign(invoice, { merchant: order.recipient, reference: Keypair.generate().publicKey.toBase58(), status: "issued", version: invoice.version + 1 });
      saveInvoice(invoice);
      order.invoiceId = invoice.id;
      order.confirmedAt = new Date().toISOString();
      saveOrder(order);
    }
    db().exec("COMMIT");
    return order;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}
export function businessOrderAction(merchantId: string, id: string, action: BusinessAction) {
  const order = getCustomerOrder(id);
  if (order.merchantId !== merchantId) throw new Error("Order not found for this business.");
  if (orderView(order).paymentStatus !== "paid") throw new Error("Finalized payment is required before sending a receipt or processing.");
  if (action === "send_receipt") {
    order.receiptSentAt ||= new Date().toISOString();
  } else {
    if (!order.receiptSentAt) throw new Error("Send the receipt to the customer's account before processing.");
    const stages = ["not_started", "preparing", "ready", "collected"];
    const before = stages.indexOf(order.fulfilment);
    const after = stages.indexOf(action);
    if (after !== before && after !== before + 1) throw new Error("Invalid order processing transition.");
    order.fulfilment = action;
  }
  saveOrder(order);
  return orderView(order);
}
