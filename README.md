# VoicePay

A web-only, two-sided ordering and payment prototype: one shared demo customer account, five fictional business accounts, customer-only Gemini/ElevenLabs ordering, Phantom checkout, finalized Solana **devnet USDC** verification, business receipt delivery and order preparation.

**Test tokens only. No mainnet, custody, real-money settlement, or refunds.**

Customer voice ordering and invoice help use ElevenLabs + Gemini. See
[voice setup](docs/elevenlabs-agent.md). Voice can propose a cart, save an internal
order and accept explicit order confirmation; wallet signing remains manual.
Business dashboards do not have an AI agent.

The five merchants have distinct menus and receiving-wallet settings.
Verification is **simulated**, not real KYC/KYB. See the
[merchant setup and explanation of the original implementation](docs/demo-merchants.md).

## Requirements

- Node.js 24 (selected by `.node-version` and `engines`). Uses the built-in `node:sqlite` module.
- A Phantom wallet installed in the browser, or Phantom's mobile in-app browser.
- Separate merchant and customer test wallets.
- Gemini API key for assistant features. The manual forms work without Gemini.

## Run locally

```sh
npm install
cp -n .env.example .env.local
```

Edit `.env.local` locally (do not paste credentials into chat):

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
BUSINESS_PASSWORD=
MERCHANT_WALLET=
SOLANA_RPC_URL=https://api.devnet.solana.com
```

- `GEMINI_API_KEY`: create at https://aistudio.google.com/api-keys.
- `BUSINESS_PASSWORD`: choose a strong password for this demo workspace.
- `MERCHANT_WALLET`: Maple Coffee's **public receiving wallet address only**. Never a private key or seed phrase. Configure four more distinct addresses using the names in `.env.example` and [the merchant setup guide](docs/demo-merchants.md). Unconfigured stores remain browsable but cannot take payments.
- `GEMINI_MODEL`: configurable because account availability varies. This implementation uses `@google/genai`'s `models.generateContent` with validated structured output, not the Interactions API.
- The default is `gemini-3.1-flash-lite`, verified with this project's account. Google rejected the previous `gemini-2.5-flash` setting as unavailable to new users. If a different configured model returns 404, the app retries once with the tested default and displays a fallback notice. Key, permission, quota, and timeout failures are never retried across models. Updating `.env.example` does not overwrite `.env.local`; setting `GEMINI_MODEL=gemini-3.1-flash-lite` there avoids the initial unavailable-model request.
- Custom RPC credentials remain server-side. The app checks the RPC genesis hash against devnet before payment operations.
- Transient Gemini 5xx/timeouts retry once on the same model, with SDK retries disabled, a 12-second per-attempt timeout and a 26-second overall deadline including model fallback. Authentication/quota/invalid-output errors are not retried. A provider outage can still fail; forms remain usable, and drafting never issues or pays an invoice.
- Optional customer voice: set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` server-side, configure the private agent's `customer_request` client tool, and restart. Follow [the complete agent configuration](docs/elevenlabs-agent.md) before starting a conversation.

```sh
npm run dev
```

Open http://localhost:3000. Restart after editing environment variables.

An `export GEMINI_API_KEY=...` in a different terminal does not configure this process. Use `.env.local` in this worktree or start the server from the shell where the variable was exported.

## Test the complete workflow

1. Set Phantom to Solana **devnet** and use dedicated test wallets. Do not fund these with real assets.
2. Fund the **customer** with devnet SOL at https://faucet.solana.com/ and devnet USDC at https://faucet.circle.com/ (select Solana devnet). These are separate assets. Token-account creation can also cost test SOL.
3. Configure the **merchant's public wallet address** in `.env.local`. The merchant does not sign incoming transfers or need to expose any keys to the app.
4. Open `/customer` directly. It automatically opens the **Alex Demo** session and
   voice ordering, with no account/sign-in screen. This remains a deliberately
   shared demo identity, without a customer password; do not store personal data.
