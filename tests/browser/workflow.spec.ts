import { expect, test } from "@playwright/test";
import { Keypair, Transaction } from "@solana/web3.js";
const headers = { Origin: "http://localhost:3100" };

test("customer orders, confirms, signs; business receives payment, sends receipt and processes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter customer demo" }).click();
  await page.getByRole("button", { name: "Enter demo customer account" }).click();
  await page.getByRole("link", { name: "Order food & drinks" }).click();
  await page.getByLabel("Black coffee quantity").fill("2");
  await page.getByRole("button", { name: "Place order for confirmation" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm order & open wallet payment" })).toBeDisabled();
  const saved = (await (await page.request.get("/api/customer/orders")).json()).orders[0];
  expect(saved.invoiceId).toBeNull();
  await page.getByLabel("I confirm this store").check();
  await page.getByRole("button", { name: "Confirm order & open wallet payment" }).click();
  await expect(page.getByRole("heading", { name: "Alex Demo", exact: true })).toBeVisible();
  const invoiceId = new URL(page.url()).pathname.split("/").pop()!;
  const payer = Keypair.generate();
  await page.exposeFunction("signTestTransaction", (base64: string) => {
    const tx = Transaction.from(Buffer.from(base64, "base64"));
    tx.sign(payer);
    return { transaction: tx.serialize().toString("base64"), signature: Array.from(tx.signature!) };
  });
  await page.evaluate((address: string) => {
    const w = window as any;
    w.phantom = { solana: {
      connect: async () => ({ publicKey: { toBase58: () => address } }),
      disconnect: async () => {},
      signTransaction: async (tx: any) => {
        const signed = await w.signTestTransaction(btoa(String.fromCharCode(...tx.serialize({ requireAllSignatures: false }))));
        return { signature: Uint8Array.from(signed.signature), serialize: () => Uint8Array.from(atob(signed.transaction), c => c.charCodeAt(0)) };
      },
    } };
  }, payer.publicKey.toBase58());
  await page.getByRole("button", { name: "Connect Phantom wallet" }).click();
  await page.getByLabel("I reviewed the recipient").check();
  await page.getByRole("button", { name: "Approve 6.00 test USDC" }).click();
  await expect(page.getByRole("heading", { name: "Payment finalized" })).toBeVisible({ timeout: 30000 });
  await page.goto(`/document/${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Payment confirmation", exact: true })).toBeVisible();
  await page.goto("/business");
  await page.getByLabel("Business password").fill("browser-test-only-not-a-real-credential");
  await page.getByRole("button", { name: "Unlock business dashboards" }).click();
  await expect(page.getByRole("heading", { name: "Maple Coffee dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Customer voice assistant" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Ask Gemini" })).toHaveCount(0);
  const card = page.locator("section.card").filter({ hasText: saved.id });
  await expect(card).toContainText("Paid · finalized");
  await expect(card.getByRole("button", { name: "Start preparing order" })).toHaveCount(0);
  await card.getByRole("button", { name: "Send receipt to customer account" }).click();
  await card.getByRole("button", { name: "Start preparing order" }).click();
  await card.getByRole("button", { name: "Mark ready for collection" }).click();
  await expect(card).toContainText("Processing: ready");
  await page.getByLabel("Business account").selectOption("bean-and-brew");
  await expect(page.locator("section.card").filter({ hasText: saved.id })).toHaveCount(0);
  await page.goto("/customer");
  await expect(page.getByRole("heading", { name: "Receipt inbox" })).toBeVisible();
  await page.getByRole("link", { name: "Open merchant receipt" }).first().click();
  await expect(page.getByRole("heading", { name: "Payment receipt", exact: true })).toBeVisible();
  await expect(page.getByText("Verified transaction signature")).toBeVisible();
  const record = await (await page.request.get(`/api/checkout/${invoiceId}`)).json();
  const repeated = await page.request.post(`/api/checkout/${invoiceId}/verify`, { headers, data: { signature: record.invoice.signature } });
  expect((await repeated.json()).paid).toBe(true);
});

test("customer menu remains usable without Gemini and persists internal review", async ({ page }) => {
  await page.request.post("/api/customer/session", { headers, data: {} });
  await page.goto("/customer/shop");
  await page.getByRole("textbox", { name: "Ask Gemini" }).fill("Show me the menu");
  await page.getByRole("button", { name: "Ask Gemini" }).click();
  await expect(page.getByRole("status")).toContainText("Gemini is not configured");
  await page.getByLabel("Latte quantity").fill("1");
  await page.getByRole("button", { name: "Place order for confirmation" }).click();
  await page.goto("/customer");
  await page.getByRole("link", { name: "Review internal order" }).first().click();
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toBeVisible();
  await expect(page.getByLabel("Latte quantity")).toHaveValue("1");
  await page.getByLabel("Latte quantity").fill("2");
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toHaveCount(0);
});

test("customer storefront fits mobile widths", async ({ page }) => {
  await page.request.post("/api/customer/session", { headers, data: {} });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer/shop");
  await expect(page.getByRole("heading", { name: "A little less checkout." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("account APIs reject missing sessions and cross-origin mutations", async ({ request }) => {
  for (const path of ["customer/orders", "business/maple-coffee/orders", "invoices"]) {
    expect((await request.get(`/api/${path}`)).status()).toBe(401);
  }
  const foreign = await request.post("/api/customer/session", { headers: { Origin: "https://untrusted.example" }, data: {} });
  expect(foreign.status()).toBe(400);
  expect(await foreign.json()).toEqual({ error: "Invalid request origin" });
  expect((await request.post("/api/assistant", { headers, data: { message: "invoice" } })).status()).toBe(410);
});
