import { test } from "node:test";
import assert from "node:assert/strict";
import { atomicAmount, draftSchema, totalCents } from "../src/lib/domain";

test("money is computed as integer cents then converted to six-decimal token units", () => {
  assert.equal(totalCents([{ description: "Demo", quantity: 3, unitCents: 10 }]), 30);
  assert.equal(atomicAmount(30), 300000n);
  assert.equal(atomicAmount(1), 10000n);
});
test("rejects zero, negative, fractional and oversized totals", () => {
  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => atomicAmount(amount));
  }
  assert.throws(() => totalCents([{ description: "Demo", quantity: 10000, unitCents: 100000000 }]));
});
test("draft schema rejects missing information, invalid dates and fractional quantities", () => {
  const good = { customer: "Acme", dueDate: "", lines: [{ description: "Demo", quantity: 1, unitCents: 100 }] };
  assert.equal(draftSchema.parse(good).customer, "Acme");
  for (const bad of [
    { ...good, customer: "" }, { ...good, dueDate: "2026-02-31" }, { ...good, dueDate: "2026-99-01" },
    { ...good, lines: [] }, { ...good, lines: [{ description: "Demo", quantity: 1.5, unitCents: 100 }] },
    { ...good, lines: [{ description: "Demo", quantity: 1, unitCents: 0.5 }] },
  ]) assert.equal(draftSchema.safeParse(bad).success, false);
});
