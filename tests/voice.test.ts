import { test } from "node:test";
import assert from "node:assert/strict";
import { orderVoiceReply, voiceContext, voiceTurn } from "../src/lib/voice";

test("voice only accepts customer ordering or an invoice-specific help context", () => {
  assert.equal(voiceContext.safeParse({ scope: "refund" }).success, false);
  assert.equal(voiceContext.safeParse({ scope: "checkout" }).success, false);
  assert.equal(voiceTurn.safeParse({ context: { scope: "order" }, message: "hello", current: { items: [{ id: "unknown", quantity: 1 }] } }).success, false);
  assert.equal(voiceTurn.safeParse({ context: { scope: "order" }, message: "" }).success, false);
  assert.equal(voiceTurn.safeParse({ context: { scope: "order" }, message: "two", current: { items: [{ id: "demo", quantity: 1 }, { id: "demo", quantity: 1 }] } }).success, false);
});
test("voice order confirmation uses catalog prices and explicitly requires review", () => {
  const reply = orderVoiceReply({ items: [{ id: "demo", quantity: 2 }, { id: "consultation", quantity: 1 }] });
  assert.match(reply, /27.00 test USDC/);
  assert.match(reply, /Review it on screen/);
  assert.match(reply, /No payment has been made/);
});