5. Ask for a store's menu and build a cart by voice,
   or say the store and items directly. The default screen is a minimal voice orb,
   not a dashboard. Text and menu controls are tucked under **Can’t use voice?** as
   an accessibility/offline-provider fallback. `/order` and `/customer/shop` remain
   aliases. `/customer/receipts` holds past orders and receipts.
6. Say “Place my order” or use **Place order for confirmation**. This persists an
   internal order and a ten-minute quote. No payment request exists yet.
7. Review store, items, price and recipient. Explicitly confirm by voice or the
   **Confirm order & open wallet payment** button—no extra checkbox. Confirmation creates one immutable payment request, at most
   once on retries. Open its checkout `/pay/<id>`.
8. Review the recipient and amount, then tap **Pay … test USDC**. This connects the
   **customer** Phantom wallet and requests a signature in one app action; wallet
   connection/signature approval is still required in Phantom. On phones, open
   VoicePay in Phantom’s in-app browser and enter the demo account there.
9. Wait for **finalized** settlement. Confirmation and finalization are not instantaneous; devnet/RPC performance varies.
10. Open `/business`, sign in with `BUSINESS_PASSWORD` and select the receiving
    business. The one password intentionally unlocks all five demo dashboards.
    Only finalized matched orders appear. Click **Send receipt to customer account**.
11. Click **Start preparing order**, then mark ready/collected. Return to `/customer`
    to see order status and the receipt inbox. Open the receipt to Print / Save PDF.
    Before the business sends it, the printable payment document is labeled
    **Payment confirmation**, not a merchant receipt.

Past-order personalization, preferences, real KYB and automatic/delegated wallet
signing remain out of scope. Fulfilment is simulated.

For phone testing, use a reachable HTTPS deployment/tunnel under your control. A QR pointing to `localhost` on a laptop cannot be opened from another phone. Do not publicly expose a development server or private RPC credentials.

## Payment safety model

- One supported network (devnet) and exact accepted mint:
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, six decimals.
- Amounts use integer USD cents and integer token base units.
- Issued payment terms are immutable. Draft edits use optimistic versions.
- Each invoice has a cryptographically random readonly reference attached to the SPL Token `TransferChecked` instruction.
- The backend prepares the transfer, including idempotent merchant token-account creation if required. A temporary message hash binds submission to that prepared transaction.
- Only the customer's wallet signs. The server never holds wallet keys.
- A signed signature is saved before broadcast. Unknown transport outcomes remain pending; the app does not automatically ask for another payment.
- A partial unique database index prevents two in-flight submissions for the same invoice through this backend.
- Matching requires finalized successful execution, the correct mint, recipient, exact amount, instruction reference and merchant token balance increase. It never trusts a client “success” callback or Gemini's assertions.
- Transactions are credited at most once. Under/overpayments and additional payments with the invoice reference appear in the exception list after verification.
- The verifier processes transactions submitted through checkout or manually supplied for verification. It is **not** a background indexer of every incoming wallet transfer; unrelated/unreferenced deposits are not automatically discovered.
- No automatic refund. Direct unsolicited transfers cannot be prevented.
- New customer-order checkout/document APIs require a customer or business session.
  All demo customer sessions represent Alex Demo, not separate private users.
  Legacy invoice links remain bearer capabilities; do not share sensitive data.
- Gemini sees invoice data and user requests. Do not enter sensitive personal information in this prototype.

## Pending and failure behavior

- Wallet rejection does not broadcast.
- A definite preflight rejection permits correcting test balances and retrying.
- Transport uncertainty retains the signature and blocks another checkout payment while pending. Reloading retrieves pending signatures from the server.
- If a payment never lands (for example, an expired blockhash after an ambiguous send), verification may remain pending. **Do not pay again blindly.** Inspect the devnet explorer/RPC and resolve the record manually after establishing the transaction did not settle. Automatic expiry reconciliation is not yet implemented.
- Customer voice is user-started with one **Start voice conversation** tap on `/order` and `/pay/<id>`. The button accepts the visible audio/data disclosure; microphone permission is still required. Mute and stop remain available. Voice replies read fresh invoice state through the tool. Background voice notifications and business voice are not implemented.
- The voice orb has distinct connecting, listening, speaking, muted and error states.
  Motion reflects SDK conversation state, not a measured microphone waveform.
  **Gentle vibration** is opt-in for the browser tab, with short pulses on voice
  transitions and an order-ready pattern. Vibration requires browser/device support;
  Safari/iOS does not support the Web Vibration API. Reduced-motion preferences
  disable the animation and haptics.
