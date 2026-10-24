# Five-store devnet demo

All businesses are fictional. All verification is **simulated**, not KYC/KYB.
There is no real brand affiliation, merchant identity checking, alcohol sale,
inventory reservation, kitchen integration or order fulfilment.

## What the original implementation does

The original app was a payment-collection prototype for one business:

1. A password-protected business workspace drafts invoices manually or with Gemini.
2. A person saves, reviews and issues the invoice.
3. The business shares the payment link or QR code with the customer.
4. The customer connects Phantom and signs a devnet USDC transaction.
5. The backend verifies finalized Solana evidence and matches it to the invoice.
6. A printable invoice becomes a payment receipt after successful matching.

It does **not** automatically email invoices or receipts. Links are shared
manually, and documents can be printed/saved as PDF. The original customer
storefront also supported a single fixed catalog and voice/text cart proposals.
Neither Gemini nor ElevenLabs holds signing keys.

## What is different now

`/customer` is the single shared **Alex Demo** account. `/customer/shop` presents
exactly five searchable stores with separate menus and wallet settings. `/order`
is a compatibility alias that also requires entering the customer account.
Search names, areas, categories or menu items, or use a direct store link:

| Store | Type | Simulated area | Receiving public-address setting | Direct link |
|---|---|---|---|---|
| Maple Coffee | Coffee shop | Oxford Circus | `MERCHANT_WALLET` (existing setting) | `/order?store=maple-coffee` |
| Bean and Brew | Coffee shop | Soho | `MERCHANT_WALLET_BEAN_AND_BREW` | `/order?store=bean-and-brew` |
| Little Olive | Restaurant | Soho | `MERCHANT_WALLET_LITTLE_OLIVE` | `/order?store=little-olive` |
| Corner Pizza | Restaurant | Fitzrovia | `MERCHANT_WALLET_CORNER_PIZZA` | `/order?store=corner-pizza` |
| Copper Tap | Bar | Marylebone | `MERCHANT_WALLET_COPPER_TAP` | `/order?store=copper-tap` |

Copper Tap's demo menu is alcohol-free. Geographic labels are illustrative:
there is no GPS lookup or actual store-location verification.

## Configure the five receiving wallets

Keep the existing `MERCHANT_WALLET` for Maple Coffee. Add the four other public
addresses in your local `.env.local`:

```dotenv
MERCHANT_WALLET=
MERCHANT_WALLET_BEAN_AND_BREW=
MERCHANT_WALLET_LITTLE_OLIVE=
MERCHANT_WALLET_CORNER_PIZZA=
MERCHANT_WALLET_COPPER_TAP=
```

Do not blank an existing value when adding the others. Each store needs a
**different regular Solana wallet public address**, not a token-account address,
private key or seed phrase. The receiving wallet's private key stays with its
owner; it is not needed by VoicePay. Address syntax cannot determine the network;
the application checks the connected RPC's genesis hash to enforce devnet.

Restart `npm run dev` after configuration changes. Blank, malformed, off-curve,
or duplicate addresses disable checkout for the affected stores. Stores remain
browsable. There are no generated placeholder recipients and no fallback that
sends another store's payments to Maple Coffee.

Customers need a separate test wallet funded with devnet USDC and devnet SOL.
The customer pays transaction fees and token-account creation if needed.

## Order and invoice routing

- Each customer order must specify a registered `merchantId`.
- The server checks menu membership and prices; supplied prices, names or
  receiving addresses cannot override the catalog or wallet registry.
- One merchant per cart. Switching stores clears the previous cart and review
  approval. Late assistant replies cannot overwrite a manually changed cart.
- Named-store voice/text proposals include `merchantId` and a full proposed cart.
- A spoken proposal does not authorize payment. The user still reviews checkout
  and signs through Phantom. Voice-driven delegated spending is not implemented.
- New invoices store merchant ID, name and area. Issuance freezes the receiving
  address; checkout and matching use that invoice snapshot, not the latest env.
- Existing issued invoices without merchant metadata keep their original wallet
  and are labelled "Legacy Demo Studio". No payment data is migrated or rerouted.
- Existing legacy drafts default to Maple Coffee when next saved/issued.

`/business` is a password-protected business endpoint with five separate
store dashboards. One demo administrator password intentionally grants access
to all five. Queries and processing actions check the selected store; this is
not five independent production identities. There is **no AI on the business
side**. Only paid orders appear. The business sends a persisted receipt to
the customer's VoicePay inbox, then starts preparing and marks ready/collected.

## Demonstration script

1. Enter `/customer`, then open `/customer/shop` and search "Soho", "pizza",
   "bar", or "Maple Oxford".
2. Browse Maple Coffee and say/type:
   "Two black coffees and one latte from Maple Coffee in Oxford Circus."
   Expected catalog total: **10.00 test USDC**.
3. Say “Place my order” or click Place order for confirmation. Review the saved
   internal order's store, items, amount and receiving wallet.
4. Explicitly confirm, then open wallet checkout and sign in Phantom.
5. Wait for finalized matching. In `/business`, select the receiving store,
   send the receipt to the customer account, then start preparation. In
   `/customer`, check the receipt inbox and order status.
6. Try "one margherita from Corner Pizza": expect **10.00 test USDC** and a
   different receiving wallet, even though the amount equals the coffee order.
7. Clear one store's wallet setting and restart. It must remain discoverable but
   not allow checkout. Never substitute another business's address.

Only update the ElevenLabs system prompt/knowledge base to describe these
fictional stores; the `customer_request(message)` tool itself is unchanged.
Do not keep an old hard-coded "Demo Studio services" catalog in the agent's
knowledge base. The backend's directory and menus are authoritative.

## Validation

Unit tests cover five-store discovery, catalog isolation and unique-wallet rules.
Browser tests use temporary SQLite, ephemeral fixture wallets and a local RPC to
check separate recipients, signed transactions, finalized matching, receipts,
missing-wallet blocking and voice/text store switching. This is not evidence of
live devnet transfers, real KYB, live speech quality or real merchant fulfilment.
