import { expect, test } from "@playwright/test";
import { Keypair, Transaction } from "@solana/web3.js";

test("business drafts, customer signs, backend matches and receipt appears", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your business, connected." })).toBeVisible();
  await page.getByLabel("Workspace password").fill("browser-test-only-not-a-real-credential");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Create an invoice" })).toBeVisible();
  await page.getByLabel("Bill to").fill("Acme Test");
  await page.getByLabel("Item 1 description").fill("Demo consultation");
  await page.getByLabel("Item 1 quantity").fill("2");
  await page.getByLabel("Item 1 unit price").fill("1.25");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await page.getByLabel("I reviewed this saved invoice").check();
  await page.getByRole("button", { name: "Issue payment request" }).click();
  await expect(page.getByRole("heading", { name: "Ready to share" })).toBeVisible();
  await page.getByRole("link", { name: "Open checkout" }).click();
  await expect(page.getByRole("heading", { name: "Acme Test" })).toBeVisible();
  await expect(page.getByText("2.50 USDC", { exact: true })).toBeVisible();

  // Test wallet signs locally with ephemeral fixture keys; no extension or real funds.
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
        const encoded = btoa(String.fromCharCode(...tx.serialize({ requireAllSignatures: false })));
        const signed = await w.signTestTransaction(encoded);
        return { signature: Uint8Array.from(signed.signature), serialize: () => Uint8Array.from(atob(signed.transaction), c => c.charCodeAt(0)) };
      },
    } };
  }, payer.publicKey.toBase58());
  await page.getByRole("button", { name: "Connect Phantom wallet" }).click();
  await page.getByLabel("I reviewed the recipient").check();
  await page.getByRole("button", { name: "Approve 2.50 test USDC" }).click();
  await expect(page.getByRole("heading", { name: "Payment finalized" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "View receipt" }).click();
  await expect(page.getByRole("heading", { name: "Payment receipt" })).toBeVisible();
  await expect(page.getByText("Verified transaction signature")).toBeVisible();
  const invoiceId = new URL(page.url()).pathname.split("/").pop()!;
  const record = await (await page.request.get(`/api/checkout/${invoiceId}`)).json();
  const headers = { Origin: "http://localhost:3100" };
  const repeated = await page.request.post(`/api/checkout/${invoiceId}/verify`, { headers, data: { signature: record.invoice.signature } });
  expect((await repeated.json()).paid).toBe(true);
  const immutable = await page.request.patch(`/api/invoices/${invoiceId}`, { headers, data: { version: record.invoice.version, draft: { customer: "Altered", dueDate: "", lines: [{ description: "Changed", quantity: 1, unitCents: 5 }] } } });
  expect(immutable.status()).toBe(400);
  expect((await immutable.json()).error).toContain("immutable");
  await page.goto("/");
  await page.getByRole("button", { name: "Payment matching" }).click();
  await expect(page.getByRole("cell", { name: "Matched", exact: true })).toBeVisible();
  expect(await page.getByRole("cell", { name: "Matched", exact: true }).count()).toBe(1);
  await page.getByRole("button", { name: "Invoices", exact: false }).first().click();
  if (process.env.DELTA_SCRATCH_DIR) await page.screenshot({ path: `${process.env.DELTA_SCRATCH_DIR}/voicepay-dashboard.png`, fullPage: true });
});

test("customer catalog uses server prices and missing Gemini stays usable", async ({ page }) => {
  await page.goto("/order");
  await page.getByLabel("Demo service quantity").fill("1");
  await page.getByLabel("Your name or business").fill("Customer Test");
  await page.getByLabel("I reviewed this order").check();
  await page.getByRole("button", { name: "Proceed to wallet payment" }).click();
  await expect(page.getByRole("heading", { name: "Customer Test" })).toBeVisible();
  await expect(page.getByText("1.00 USDC", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Ask Gemini" }).fill("How do I pay?");
  await page.getByRole("button", { name: "Ask Gemini" }).click();
  await expect(page.getByRole("status")).toContainText("Gemini is not configured");
  await expect(page.getByRole("button", { name: "Connect Phantom wallet" })).toBeEnabled();
});

test("Gemini preview is explicitly unsaved until saved, then persists in the invoice list", async ({ page }) => {
  // Exercise the UI contract without spending Gemini quota.
  await page.route("**/api/assistant", route => route.fulfill({
    json: {
      reply: "Review the draft preview and click Save draft.",
      draft: {
        customer: "Anthropic Preview Test",
        dueDate: "",
        lines: [{ description: "Consulting", quantity: 1, unitCents: 10000 }],
      },
    },
  }));
  await page.goto("/");
  await page.getByLabel("Workspace password").fill("browser-test-only-not-a-real-credential");
  await page.getByRole("button", { name: "Open workspace" }).click();
  // Ensure new drafts do not disappear behind a previous status filter.
  await page.getByLabel("Filter invoices").selectOption("paid");
  await page.getByRole("textbox", { name: "Ask Gemini" }).fill("Invoice Anthropic for 100 USDC for consulting");
  await page.getByRole("button", { name: "Ask Gemini" }).click();
  await expect(page.getByLabel("Bill to")).toHaveValue("Anthropic Preview Test");
  await expect(page.getByText("Unsaved draft preview.", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Anthropic Preview Test", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "saved as a draft" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Anthropic Preview Test", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Issue payment request" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("cell", { name: "Anthropic Preview Test", exact: true })).toBeVisible();
});

test("customer storefront works at mobile widths without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/order");
  await expect(page.getByRole("heading", { name: "A little less checkout." })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  if (process.env.DELTA_SCRATCH_DIR) await page.screenshot({ path: `${process.env.DELTA_SCRATCH_DIR}/voicepay-mobile.png`, fullPage: true });
});

test("business APIs reject unauthenticated and cross-origin mutations", async ({ request }) => {
  const invoices = await request.get("/api/invoices");
  expect(invoices.status()).toBe(401);
  const foreign = await request.post("/api/session", { headers: { Origin: "https://untrusted.example" }, data: { password: "nope" } });
  expect(foreign.status()).toBe(400);
  expect(await foreign.json()).toEqual({ error: "Invalid request origin" });
});
