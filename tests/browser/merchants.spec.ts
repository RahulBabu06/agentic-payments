import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DEVNET_USDC } from "../../src/lib/domain";
import { merchants } from "../../src/lib/merchants";

const headers = { Origin: "http://localhost:3100" };
test.beforeEach(async ({ page, request }) => {
  await page.request.post("/api/customer/session", { headers, data: {} });
  await request.post("/api/customer/session", { headers, data: {} });
});

test("five stores are searchable, store changes clear the cart and missing wallets block orders", async ({ page }) => {
  await page.goto("/customer/shop");
  const directory = page.getByRole("region", { name: "Find a demo store" });
  await expect(directory.getByRole("button")).toHaveCount(5);
  await page.getByLabel("Black coffee quantity").fill("2");
  await page.getByLabel("Search stores").fill("Soho");
  await expect(directory.getByRole("button")).toHaveCount(2);
  await directory.getByRole("button", { name: /Little Olive/ }).click();
  await expect(page.getByLabel("Falafel wrap quantity")).toHaveValue("0");
  await page.getByLabel("Search stores").fill("bar");
  await directory.getByRole("button", { name: /Copper Tap/ }).click();
  await page.getByLabel("Citrus mocktail quantity").fill("1");
  await expect(page.getByRole("button", { name: "Place order for confirmation" })).toBeDisabled();
  await expect(page.getByText("Copper Tap: Receiving wallet not configured.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your order · Copper Tap" })).toBeVisible();
});

test("four receiving wallets stay distinct with trusted pricing, confirmation and signed settlement", async ({ request }) => {
  const directory = await (await request.get("/api/merchants")).json();
  expect(directory.merchants).toHaveLength(5);
  expect(directory.merchants.every((s: any) => s.verification === "simulated" && s.network === "devnet")).toBe(true);
  expect(JSON.stringify(directory)).not.toContain("walletEnv");
  const recipients = new Set<string>();
  let firstSignature = "";
  for (const store of merchants.slice(0, 4)) {
    const data = { merchantId: store.id, requestId: randomUUID(), items: [{ id: store.menu[0].id, quantity: 2, unitCents: 1 }], merchant: Keypair.generate().publicKey.toBase58() };
    const created = await request.post("/api/customer/orders", { headers, data });
    expect(created.status()).toBe(200);
    const { order } = await created.json();
    const retry = await request.post("/api/customer/orders", { headers, data });
    expect((await retry.json()).order.id).toBe(order.id);
    expect(order.invoiceId).toBeNull();
    expect(order.totalCents).toBe(store.menu[0].unitCents * 2);
    const confirmed = await request.post(`/api/customer/orders/${order.id}/confirm`, { headers, data: { confirmed: true } });
    expect(confirmed.status()).toBe(200);
    const invoiceId = (await confirmed.json()).order.invoiceId;
    const { invoice } = await (await request.get(`/api/checkout/${invoiceId}`)).json();
    expect(recipients.has(invoice.merchant)).toBe(false);
    recipients.add(invoice.merchant);
    const payer = Keypair.generate();
    const prepared = await request.post(`/api/checkout/${invoiceId}/prepare`, { headers, data: { payer: payer.publicKey.toBase58() } });
    expect(prepared.status()).toBe(200);
    const tx = Transaction.from(Buffer.from((await prepared.json()).transaction, "base64"));
    expect(tx.instructions.at(-1)!.keys[2].pubkey.toBase58()).toBe(getAssociatedTokenAddressSync(new PublicKey(DEVNET_USDC), new PublicKey(invoice.merchant)).toBase58());
    if (firstSignature) expect((await request.post(`/api/checkout/${invoiceId}/verify`, { headers, data: { signature: firstSignature } })).status()).toBe(400);
    tx.sign(payer);
    const submitted = await request.post(`/api/checkout/${invoiceId}/submit`, { headers, data: { transaction: tx.serialize().toString("base64") } });
    const { signature } = await submitted.json();
    const verified = await request.post(`/api/checkout/${invoiceId}/verify`, { headers, data: { signature } });
    expect((await verified.json()).paid).toBe(true);
    firstSignature ||= signature;
    const checkout = await (await request.get(`/api/checkout/${invoiceId}`)).json();
    expect(checkout.order.receiptSentAt).toBeNull();
    // Knowing a new account-order URL is not sufficient without a customer or business session.
    await request.post("/api/customer/logout", { headers, data: {} });
    expect((await request.get(`/api/checkout/${invoiceId}`)).status()).toBe(401);
    await request.post("/api/customer/session", { headers, data: {} });
  }
  expect(recipients.size).toBe(4);
});

test("invalid store, cross-store items and unconfigured recipients cannot create orders", async ({ request }) => {
  for (const order of [
    { merchantId: "unknown", items: [{ id: "black-coffee", quantity: 1 }] },
    { merchantId: "corner-pizza", items: [{ id: "black-coffee", quantity: 1 }] },
    { merchantId: "copper-tap", items: [{ id: "mocktail", quantity: 1 }] },
  ]) expect((await request.post("/api/customer/orders", { headers, data: { ...order, requestId: randomUUID() } })).status()).toBe(400);
});

test("late assistant results cannot overwrite a manually selected store", async ({ page }) => {
  let release = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/order-assistant", async route => {
    started = true; await waiting;
    await route.fulfill({ json: { action: "propose", reply: "Old coffee order", order: { merchantId: "maple-coffee", items: [{ id: "latte", quantity: 2 }] } } });
  });
  await page.goto("/customer/shop");
  await page.getByRole("textbox", { name: "Ask Gemini" }).fill("Two lattes");
  await page.getByRole("button", { name: "Ask Gemini" }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("region", { name: "Find a demo store" }).getByRole("button", { name: /Corner Pizza/ }).click();
  const response = page.waitForResponse("**/api/order-assistant"); release(); await response;
  await expect(page.getByRole("heading", { name: "Your order · Corner Pizza" })).toBeVisible();
  await expect(page.getByLabel("Margherita pizza quantity")).toHaveValue("0");
});