- Saved orders open an accessible confirmation sheet at the top of the viewport.
  It shows the merchant, items and amount before proceeding to Phantom. Dismiss
  it to continue talking or changing the order; **Review …** reopens it.
  Customer receipts are one **Receipts** link away at `/customer/receipts`.
  `/business` is a separate password-protected dashboard for totals, paid orders,
  receipt delivery and fulfilment, with no Gemini or ElevenLabs integration.

## Storage and deployment

For hosting both the website and API on one Render Node service, follow the
[Render deployment guide](docs/render.md). Use Node 24 and a persistent disk;
deploying this app as a static site does not support its API or database.

SQLite lives in ignored `data/voicepay.sqlite`. Internal orders, invoices, receipts,
fulfilment state, matching records and sessions survive process restarts.
This is a **single-instance demo**, not production account isolation. The customer
and business have separate session cookies. All five business dashboards share a
demo administrator password; merchant-specific queries and action checks separate
their orders. Receipt delivery is an in-app persisted timestamp, not email.
Use a persistent disk; ephemeral serverless filesystems are unsuitable. Production
requires real identity/access controls, a managed database, background reconciliation,
infrastructure-backed rate limiting and operational/compliance review.

Sessions use HTTP-only, SameSite cookies; production cookies require HTTPS. Mutation endpoints check request origin. Public AI requests have a small global rate limit to bound demo costs (not production abuse protection).

## Checks

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
# Also exercise the built production application (run npm run build first):
VOICEPAY_TEST_PRODUCTION=1 npm run test:browser
```

Unit tests exercise integer money handling, input validation, payment identity, under/overpayment, failed execution, wrong recipients/mints, and merchant balance checks. They use synthetic transactions and are not evidence of a live wallet payment. Live Gemini and live devnet settlement must be tested separately with the configuration above.

Browser tests run an isolated Next development server, temporary SQLite database,
ephemeral signing wallet and deterministic local RPC fixture. They cover customer
login, internal order review/confirmation, signed checkout, matching, distinct
recipients, merchant dashboards, receipt delivery, processing transitions, missing-key
fallback, mobile layout and access controls. They do not call Gemini or settle on
live devnet. Development uses Webpack because the installed Next/Turbopack combination
exhibited a repeated HMR hash-mismatch reload during browser testing.

Voice tests cover consent, missing configuration, provider failures, microphone
denial, and a real ElevenLabs SDK session against a simulated WebSocket service
with silent synthetic microphone streams. They exercise tool-to-cart updates,
confirmation-sheet placement/focus/dismissal, optional haptic patterns, reduced
motion, mute/unmute, stop and audio-track cleanup. They do not establish
live speech recognition or spoken audio quality. The optional production test
mode runs the same isolated suite with `next start` against `.next`.

The legacy Solana SDK dependency tree currently has npm audit advisories, including `bigint-buffer` through SPL Token utilities. This prototype is devnet-only; resolve or migrate dependencies before considering real funds or production deployment. Do not use `npm audit fix --force` blindly, as its proposed major-version replacements change APIs.

### Development console messages

`GET /api/customer/orders 200` and `GET /api/business/<store>/orders 200`
are successful background dashboard polling, not errors.
`SQLite is an experimental feature` is a Node runtime warning. The optional
legacy Solana bigint native binding warning means JavaScript arithmetic is
used instead; token amounts are still checked with integer math. Solana token
utilities are loaded only for payment operations rather than every configuration
or assistant request. These warnings are not globally suppressed. A non-2xx
assistant request is a real failure and the UI shows an actionable message.
