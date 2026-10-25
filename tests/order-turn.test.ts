import { test } from "node:test";
import assert from "node:assert/strict";
import { sameCart, type Cart } from "../src/lib/catalog";
import { interpretOrder } from "../src/lib/order-turn";
import { boundedTranscript } from "../src/lib/assistant-transcript";

const maple: Cart = { merchantId: "maple-coffee", items: [{ id: "latte", quantity: 1 }] };
const modelMenu = {
  reply: "Black coffee is 99.00 test USDC",
  order: { merchantId: "maple-coffee" as const, items: [
    { id: "black-coffee" as const, quantity: 1 },
    { id: "latte" as const, quantity: 1 },
    { id: "croissant" as const, quantity: 1 },
  ] },
  action: "propose" as const,
};

test("menu questions use catalog prices and do not replace the cart", () => {
  const result = interpretOrder("Show me the menu", modelMenu, maple);
  assert.equal(result.kind, "menu");
  if (result.kind !== "menu") return;
  assert.match(result.reply, /Maple Coffee/);
  assert.match(result.reply, /Black coffee, 3\.00 test USDC/);
  assert.match(result.reply, /Latte, 4\.00 test USDC/);
  assert.doesNotMatch(result.reply, /99\.00/);
  assert.equal("order" in result, false);
});

test("a named store menu wins over the on-screen store and a wrong model cart", () => {
  const result = interpretOrder("What's on the menu at Corner Pizza?", {
    reply: "Here is Maple",
    order: maple,
    action: "place_order",
  }, maple);
  assert.equal(result.kind, "menu");
  if (result.kind !== "menu") return;
  assert.match(result.reply, /Corner Pizza/);
  assert.match(result.reply, /Margherita pizza, 10\.00 test USDC/);
  assert.doesNotMatch(result.reply, /Latte/);
});

test("menu retrieval follows the item asked for, and ambiguous or unknown stores do not invent a menu", () => {
  const pizzas = interpretOrder("What pizzas do you have?", { reply: "A 1.00 slice", order: null, action: "show_menu" }, maple);
  assert.equal(pizzas.kind, "menu");
  if (pizzas.kind === "menu") {
    assert.match(pizzas.reply, /Corner Pizza/);
    assert.match(pizzas.reply, /Pepperoni pizza, 12\.00 test USDC/);
    assert.doesNotMatch(pizzas.reply, /1\.00 slice/);
  }
  const black = interpretOrder("What's the price of a black coffee?", { reply: "It is 99.00", order: null, action: "show_menu" }, { merchantId: "corner-pizza", items: [] });
  assert.equal(black.kind, "menu");
  if (black.kind === "menu") {
    assert.match(black.reply, /Maple Coffee/);
    assert.match(black.reply, /Black coffee, 3\.00 test USDC/);
    assert.doesNotMatch(black.reply, /99\.00/);
  }
  const coffee = interpretOrder("Show me the coffee menu", { reply: "x", order: null, action: "show_menu" }, maple);
  assert.equal(coffee.kind, "menu");
  if (coffee.kind === "menu") {
    assert.match(coffee.reply, /Maple Coffee/);
    assert.match(coffee.reply, /Bean and Brew/);
    assert.doesNotMatch(coffee.reply, /Black coffee, 3\.00/);
  }
  const soho = interpretOrder("Show me the menu in Soho", { reply: "x", order: null, action: "show_menu" }, maple);
  assert.equal(soho.kind, "menu");
  if (soho.kind === "menu") {
    assert.match(soho.reply, /Bean and Brew/);
    assert.match(soho.reply, /Little Olive/);
    assert.doesNotMatch(soho.reply, /Black coffee/);
  }
  const other = interpretOrder("menu at Starbucks", { reply: "Starbucks lattes are 1.00", order: null, action: "propose" }, maple);
  assert.equal(other.kind, "menu");
  if (other.kind === "menu") {
    assert.match(other.reply, /not one of the demo stores/);
    assert.doesNotMatch(other.reply, /1\.00/);
    assert.match(other.reply, /Maple Coffee/);
  }
});

test("cart changes and later placement are not treated as menu retrieval", () => {
  const added = interpretOrder("Two black coffees", {
    reply: "Added",
    order: { merchantId: "maple-coffee", items: [{ id: "black-coffee", quantity: 2 }] },
    action: "propose",
  }, { merchantId: "maple-coffee", items: [] });
  assert.equal(added.kind, "propose");
  if (added.kind === "propose") assert.equal(added.order?.items[0].quantity, 2);
  const message = ["Customer: Show me the menu", "Assistant: The menu at Maple Coffee is long", "Customer: Place my order"].join("\n");
  const placed = interpretOrder(message, { reply: "Placing", order: maple, action: "place_order" }, maple);
  assert.equal(placed.kind, "place");
});

test("confirmation compares carts by contents, not JSON key or item order", () => {
  assert.equal(sameCart(
    { merchantId: "maple-coffee", items: [{ id: "latte", quantity: 1 }, { id: "black-coffee", quantity: 2 }] },
    { merchantId: "maple-coffee", items: [{ id: "black-coffee", quantity: 2 }, { id: "latte", quantity: 1 }] },
  ), true);
  assert.equal(sameCart(maple, { merchantId: "maple-coffee", items: [{ id: "latte", quantity: 2 }] }), false);
  assert.equal(sameCart(maple, { merchantId: "corner-pizza", items: [{ id: "margherita", quantity: 1 }] }), false);
});

test("assistant history keeps the latest request inside the API limit", () => {
  const history = Array.from({ length: 6 }, (_, index) => `${index % 2 ? "Assistant" : "Customer"}: ${"menu ".repeat(200)}`);
  const text = boundedTranscript(history, "two lattes");
  assert.ok(text.length <= 2000);
  assert.match(text, /Customer: two lattes$/);
  assert.equal(boundedTranscript([], "  hello  "), "Customer: hello");
});
