import { test, expect, type WebSocketRoute } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  const headers = { Origin: "http://localhost:3100" };
  await page.request.post("/api/customer/session", { headers, data: {} });
  await request.post("/api/customer/session", { headers, data: {} });
});

test("voice fails closed without configuration and does not break manual ordering", async ({ page, request }) => {
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeDisabled();
  await expect(voice).toContainText("Voice needs ElevenLabs and Gemini");
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await page.getByLabel("Black coffee quantity").fill("1");
  await expect(page.getByRole("button", { name: "Place order for confirmation" })).toBeEnabled();
  const headers = { Origin: "http://localhost:3100" };
  const missing = await request.post("/api/voice/session", { headers, data: { scope: "order" } });
  expect(missing.status()).toBe(503);
  expect((await missing.json()).error).toContain("Voice is not configured");
  const invalid = await request.post("/api/voice/turn", { headers, data: { context: { scope: "refund" }, message: "refund me" } });
  expect(invalid.status()).toBe(400);
  const noModel = await request.post("/api/voice/turn", { headers, data: { context: { scope: "order" }, message: "add coffee", current: { merchantId: "maple-coffee", items: [] } } });
  expect(noModel.status()).toBe(503);
});

test("voice starts with one consent-bearing tap and provider errors are recoverable", async ({ page }) => {
  let sessions = 0;
  await page.route("**/api/config", route => route.fulfill({ json: { merchantConfigured: true, voiceConfigured: true, geminiConfigured: true } }));
  await page.route("**/api/voice/session", route => { sessions++; return route.fulfill({ status: 503, json: { error: "ElevenLabs agent not found. Check ELEVENLABS_AGENT_ID on the server." } }); });
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeEnabled();
  await expect(voice).toContainText("By tapping Start voice conversation, you agree");
  expect(sessions).toBe(0);
  await voice.getByRole("button", { name: "Start voice conversation" }).click();
  expect(sessions).toBe(1);
  await expect(voice.getByRole("alert")).toContainText("agent not found");
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeEnabled();
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await expect(page.getByLabel("Black coffee quantity")).toBeEnabled();
});

