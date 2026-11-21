# Receipt scanning and linking: spec

Status: phases 1 to 3 built locally (not committed). Bulk upload: separate files, optional "Page of above" grouping, "Read all and review later" parks each receipt unreviewed in the inbox (max 25 per batch, stops when the AI limit is hit).
Open items are listed at the end.

## Goal

Scan a receipt (camera, photo, PDF), store everything on it in a receipts database that is shaped for later
analysis, and tie it to a transaction by `receipt_id` only. A receipt either links to an existing transaction
(for example one imported from a card statement), creates a new one, or waits in an inbox.

## What exists today

- `ReceiptFlow` (`src/components/ai/receipt-flow.tsx`): upload, photo or Drive link, then LLM extraction, review, save.
- `parseReceiptAction` / `saveReceiptAction` (`src/app/(app)/ai/actions.ts`): stores the file in the `receipts` bucket, dedupes by sha256, extracts with the `parse_receipt` AI feature.
- Tables `receipts`, `receipt_items`; `transactions.receipt_id`; `txn_source = 'receipt'`.
- Credit card basics on `payment_methods` (limit, statement/due day, opening balance) and `card_payments`.

Behaviour to remove: saving splits one receipt into several transactions, and re-saving deletes and recreates them.

## Principles

1. The receipt is the source of truth for what was bought. The transaction is the source of truth for what the bank charged. They are joined by `transactions.receipt_id`.
2. The transaction never carries receipt detail. `notes` is not touched. The UI reads items, tax and file live from the receipt tables and shows a link.
3. A transaction has at most one receipt and one category. A receipt can link to several transactions (split charges, see below); the usual case is one.
4. Nothing links without the user confirming it.

## Data model

All changes are new migrations; additive only.

### `receipts` (extend)

- `status`: add `inbox` (scanned, unlinked, parked). Existing values stay.
- `payment_method_id` (nullable, composite FK to `payment_methods`): the card detected on the receipt.
- `card_last4` (text, nullable) and `card_brand` (text, nullable): as printed, kept even if no card matched.
- New columns, from the sample receipts:
  - `fees` numeric: delivery/fulfilment/service fees (Kroger delivery adds a fulfilment fee, so items + fees + tax - discounts = total).
  - `tip` numeric and `tip_source` (`printed` | `handwritten` | `none`): the written tip is stored apart from the printed total.
  - `total_paid` numeric: printed total plus tip when a tip is written; `total` stays the printed figure.
  - `order_type` (`in_store` | `delivery` | `pickup` | `online`), `order_number`, `store_address` (text).
  - `label` text: optional free text, prefilled from the file name (e.g. "Antara Gift 1"); shown and searchable in the Items inbox; never written to transaction notes.
  - `person_id` is not added (the "link to a person" idea was declined).
  - `text_source` (`pdf_text` | `vision`): which extraction path produced the data.
