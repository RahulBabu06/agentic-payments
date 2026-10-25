import { expect, test } from "@playwright/test";
import { Keypair, Transaction } from "@solana/web3.js";
const headers = { Origin: "http://localhost:3100" };

test("customer opens voice directly while business stays an AI-free protected dashboard", async ({ page }) => {
  let sessions = 0;
  const providerRequests: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/customer/session")) sessions++;
  });
  await page.goto("/customer");
  await expect(page.getByRole("heading", { name: "Just say the word." })).toBeVisible();
  expect(sessions).toBe(1);
  await expect(page.getByRole("region", { name: "Customer voice assistant" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter demo customer account" })).toHaveCount(0);
  expect((await page.request.get("/api/customer/orders")).status()).toBe(200);
  expect((await page.request.get("/api/business/maple-coffee/orders")).status()).toBe(401);
  await page.getByRole("link", { name: "Receipts", exact: false }).click();
  await expect(page).toHaveURL(/\/customer\/receipts$/);
  page.on("request", request => {
    if (/\/api\/(voice\/|order-assistant|assistant)/.test(request.url())) providerRequests.push(request.url());
  });
  await page.goto("/business");
  await expect(page.getByRole("heading", { name: "Business sign in", exact: true })).toBeVisible();
  await page.getByLabel("Business password").fill("browser-test-only-not-a-real-credential");
  await page.getByRole("button", { name: "Unlock business dashboards" }).click();
  await expect(page.getByRole("heading", { name: "Maple Coffee dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Business overview" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Customer voice assistant" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Ask Gemini" })).toHaveCount(0);
  expect(providerRequests).toEqual([]);
});

test("customer entry shows a retryable session error rather than a loading loop", async ({ page }) => {
  await page.route("**/api/customer/session", route => route.fulfill({ status: 400, json: { error: "Invalid request origin" } }));
  await page.goto("/customer");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid request origin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry opening demo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Customer voice assistant" })).toHaveCount(0);
});

test("customer orders, confirms, signs; business receives payment, sends receipt and processes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter customer demo" }).click();
  await expect(page.getByRole("heading", { name: "Just say the word." })).toBeVisible();
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await page.getByLabel("Black coffee quantity").fill("2");
  await page.getByRole("button", { name: "Place order for confirmation" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm order & open wallet payment" })).toBeEnabled();
  const saved = (await (await page.request.get("/api/customer/orders")).json()).orders[0];
  expect(saved.invoiceId).toBeNull();
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
  await page.getByRole("button", { name: "Pay 6.00 test USDC" }).click();
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
  await page.goto("/customer/receipts");
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
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await page.getByRole("textbox", { name: "Ask Gemini" }).fill("Show me the menu");
  await page.getByRole("button", { name: "Ask Gemini" }).click();
  await expect(page.getByRole("status")).toContainText("Gemini is not configured");
  await page.getByLabel("Latte quantity").fill("1");
  await page.getByRole("button", { name: "Place order for confirmation" }).click();
  await page.goto("/customer/receipts");
  await page.getByRole("link", { name: "Review internal order" }).first().click();
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toBeVisible();
  await page.getByRole("button", { name: "Close order confirmation" }).click();
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await expect(page.getByLabel("Latte quantity")).toHaveValue("1");
  await page.getByLabel("Latte quantity").fill("2");
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toHaveCount(0);
});

test("customer storefront fits mobile widths", async ({ page }) => {
  await page.request.post("/api/customer/session", { headers, data: {} });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/customer/shop");
    await expect(page.getByRole("heading", { name: "Just say the word." })).toBeVisible();
    const voice = page.getByRole("region", { name: "Customer voice assistant" });
    await expect(voice).toBeVisible();
    await expect(page.getByLabel("Black coffee quantity")).not.toBeVisible();
    await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
    const input = page.getByLabel("Black coffee quantity");
    expect(await input.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await input.fill("1");
    await page.getByRole("button", { name: "Place order for confirmation" }).click();
    const confirmation = page.getByRole("dialog", { name: "Confirm your internal order" });
    await expect(confirmation).toBeVisible();
    expect((await confirmation.boundingBox())!.y).toBeLessThan(30);
    expect(await confirmation.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(confirmation).not.toBeVisible();
    await expect(input).toHaveValue("1");
    await page.getByRole("button", { name: "Review Maple Coffee" }).click();
    await page.getByRole("button", { name: "Confirm order & open wallet payment" }).click();
    const pay = page.getByRole("button", { name: "Pay 3.00 test USDC" });
    await expect(pay).toBeEnabled();
    expect((await pay.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await pay.click();
    await expect(page.getByRole("alert").filter({ hasText: "Phantom’s in-app browser" })).toBeVisible();
  }
});

test("one-tap payment prevents duplicate requests and never submits without a wallet signature", async ({ page }) => {
  await page.request.post("/api/customer/session", { headers, data: {} });
  const created = await page.request.post("/api/customer/orders", { headers, data: {
    merchantId: "maple-coffee", items: [{ id: "black-coffee", quantity: 1 }], requestId: crypto.randomUUID(),
  } });
  const { order } = await created.json();
  const confirmed = await page.request.post(`/api/customer/orders/${order.id}/confirm`, { headers, data: { confirmed: true } });
  const invoiceId = (await confirmed.json()).order.invoiceId;
  await page.goto(`/pay/${invoiceId}`);
  const pay = page.getByRole("button", { name: "Pay 3.00 test USDC" });
  await expect(pay).toBeEnabled();
  const payer = Keypair.generate().publicKey.toBase58();
  let preparations = 0;
  let submissions = 0;
  page.on("request", request => {
    if (request.url().endsWith(`/${invoiceId}/prepare`)) preparations++;
    if (request.url().endsWith(`/${invoiceId}/submit`)) submissions++;
  });
  await page.evaluate(address => {
    const w = window as any;
    w.__connects = 0;
    w.__signs = 0;
    w.phantom = { solana: {
      connect: () => { w.__connects++; return new Promise(resolve => { w.__connect = () => resolve({ publicKey: { toBase58: () => address } }); }); },
      disconnect: async () => {},
      signTransaction: async () => { w.__signs++; throw new Error("Payment rejected in wallet"); },
    } };
  }, payer);
  // Two synchronous activations exercise the ref lock before React renders busy state.
  await pay.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  expect(await page.evaluate(() => (window as any).__connects)).toBe(1);
  expect(preparations).toBe(0);
  await page.evaluate(() => (window as any).__connect());
  await expect(page.getByRole("alert").filter({ hasText: "Payment rejected in wallet" })).toBeVisible();
  expect(preparations).toBe(1);
  expect(submissions).toBe(0);
  expect(await page.evaluate(() => (window as any).__signs)).toBe(1);
  await expect(pay).toBeEnabled();
  await page.getByLabel("I already sent a payment").check();
  await expect(page.getByRole("button", { name: "Check existing payment first" })).toBeDisabled();
  expect((await (await page.request.get(`/api/checkout/${invoiceId}`)).json()).invoice.status).toBe("issued");
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
