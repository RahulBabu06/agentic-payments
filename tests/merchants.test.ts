import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { merchants, getMerchant, searchMerchants } from "../src/lib/merchants";
import { cartLines, cartSchema, orderSchema } from "../src/lib/catalog";
import { merchantWallet, merchantWalletStatus } from "../src/lib/merchant-wallets";

test("five fictional merchants have distinct menus, IDs and wallet settings", () => {
  assert.equal(merchants.length, 5);
  assert.equal(new Set(merchants.map(store => store.id)).size, 5);
  assert.equal(new Set(merchants.map(store => store.walletEnv)).size, 5);
  for (const store of merchants) {
    assert.ok(store.menu.length >= 3);
    assert.equal(new Set(store.menu.map(item => item.id)).size, store.menu.length);
    assert.ok(store.menu.every(item => Number.isSafeInteger(item.unitCents) && item.unitCents > 0));
  }
});

test("merchant discovery searches names, locations, categories and menu items", () => {
  assert.deepEqual(searchMerchants("maple Oxford").map(store => store.id), ["maple-coffee"]);
  assert.equal(searchMerchants("SOHO").length, 2);
  assert.equal(searchMerchants("restaurant").length, 2);
  assert.equal(searchMerchants("bar")[0].id, "copper-tap");
  assert.equal(searchMerchants("pepperoni")[0].id, "corner-pizza");
  assert.equal(searchMerchants("Starbucks").length, 0);
});

test("prices are server-derived and products cannot leak between stores", () => {
  const lines = cartLines({ merchantId: "maple-coffee", items: [{ id: "black-coffee", quantity: 2 }, { id: "latte", quantity: 1 }] });
  assert.equal(lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0), 1000);
  assert.throws(() => cartLines({ merchantId: "corner-pizza", items: [{ id: "latte", quantity: 1 }] }), /not on/);
  assert.throws(() => getMerchant("not-a-merchant"), /Unknown merchant/);
  assert.equal(cartSchema.safeParse({ merchantId: "maple-coffee", items: [] }).success, true);
  assert.equal(orderSchema.safeParse({ merchantId: "maple-coffee", items: [] }).success, false);
});

test("receiving wallets are explicit, valid and unique, with no default-wallet fallback", () => {
  const wallet = Keypair.generate().publicKey.toBase58();
  const env: Record<string, string | undefined> = { MERCHANT_WALLET: wallet };
  assert.equal(merchantWallet("maple-coffee", env), wallet);
  assert.throws(() => merchantWallet("little-olive", env), /not configured/);
  env.MERCHANT_WALLET_LITTLE_OLIVE = "not-an-address";
  assert.equal(merchantWalletStatus("little-olive", env).ready, false);
  env.MERCHANT_WALLET_LITTLE_OLIVE = wallet;
  assert.throws(() => merchantWallet("little-olive", env), /different receiving wallet/);
  assert.equal(merchantWalletStatus("maple-coffee", env).ready, false);
  env.MERCHANT_WALLET_LITTLE_OLIVE = Keypair.generate().publicKey.toBase58();
  assert.notEqual(merchantWallet("maple-coffee", env), merchantWallet("little-olive", env));
  const all = Object.fromEntries(merchants.map(store => [store.walletEnv, Keypair.generate().publicKey.toBase58()]));
  assert.equal(new Set(merchants.map(store => merchantWallet(store.id, all))).size, 5);
  assert.ok(merchants.every(store => merchantWalletStatus(store.id, all).ready));
});
