# VoicePay

A web-only, two-sided payment prototype: a business invoice workspace, customer service catalog, Gemini-assisted drafting and ordering, Phantom checkout, finalized Solana **devnet USDC** verification, and printable invoices/receipts.

**Test tokens only. No mainnet, custody, real-money settlement, or refunds.**

Customer voice ordering and invoice help use ElevenLabs + Gemini. See
[voice setup](docs/elevenlabs-agent.md). Voice only proposes orders and answers
questions; wallet approval remains manual.

## Requirements

- Node.js 22.13+ (tested with Node 24). Uses the built-in `node:sqlite` module.
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
- `MERCHANT_WALLET`: **public receiving wallet address only**. Never a private key or seed phrase.
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
4. Sign into `/` with `BUSINESS_PASSWORD`.
5. Create a draft manually, or ask Gemini: “Create an invoice for Acme for 2 consultations at $1 each.”
6. Review and save the draft, then explicitly approve and issue it.
7. Open its checkout link `/pay/<id>`. QR codes link to this page, not directly to a Solana Pay transfer URI.
8. Connect the **customer** Phantom wallet, review the recipient and amount, and approve the transaction.
9. Wait for **finalized** settlement. Confirmation and finalization are not instantaneous; devnet/RPC performance varies.
10. Check the business workspace for the matched payment and open “Invoice / receipt.” Use **Print / Save PDF** to download.
11. Alternatively, visit `/order` to create a customer order from the fixed server-priced catalog. Gemini can propose catalog items; the customer reviews before proceeding.

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
- Public checkout links are bearer capabilities: anyone with the URL can read its customer and invoice details. Share them only with the intended payer.
- Gemini sees invoice data and user requests. Do not enter sensitive personal information in this prototype.

## Pending and failure behavior

- Wallet rejection does not broadcast.
- A definite preflight rejection permits correcting test balances and retrying.
- Transport uncertainty retains the signature and blocks another checkout payment while pending. Reloading retrieves pending signatures from the server.
- If a payment never lands (for example, an expired blockhash after an ambiguous send), verification may remain pending. **Do not pay again blindly.** Inspect the devnet explorer/RPC and resolve the record manually after establishing the transaction did not settle. Automatic expiry reconciliation is not yet implemented.
- Customer voice is user-started on `/order` and `/pay/<id>`, with explicit data consent, microphone controls and stop. Voice replies read fresh invoice state through the tool. Background voice notifications and business voice are not implemented.

## Storage and deployment

SQLite lives in ignored `data/voicepay.sqlite`. Invoices, matching records and sessions survive process restarts. This is a **single-business, single-instance prototype**. Use a persistent disk; ephemeral serverless filesystems are unsuitable. Production requires stronger identity/access controls, a managed database, observability, background reconciliation, infrastructure-backed rate limiting, and operational/compliance review.

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

Browser tests run an isolated Next development server, temporary SQLite database, ephemeral signing wallet, and deterministic local RPC fixture. They cover invoice approval, signed checkout, matching, repeat verification, immutable issued invoices, receipt rendering, missing-key fallback, mobile layout, and access controls. They do not call Gemini or settle on live devnet. Development uses Webpack because the installed Next/Turbopack combination exhibited a repeated HMR hash-mismatch reload during browser testing.

Voice tests cover consent, missing configuration, provider failures, microphone
denial, and a real ElevenLabs SDK session against a simulated WebSocket service
with silent synthetic microphone streams. They exercise tool-to-cart updates,
approval reset, mute/unmute, stop and audio-track cleanup. They do not establish
live speech recognition or spoken audio quality. The optional production test
mode runs the same isolated suite with `next start` against `.next`.

The legacy Solana SDK dependency tree currently has npm audit advisories, including `bigint-buffer` through SPL Token utilities. This prototype is devnet-only; resolve or migrate dependencies before considering real funds or production deployment. Do not use `npm audit fix --force` blindly, as its proposed major-version replacements change APIs.

### Development console messages

`GET /api/invoices 200` is successful background reconciliation polling, not an
error. The dashboard polls every ten seconds while visible and authenticated,
without overlapping polls or repeatedly requesting configuration.
`SQLite is an experimental feature` is a Node runtime warning. The optional
legacy Solana bigint native binding warning means JavaScript arithmetic is
used instead; token amounts are still checked with integer math. Solana token
utilities are loaded only for payment operations rather than every configuration
or assistant request. These warnings are not globally suppressed. A non-2xx
assistant request is a real failure and the UI shows an actionable message.
