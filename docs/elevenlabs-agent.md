# Configure customer voice

The app connects the ElevenLabs React SDK to a **private ElevenLabs agent** using
a short-lived signed WebSocket URL. The API key stays on the Next server.
ElevenLabs handles speech recognition and spoken responses; its agent calls the
`customer_request` client tool, which sends each commerce request to the existing
Gemini integration. Gemini proposes catalog orders or explains a freshly loaded
invoice. No voice tool can issue an invoice, sign, submit, refund, or verify a
payment.

## 1. Create the ElevenLabs agent

In the ElevenLabs dashboard, open **Agents**, create a conversational agent, and:

- Choose an English voice and a supported agent LLM. This agent LLM routes
  conversation; the app's server-side Gemini model handles commerce requests.
- Enable authentication/private access so the server must obtain a signed URL.
- Set the maximum conversation duration to **300 seconds** in the agent settings.
  The browser also stops at five minutes, but only the provider limit bounds an
  independently used signed URL.
- Restrict allowed domains to your demo origins where supported. Local testing
  uses `localhost`; deployed microphone access requires HTTPS.
- Review recording, conversation retention, and privacy settings. The app does
  not save voice transcripts in its database, but ElevenLabs may retain them
  according to your account settings.
- Do not configure server tools, wallet tools, payments, or secret access.

First message:

> Hi! I can help choose services or explain your test invoice. What would you
> like to do? You will always review and approve payments yourself.

System prompt:

```text
You are VoicePay's customer voice interface for a Solana devnet demonstration.
All tokens are test tokens with no monetary value.
For every question about services, orders, totals, invoices, payment status, or
checkout, call customer_request. Pass the customer's full request, including
relevant spoken conversation context, in message.
Speak the tool's returned text. Do not invent services, prices, balances,
invoice details, payment status, or successful actions.
Only report an order update after the tool confirms it. Orders are proposals
on screen, not completed purchases.
Always fetch payment status through the tool rather than remembering it.
You cannot create or issue invoices, approve, initiate, verify or refund
payments. Never request seed phrases, private keys, API keys or card numbers.
If the tool fails, explain the failure and suggest text chat or the form.
Never claim a payment happened because a customer said so.
Keep responses concise. Do not call tools for greetings.
```

## 2. Register the client tool

Under the agent's Tools settings, add a **client tool**, named exactly
`customer_request`. Enable **Wait for response** (`expects_response: true`) and
set its response timeout to **40 seconds** or higher (Gemini has a 26-second
overall request deadline). Use this definition in the JSON tool editor:

```json
{
  "type": "client",
  "name": "customer_request",
  "description": "Ask the VoicePay backend to propose a catalog order or answer a customer question using current invoice data. Read the returned text aloud. Never initiates payments.",
  "expects_response": true,
  "response_timeout_secs": 40,
  "parameters": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "The complete customer request, with relevant spoken context. Maximum 2000 characters."
      }
    },
    "required": ["message"]
  }
}
```

Save/publish the agent configuration and copy its **Agent ID**. Create an API key
with permission to access this agent and obtain conversation signed URLs.

## 3. Configure the app locally

From this repository in your terminal:

```sh
nano .env.local
```

Add these entries **locally**, without pasting their values into chat:

```dotenv
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
```

Keep the existing Gemini key. Set `GEMINI_MODEL=gemini-3.1-flash-lite` to avoid an
initial failed request against a retired model. Save, then stop/restart your
server with `npm run dev`.

## 4. Verify the live flow

1. Open `/order` on localhost (or HTTPS). Accept the audio/data disclosure and
   click **Start voice conversation**. Grant microphone permission.
2. Say “Add two demo services.” The on-screen cart should become 2 × Demo
   service, total **2.00 test USDC**, with its review checkbox unchecked.
3. Say “Make that one.” The cart should change to one, using current cart context.
4. Mute/unmute; confirm speech input stops/resumes. Stop; confirm the browser's
   microphone indicator turns off.
5. Enter a billing name, review, and proceed to wallet checkout manually.
6. Start voice there and ask whether the invoice is paid. It must report awaiting
   verification until the backend has matched a finalized transfer.
7. Pay manually with a funded devnet Phantom test wallet. Ask again after
   finalization; it should report finalized/matched. Open the receipt.
8. Deny microphone access, disconnect the network, and test an invalid agent ID.
   Each should show a recoverable error; manual checkout must remain usable.

The public demo uses global rate limits: five session starts per minute and
15 shared public Gemini requests per minute. Before public deployment, add
per-user limits, session-bound server tool authorization, stronger abuse
protection, and provider spending caps. A signed URL grants access to the
configured agent; treat it as a short-lived credential. This is not a
production-ready public voice gateway.