test("real ElevenLabs SDK routes a fixture voice tool into cart preview without approval", async ({ page, context }) => {
  // Protocol fixture + fake microphone, NOT a live ElevenLabs speech service.
  await context.grantPermissions(["microphone"]);
  await page.setViewportSize({ width: 390, height: 844 });
  // Some headless hosts cannot open even Chromium's fake capture device.
  // Supply real, silent MediaStreams without accessing the host microphone.
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    (window as any).__voiceTestStreams = streams;
    (window as any).__vibrations = [];
    Object.defineProperty(navigator, "vibrate", { value: (pattern: number | number[]) => { (window as any).__vibrations.push(pattern); return true; } });
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const destination = audio.createMediaStreamDestination();
      streams.push(destination.stream);
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); void audio.close().catch(() => {}); };
      }
      return destination.stream;
    };
  });
  await page.route("**/api/config", route => route.fulfill({ json: { merchantConfigured: true, voiceConfigured: true, geminiConfigured: true } }));
  await page.route("**/api/voice/session", route => route.fulfill({ json: { signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation?token=fixture" } }));
  let turn: unknown;
  await page.route("**/api/voice/turn", async route => {
    turn = route.request().postDataJSON();
    const input = turn as any;
    const headers = { Origin: "http://localhost:3100" };
    // Structured Gemini intent is a fixture; persistence uses the real account API.
    if (input.message === "Place my order") {
      const response = await page.request.post("/api/customer/orders", { headers, data: { ...input.current, requestId: input.requestId } });
      expect(response.status()).toBe(200);
      const { order: internalOrder } = await response.json();
      return route.fulfill({ json: { order: input.current, internalOrder, say: "Order saved. Do you confirm one margherita for 10.00 test USDC?" } });
    }
    if (input.message === "Yes, I confirm this order") {
      const response = await page.request.post(`/api/customer/orders/${input.pendingOrderId}/confirm`, { headers, data: { confirmed: true } });
      expect(response.status()).toBe(200);
      const { order: internalOrder } = await response.json();
      return route.fulfill({ json: { order: input.current, internalOrder, say: "Order confirmed. Open wallet payment on screen. No payment made." } });
    }
    if ((turn as any).message.includes("pizza")) return route.fulfill({ json: {
      order: { merchantId: "corner-pizza", items: [{ id: "margherita", quantity: 1 }] },
      say: "Draft order at Corner Pizza is one margherita. Review on screen.",
    } });
    return route.fulfill({ json: { order: { merchantId: "maple-coffee", items: [{ id: "black-coffee", quantity: 2 }] }, say: "Draft total 6.00 test USDC. Review on screen." } });
  });
  let socket: WebSocketRoute | undefined;
  let result: any;
  await page.routeWebSocket("wss://api.elevenlabs.io/**", ws => {
    socket = ws;
    ws.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type === "conversation_initiation_client_data") ws.send(JSON.stringify({
        type: "conversation_initiation_metadata",
        conversation_initiation_metadata_event: {
          conversation_id: "fixture-conversation", agent_output_audio_format: "pcm_16000", user_input_audio_format: "pcm_16000",
        },
      }));
      if (message.type === "client_tool_result") result = message;
    });
  });
  await page.goto("/order");
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await page.getByLabel("Black coffee quantity").fill("1");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  expect(await page.evaluate(() => (window as any).__vibrations.filter((pattern: unknown) => pattern !== 0))).toEqual([]);
  await voice.getByLabel("Gentle vibration").check();
  await voice.getByRole("button", { name: "Start voice conversation" }).click();
  await expect(voice.getByText("Listening…", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(voice).toHaveAttribute("data-phase", "listening");
  expect(await voice.locator(".voice-orb").evaluate(el => getComputedStyle(el).animationName)).toBe("voice-breathe");
  expect(await page.evaluate(() => (window as any).__vibrations.length)).toBeGreaterThan(0);
  socket!.send(JSON.stringify({
    type: "client_tool_call",
    client_tool_call: { tool_name: "customer_request", tool_call_id: "fixture-call", parameters: { message: "Make that two black coffees" } },
  }));
  await expect(page.getByLabel("Black coffee quantity")).toHaveValue("2");
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toHaveCount(0);
  expect(turn).toMatchObject({ context: { scope: "order" }, message: "Make that two black coffees", current: { merchantId: "maple-coffee", items: [{ id: "black-coffee", quantity: 1 }] } });
  expect((turn as any).requestId).toBeTruthy();
  await expect.poll(() => result?.result).toContain("Draft total 6.00");
  socket!.send(JSON.stringify({
    type: "client_tool_call",
    client_tool_call: { tool_name: "customer_request", tool_call_id: "fixture-store-switch", parameters: { message: "Instead, one margherita pizza from Corner Pizza" } },
  }));
  await expect(page.getByLabel("Margherita pizza quantity")).toHaveValue("1");
  await expect(page.getByLabel("Black coffee quantity")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toHaveCount(0);
  await voice.getByRole("button", { name: "Mute microphone", exact: true }).click();
  await expect(voice.getByText("Microphone muted", { exact: true })).toBeVisible();
  await expect(voice).toHaveAttribute("data-phase", "muted");
  await voice.getByRole("button", { name: "Unmute microphone", exact: true }).click();
  socket!.send(JSON.stringify({
    type: "client_tool_call",
    client_tool_call: { tool_name: "customer_request", tool_call_id: "fixture-place", parameters: { message: "Place my order" } },
  }));
  await expect(page.getByRole("heading", { name: "Confirm your internal order" })).toBeVisible();
  expect((await page.getByRole("dialog").boundingBox())!.y).toBeLessThan(30);
  expect(await page.evaluate(() => (window as any).__vibrations)).toContainEqual([25, 70, 25]);
  await expect(page.getByRole("button", { name: "Confirm order & open wallet payment" })).toBeEnabled();
  socket!.send(JSON.stringify({
    type: "client_tool_call",
    client_tool_call: { tool_name: "customer_request", tool_call_id: "fixture-confirm", parameters: { message: "Yes, I confirm this order" } },
  }));
  await expect(page.getByRole("link", { name: "Open wallet payment" })).toBeVisible();
  // Voice cannot open or sign a wallet itself.
  expect(new URL(page.url()).pathname).toBe("/customer/shop");
  await page.getByRole("button", { name: "Close order confirmation" }).click();
  await voice.getByRole("button", { name: "Stop voice", exact: true }).click();
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeVisible();
  await expect(voice).toContainText("Microphone off");
  await expect.poll(() => page.evaluate(() => (window as any).__voiceTestStreams.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === "ended")))).toBe(true);
  await expect(voice).toHaveAttribute("data-phase", "idle");
  await page.getByRole("button", { name: "Review Corner Pizza" }).click();
  await expect(page.getByRole("link", { name: "Open wallet payment" })).toBeVisible();
});

test("microphone denial leaves manual checkout usable and permits a voice retry", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied in fixture", "NotAllowedError"); };
  });
  await page.route("**/api/config", route => route.fulfill({ json: { merchantConfigured: true, voiceConfigured: true, geminiConfigured: true } }));
  await page.route("**/api/voice/session", route => route.fulfill({ json: { signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation?token=fixture" } }));
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await voice.getByRole("button", { name: "Start voice conversation" }).click();
  await expect(voice.getByRole("alert")).toContainText("microphone permission");
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeEnabled();
  await page.getByText("Can’t use voice? Order manually or type instead", { exact: true }).click();
  await page.getByLabel("Black coffee quantity").fill("1");
  await expect(page.getByRole("button", { name: "Place order for confirmation" })).toBeEnabled();
});

test("reduced-motion preferences disable voice animation and optional haptics", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    (window as any).__vibrations = [];
    Object.defineProperty(navigator, "vibrate", { value: (pattern: number | number[]) => { (window as any).__vibrations.push(pattern); return true; } });
  });
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await voice.getByLabel("Gentle vibration").check();
  expect(await page.evaluate(() => (window as any).__vibrations.filter((pattern: unknown) => pattern !== 0))).toEqual([]);
  // Check the same selectors used by active listening/speaking, without opening the microphone.
  await voice.evaluate(el => el.setAttribute("data-phase", "speaking"));
  expect(await voice.locator(".voice-wave span").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  expect(await voice.locator(".voice-orbit").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
});