- Not stored: membership or loyalty numbers (Costco member, Kroger loyalty #). Only card last 4 is kept; the extraction schema and prompt must exclude them and a post-step strips them from `extracted`.
- Taxes stay as `tax` plus any breakdown inside `extracted`.
- No unique constraint on `transactions (receipt_id)`: several transactions may point at one receipt. Add a plain index (already exists as `transactions_receipt_idx`).

### `receipt_pages` (new)

One row per image or PDF in a receipt, so a receipt can be several photos or one multi-page PDF.
`receipt_id`, `user_id`, `page_no`, `storage_path`, `mime`, `sha256`. Dedup moves from `receipts.sha256` to a hash over the ordered page hashes (or per page; decide at build time). RLS and bucket paths follow the existing `receipts` setup.

### `receipt_items` (keep)

Per-line `raw_name`, `normalized_name`, `item_category`, quantity, unit price, total, and a per-item expense `category`/`subcategory` kept for analysis. `receipt_items.transaction_id` stays but is derived from the receipt's link (null when the receipt links several transactions).

Add: `upc` (Kroger prints one per line, enables cross-store price tracking), `list_price` and `line_discount` (the sample lines are net of coupons: "1 x $5.99, $6.99 each, coupon -$1.00"), `tax_code` (Costco `A`, Patel `F`), `is_weighted` (`1.82 lbs x $1.29 each (approx.)`, `0.72 lb @ $1.49/lb`). Quantity stays `numeric(12,3)`. Sum of `total_price` + `fees` + `tax` - receipt-level discount should equal `total`; the check drives the fallback below.

### `payment_methods` (extend, for the cards upgrade)

- `issuer` (text), `network` (text: visa, mastercard, amex, discover, other).
- `nickname` (text), `color` (a chart token name `c1`..`c8`, not free text).
- `rewards` (jsonb: base rate plus per-category rates), phase-gated, may land later.
- Last 4 digits live in a child table `payment_method_cards (payment_method_id, user_id, last4)` with unique `(user_id, last4)`, so one card can have several (physical card, Apple Pay token, reissue).
- Existing credit card columns (`is_credit_card`, limit, statement/due day, opening balance, tracking_from) are unchanged.

### Categories seed

Add subcategory `Tip` under `Dining & Drinks`, created on demand for existing users when first needed and added to the signup seed for new ones.

## Capture

Phase order: camera and file/PDF upload, then inbox, then bulk upload. Web Share Target and Google Drive folder watch are out of scope for now.

- Inputs: camera (mobile `capture`), image files (JPEG, PNG, WEBP, HEIC), PDF.
- After files are picked, ask: "One receipt or separate receipts?"
  - One receipt: all picked files become pages of a single receipt, order editable.
  - Separate: each file becomes its own receipt.
  - A single PDF is one receipt unless the user chooses otherwise. Bulk drops get a grouping step before parsing.
- Keep the existing Drive-link input only if it is already used; do not extend it.

### Extraction: text first, vision as fallback

Sample set (about 60 receipts from two folders) is mostly PDFs of three kinds, so one path is not enough:

| Kind | Examples | Path |
| --- | --- | --- |
| E-receipt PDF with a text layer | Kroger (2-3 pages), Amazon (2 pages), Ralphs, Walmart order page | Parse the text layer. |
| Phone photo of a paper receipt, wrapped in a one-image PDF | Dewey's, Mr Sushi, Costco, Patel | Vision on the page image. |
| App screenshot | SHEIN (4 pages, no text, no date, no tax) | Vision; a missing date is asked for. |

1. Extract the PDF text layer (`pdftotext`-style, server side). If it holds enough text, send the text (not images) to the model with the receipt schema.
2. Validate: items + fees + tax - discounts must equal the total within 1 cent, and the item count must match "N Items" when printed. Walmart's text layer lists 2 lines against a $77.94 subtotal, so incompleteness does happen.
3. On failure, or when there is no text layer, render pages to images and run vision. Store which path won in `receipts.text_source`.
4. Either way one receipt is one parse against `AI_LIMIT_PARSE`, even if the fallback re-runs internally.

Extraction rules learned from the samples:

- Payment card: read only the last 4 digits, in any of these forms: `Visa 0092`, `DEBIT 2096`, `Visa ending in 4382`, `XXXX4382`, `XXXXXXXXXXX4382`, `Acct ending in 1675`. A receipt with only "Visa" (Patel) gives null last 4 and a card prompt in the link step. Never take the loyalty or membership number (`#0823`) as a card.
- Dates: printed formats vary (`Nov. 9, 2026`, `4/26/26`, `05/03/2026`, `Oct 20, 2025 order`). The file name is not the receipt date (Kroger Nov 9 saved as 11 10, Amazon Apr 27 as 04 29, Walmart Oct 20 as 10 23), so file names are used only for `label`.
- Handwriting: read a handwritten tip and written total (Dewey's: tip 6, total 36 under a printed $30.67). Ignore blank tip lines and suggested-tip tables (Mr Sushi 18/20/25%).
- Net lines: item totals are after line coupons; capture `list_price` and `line_discount` too.
- Obstructions: pen scribbles and creases (Costco) mean low-confidence fields are flagged in review, not guessed.
- Item names: abbreviations (`BNLS/SL BRST`, `KS SV CAB`, `BANANA POLO`) are normalised to generic names for analysis; Kroger's "No Description Found" lines keep the UPC and are flagged.
- Non-store documents in the same folders (e.g. a FedEx invoice) are accepted as receipts with fewer fields.

Size caps stay (10 MB per file today); long receipts may need a total page cap.

## Matching

After extraction, rank existing unlinked transactions as candidates:

- Date window: receipt date +/- 7 days for in-store receipts; +/- 14 days for `online` and `delivery` orders (Amazon charges per shipment, delivery can trail the order by 5 days).
- Amount: transaction amount between the receipt `total` and 130% of it (allows for a tip). When a handwritten tip was read, `total_paid` is the exact target and ranks highest. For online orders, a transaction smaller than the total is also a candidate (see split charges).
- Boosts: same merchant (after normalization/aliases), same card (via last 4), same currency.
- Show the top candidates with a score reason ("same card, same amount"), plus "Create new transaction" and "Park in inbox". Nothing links on its own.
- If no candidates are found, show broader suggestions (same merchant, any amount; same card, nearby dates). If still nothing, the user chooses between creating a transaction and parking the receipt in the inbox.
- A parked receipt can later be linked to any transaction, either from the inbox or from the transaction. When a statement import adds a transaction, run matching against the inbox and suggest links.

## Link and conflict rules

When linking receipt R to existing transaction T:

| Field | Rule |
| --- | --- |
| Date | Receipt date wins automatically; T.date is updated. |
| Amount | Receipt total (tax included) wins; T.amount is updated. If T was higher, prompt for the leftover (see below). If T was lower, the receipt still wins with no prompt. |
| Merchant | Ask the user: use receipt name, keep transaction name, or keep transaction name and save the receipt's as an alias. |
| Currency | Ask the user, showing both amounts. Default highlights the transaction's posted currency. The receipt keeps its own currency regardless. |
| Card | Auto-detected from last 4. T.payment_method_id is set to the detected card. Unknown last 4: ask "add to an existing card" or "create a new card". Ambiguous last 4: ask. |
| Category | Chosen once for T (AI suggests, user confirms). Per-item categories stay on the receipt. |
| Notes | Never touched. |

Split charges (online or delivery orders): one receipt may link several transactions, because Amazon and Walmart charge per shipment.
- In the link step the user can add more candidates; the dialog shows "matched X of Y" against the receipt total.
- In split mode each linked transaction keeps its charged amount (the "receipt amount wins" rule applies only when exactly one transaction is linked). Dates still follow the receipt rule only if the user confirms, since each shipment posts on its own day.
- The receipt stays in the inbox, flagged "partly matched", until the linked amounts equal the total or the user marks it complete. Later statement imports re-suggest the remaining part.
- This is my reading of "one receipt, many transactions" together with "receipt amount is final"; confirm it (open item 6).

Handwritten tip: when the receipt carries a written tip (Dewey's), `receipt.tip` is set and the leftover prompt opens with Tip selected and that amount filled in. The user still confirms or changes it. If the written total plus tip is what the card was charged, that equals `total_paid` and no leftover remains.

Leftover prompt (T.amount > R.total): offer Tip or Fee or tax missing from receipt. Either creates a second transaction with the same date, merchant, card and currency for the leftover. Tip uses subcategory `Tip`; Fee uses a category the user picks. The second transaction has no `receipt_id`. Nothing else is offered (no "keep old amount" escape hatch).

When creating a new transaction from a receipt: amount is the receipt total, date and merchant from the receipt, card from last 4, one category, `source = 'receipt'`, `receipt_id` set.

Unlinking a receipt clears `receipt_id` and moves the receipt to the inbox. It does not revert the transaction fields; the unlink dialog should say so.

## UI

- Receipt flow: capture, grouping question, extraction progress, review (merchant, date, totals, tax, items, card), then match step, then conflict prompts, then confirm.
- Items page: new Inbox tab listing parked receipts (merchant, date, total, card, pages). Actions: link to transaction, create transaction, delete. Bulk upload lands here in phase 3.
- Transaction detail: a Receipt section with the link, item list, tax and file preview, read from the receipt tables. No receipt data in notes.
- Settings > Payments: richer card form (nickname, issuer, network, several last 4s, colour, rewards, existing limit and cycle fields). Card rows show a generic card icon plus an issuer monogram badge. No brand logos. Colour comes from chart tokens.
- Follow the UI style rules in `AGENTS.md`: tokens only, `money` for amounts, hairline rules, no uppercase tracked labels.

## Phases

1. Camera and file/PDF upload: `receipt_pages`, grouping question, text-first extraction with vision fallback, one transaction per receipt on create, matching and link flow (including split charges), conflict and tip prompts, card last 4 plus card form upgrade (needed for detection), `Tip` subcategory, remove split-on-save.
2. Inbox: Inbox tab on Items, park and later link, statement-import match suggestions.
3. Bulk upload: queue of many files, grouping step, parse in sequence, results land in the inbox.

Deferred: Web Share Target (not supported on iOS Safari), Drive folder watch (needs Google OAuth and background sync), rewards-based "best card" analysis.

## Privacy and cost

- Receipt images and extracted text go to the configured AI provider, as they do now. Keep the existing wording of the privacy claims accurate. The text-first path sends text, not images, which also reduces what leaves the app.
- Receipts carry addresses and names; Costco member and Kroger loyalty numbers are stripped before storing. Only card last 4 is kept.
- Every extraction counts against `AI_LIMIT_PARSE`. Multi-page receipts still count as one parse, even when the vision fallback re-runs; bulk upload needs a per-batch cap.
- Storage stays under `<user_id>/` in the `receipts` bucket and is removed by reset/delete (`removeUserReceipts`).

## Open items

Resolved: sample receipts reviewed (see Extraction); split charges allowed and linked transactions keep their charged amounts; handwritten tip pre-fills the prompt; text first with vision fallback; label field kept, person link declined, member/loyalty numbers not stored; undated receipts (screenshots) ask for a date prefilled with the file's modified date; non-store documents (FedEx invoice) are accepted with fewer fields; image redaction (crop, blur) is out of scope, revisit after phase 3.

Proposed defaults, treated as decided unless you object: multi-page dedup uses a per-page sha256 plus a receipt-level hash over the ordered page hashes (a re-upload of the same set is caught, a re-ordered set is not); cap of 10 pages and 20 MB total per receipt; bulk upload capped at 25 receipts per batch.

Matching defaults confirmed as written (+/- 7 days, 14 for online; 130% amount ceiling; no prompt when the transaction is lower; merchant alias option; unknown last 4 asks add-to-existing or create new). "Discover visa" is one Discover card.

Cards (resolved): the app is multi-user, so no card is seeded. The author's own cards (Discover, Chase Freedom, Chase Amazon Prime Visa) are test data, not product defaults; there is no Capital One card. Every user starts with none and the app learns last 4s on first scan: an unknown last 4 asks "add to an existing card or create new". The issuer field is a picker with a short list of common US issuers (Chase, Capital One, Citi, Bank of America, Wells Fargo, American Express, Discover, Barclays, US Bank, Apple Card, other) plus free text, and the monogram badge derives from the issuer or nickname. Network is a fixed list (Visa, Mastercard, Amex, Discover, other). No list of cards is hard-coded anywhere.

Still open: none blocking phase 1. The author's last-4 map (4382, 0092, 9992, 2096 debit, 1675) is only needed to label test fixtures and can be supplied when the test receipts are labelled.

## Test plan

- Unit: matching score and ranking, conflict resolution, leftover split, last 4 detection, page grouping.
- DB (`npm run test:db`): several transactions per receipt allowed, composite FKs, RLS on `receipt_pages` and `payment_method_cards`.
- E2E: scan, link with tip prompt, create new, park then link from inbox, unknown last 4.
- Score extraction against hand-labelled sample receipts with the existing receipt score harness (`src/lib/ai/receipt-score.ts`). Keep the labels, not the files, in the repo: the receipts are personal. Cover at least one of each: Kroger delivery with fee and coupons, Kroger in-store, Amazon multi-shipment, Walmart with an incomplete text layer (forces fallback), Dewey's handwritten tip, Mr Sushi blank tip plus suggestion table, Costco photo with pen scribble, Patel with no last 4, SHEIN screenshot with no date.
- Unit: text-layer validation (items + fees + tax - discounts = total), card last-4 pattern list, loyalty number stripping.
