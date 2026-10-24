import { test, expect, type WebSocketRoute } from "@playwright/test";

test("voice fails closed without configuration and does not break manual ordering", async ({ page, request }) => {
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeDisabled();
  await expect(voice).toContainText("Voice needs ElevenLabs and Gemini");
  await page.getByLabel("Demo service quantity").fill("1");
  await expect(page.getByRole("button", { name: "Proceed to wallet payment" })).toBeDisabled();
  const headers = { Origin: "http://localhost:3100" };
  const missing = await request.post("/api/voice/session", { headers, data: { scope: "order" } });
  expect(missing.status()).toBe(503);
  expect((await missing.json()).error).toContain("Voice is not configured");
  const invalid = await request.post("/api/voice/turn", { headers, data: { context: { scope: "refund" }, message: "refund me" } });
  expect(invalid.status()).toBe(400);
  const noModel = await request.post("/api/voice/turn", { headers, data: { context: { scope: "order" }, message: "add demo" } });
  expect(noModel.status()).toBe(503);
});

test("voice consent gates session access and provider errors are recoverable", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { merchantConfigured: true, voiceConfigured: true, geminiConfigured: true } }));
  await page.route("**/api/voice/session", route => route.fulfill({ status: 503, json: { error: "ElevenLabs agent not found. Check ELEVENLABS_AGENT_ID on the server." } }));
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeDisabled();
  await voice.getByRole("checkbox").check();
  await voice.getByRole("button", { name: "Start voice conversation" }).click();
  await expect(voice.getByRole("alert")).toContainText("agent not found");
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeEnabled();
  await expect(page.getByLabel("Demo service quantity")).toBeEnabled();
});

test("real ElevenLabs SDK routes a fixture voice tool into cart preview without approval", async ({ page, context }) => {
  // Protocol fixture + fake microphone, NOT a live ElevenLabs speech service.
  await context.grantPermissions(["microphone"]);
  // Some headless hosts cannot open even Chromium's fake capture device.
  // Supply real, silent MediaStreams without accessing the host microphone.
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    (window as any).__voiceTestStreams = streams;
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
  await page.route("**/api/voice/turn", route => {
    turn = route.request().postDataJSON();
    return route.fulfill({ json: { order: { items: [{ id: "demo", quantity: 2 }] }, say: "Draft total 2.00 test USDC. Review on screen." } });
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
  await page.getByLabel("Demo service quantity").fill("1");
  await page.getByLabel("I reviewed this order").check();
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await voice.getByRole("checkbox").check();
  await voice.getByRole("button", { name: "Start voice conversation" }).click();
  await expect(voice.getByText("Listening…", { exact: true })).toBeVisible({ timeout: 20000 });
  socket!.send(JSON.stringify({
    type: "client_tool_call",
    client_tool_call: { tool_name: "customer_request", tool_call_id: "fixture-call", parameters: { message: "Make that two demo services" } },
  }));
  await expect(page.getByLabel("Demo service quantity")).toHaveValue("2");
  await expect(page.getByLabel("I reviewed this order")).not.toBeChecked();
  expect(turn).toEqual({ context: { scope: "order" }, message: "Make that two demo services", current: { items: [{ id: "demo", quantity: 1 }] } });
  await expect.poll(() => result?.result).toContain("Draft total 2.00");
  await voice.getByRole("button", { name: "Mute microphone", exact: true }).click();
  await expect(voice.getByText("Microphone muted", { exact: true })).toBeVisible();
  await voice.getByRole("button", { name: "Unmute microphone", exact: true }).click();
  await voice.getByRole("button", { name: "Stop voice", exact: true }).click();
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeVisible();
  await expect(voice).toContainText("Microphone off");
  await expect.poll(() => page.evaluate(() => (window as any).__voiceTestStreams.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === "ended")))).toBe(true);
  await expect(page.getByRole("button", { name: "Proceed to wallet payment" })).toBeDisabled();
});

test("microphone denial leaves manual checkout usable and permits a voice retry", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied in fixture", "NotAllowedError"); };
  });
  await page.route("**/api/config", route => route.fulfill({ json: { merchantConfigured: true, voiceConfigured: true, geminiConfigured: true } }));
  await page.route("**/api/voice/session", route => route.fulfill({ json: { signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation?token=fixture" } }));
  await page.goto("/order");
  const voice = page.getByRole("region", { name: "Customer voice assistant" });
  await voice.getByRole("checkbox").check();
  await voice.getByRole("button", { name: "Start voice conversation" }).click();
  await expect(voice.getByRole("alert")).toContainText("microphone permission");
  await expect(voice.getByRole("button", { name: "Start voice conversation" })).toBeEnabled();
  await page.getByLabel("Demo service quantity").fill("1");
  await page.getByLabel("Your name or business").fill("Mic Denied Test");
  await page.getByLabel("I reviewed this order").check();
  await expect(page.getByRole("button", { name: "Proceed to wallet payment" })).toBeEnabled();
});
