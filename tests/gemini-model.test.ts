import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWithModelFallback } from "../src/lib/gemini-model";
import { DEFAULT_GEMINI_MODEL } from "../src/lib/gemini-errors";

test("retired configured model transparently retries once with the supported default", async () => {
  const calls: string[] = [];
  const result = await generateWithModelFallback("retired-model", async model => {
    calls.push(model);
    if (model === "retired-model") throw { status: 404 };
    return { text: "A valid draft" };
  });
  assert.deepEqual(calls, ["retired-model", DEFAULT_GEMINI_MODEL]);
  assert.equal(result.usedFallback, true);
  assert.equal(result.response.text, "A valid draft");
});

test("normalizes model resource prefixes and surrounding whitespace", async () => {
  const calls: string[] = [];
  await generateWithModelFallback(` models/${DEFAULT_GEMINI_MODEL} `, async model => {
    calls.push(model);
    return "ok";
  });
  assert.deepEqual(calls, [DEFAULT_GEMINI_MODEL]);
});

test("default model failure is not retried indefinitely", async () => {
  let count = 0;
  await assert.rejects(generateWithModelFallback(undefined, async () => {
    count++;
    throw { status: 404 };
  }));
  assert.equal(count, 1);
});

test("does not retry key, permission, quota, timeout or service failures", async () => {
  for (const status of [400, 401, 403, 429, 500, 503, 504]) {
    let count = 0;
    const error = { status };
    await assert.rejects(generateWithModelFallback("configured-model", async () => {
      count++;
      throw error;
    }), error);
    assert.equal(count, 1);
  }
});

test("propagates failure of the fallback rather than hiding it", async () => {
  const calls: string[] = [];
  const exhausted = { status: 429 };
  await assert.rejects(generateWithModelFallback("retired-model", async model => {
    calls.push(model);
    throw model === "retired-model" ? { status: 404 } : exhausted;
  }), exhausted);
  assert.deepEqual(calls, ["retired-model", DEFAULT_GEMINI_MODEL]);
});
