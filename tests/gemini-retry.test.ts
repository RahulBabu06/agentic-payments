import assert from "node:assert/strict";
import { test } from "node:test";
import { retryGemini } from "../src/lib/gemini-retry";

test("transient Gemini failures retry once and can recover", async () => {
  for (const failure of [{ status: 500 }, { status: 502 }, { status: 503 }, { status: 504 }, { name: "TimeoutError" }, { name: "AbortError" }]) {
    let calls = 0;
    assert.equal(await retryGemini(async () => { if (++calls === 1) throw failure; return "draft"; }, async () => {}), "draft");
    assert.equal(calls, 2);
  }
});
test("persistent failure has a finite retry budget", async () => {
  let calls = 0;
  await assert.rejects(retryGemini(async () => { calls++; throw new ErrorWithStatus(503); }, async () => {}));
  assert.equal(calls, 2);
});
test("auth, quota, missing model, bad output and unknown errors never retry here", async () => {
  for (const status of [400, 401, 403, 404, 429, undefined]) {
    let calls = 0;
    await assert.rejects(retryGemini(async () => { calls++; throw new ErrorWithStatus(status); }, async () => {}));
    assert.equal(calls, 1);
  }
});
class ErrorWithStatus extends Error {
  constructor(public status?: number) { super("fixture"); }
}
