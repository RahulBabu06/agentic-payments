# Deploy the VoicePay devnet demo on Render

Deploy **one Node web service**, not a static site or separate frontend and
backend. Next.js serves both the UI and `/api/*` routes.

## Service settings

| Setting | Value |
| --- | --- |
| Repository | `RahulBabu06/agentic-payments` |
| Branch | `feat/voicepay-devnet` |
| Root directory | Repository root (leave blank) |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start -- --hostname 0.0.0.0 --port $PORT` |
| Instances | One |

The repository selects Node **24** using `.node-version` and `engines`.
If Render has a `NODE_VERSION` environment variable set, it takes precedence:
remove the override or set it to `24`. Do not set `NEXT_BUILD_DIR`; the deployed
build and server must both use the default `.next` directory.

Install development dependencies during the build: TypeScript and its type
definitions are required to compile this app. Do not use `npm run dev` as the
start command.

## Persistent database

SQLite must live on a persistent disk. Render's default filesystem is ephemeral.
Without a disk, orders, receipts, and sessions are lost on restart/redeployment.

- Use a paid service tier supporting persistent disks.
- Mount a disk at `/var/data`.
- Set `DATABASE_PATH=/var/data/voicepay.sqlite`.
- Do not scale beyond one instance.

The disk is available at runtime, not during builds. Do not run migrations or
database-writing setup as a build step. The app creates its tables on first use.
A new deployment starts with a fresh database; your laptop's local database is
not published to GitHub or automatically copied to Render.

## Environment variables

Enter these in **Render → service → Environment**, never in committed files:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` — use the value in `.env.example`.
- `ELEVENLABS_API_KEY` — requires `convai_write` for signed session URLs.
- `ELEVENLABS_AGENT_ID`
- `BUSINESS_PASSWORD` — a strong demo administrator password.
- `MERCHANT_WALLET` — Maple Coffee's public receiving address.
- `MERCHANT_WALLET_BEAN_AND_BREW`
- `MERCHANT_WALLET_LITTLE_OLIVE`
- `MERCHANT_WALLET_CORNER_PIZZA`
- `MERCHANT_WALLET_COPPER_TAP`
- `SOLANA_RPC_URL` — a Solana **devnet** endpoint.
- `DATABASE_PATH=/var/data/voicepay.sqlite`
- `APP_ORIGIN` — optional canonical HTTPS origin, e.g. `https://your-service.onrender.com`.
  Render's `RENDER_EXTERNAL_URL` is used automatically when this is blank.
  For a custom domain, set `APP_ORIGIN` to that domain's exact HTTPS origin
  (no path). This lets same-origin POST requests pass behind Render's TLS proxy
  without trusting arbitrary `X-Forwarded-Host` headers.

Each configured store requires a distinct public wallet address. Blank store
wallets disable checkout for those stores. Never supply private keys or seed
phrases. Do not prefix secrets with `NEXT_PUBLIC_`.

Once Render supplies your HTTPS hostname, update the ElevenLabs agent's allowed
domains if restrictions are enabled. Keep agent authentication on.

## Deployment acceptance checks

1. Check Render deployed the expected branch and latest commit.
2. Open `/customer` on the HTTPS website. The shared demo session opens automatically;
   no sign-in or account-dashboard click is needed before starting voice.
3. Test Gemini text ordering, voice consent, microphone access, mute and stop.
4. Save an order, review the recipient and total, and explicitly confirm it.
5. Connect a dedicated customer Phantom wallet on devnet. Pay with test USDC
   and devnet SOL for fees, then wait for finalized settlement.
6. Open `/business`, sign in with the business password, send the receipt, and
   progress the order. This dashboard does not use Gemini or ElevenLabs.
7. Check `/customer/receipts` and the printable receipt.
8. Redeploy and confirm that order/receipt data persists on the mounted disk.

The app deliberately shares one customer identity and one administrator password.
This is a public **demo**, not production account isolation or real-money service.
Set provider spending limits before sharing it widely.

## If a build fails

Capture the **first failing command and actual error** from Render's build log,
along with its Node version and deployed commit. Successful local request logs
cannot diagnose a remote build failure. Do not share environment values.

Check that Render uses Node 24, installs dev dependencies, builds from the
repository root, and targets the right branch. If those are correct, inspect the
specific error before changing dependencies or build flags.

References: [Next.js on Render](https://render.com/docs/deploy-nextjs-app),
[Node version selection](https://render.com/docs/node-version),
[persistent disks](https://render.com/docs/disks).
