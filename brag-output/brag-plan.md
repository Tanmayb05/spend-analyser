# /brag-slim plan: Spend Analyser

**What:** a personal finance app that turns an expense spreadsheet into a calm, readable dashboard. Open source (MIT), self-host on Vercel + Supabase.
**For:** people who already track spending in a spreadsheet and never look at it again.
**Sets it apart:** imports the tracker as-is, then answers plain questions: when did the money leave, where did it go, where is the month heading.
**Angle:** the spreadsheet you keep becomes something you actually read.
**Hook:** a dense spreadsheet scrolling past, with one line over it: "Your money lives in a spreadsheet."
**Highlights:** (1) the transaction calendar filling in day by day, (2) the "Where did the money go?" sankey drawing income into categories and merchants, (3) the month-pace projection.
**Punchline/outro:** Spend Analyser · open source · github link.
**Share caption:** see share-copy.txt.

**Tone:** default, kept calm to match the app's ledger look. Soft transitions, staggered (old out, then new in), never crossfading busy layouts.
**Visual identity:** the app's own dark tokens. bg #161412, surface #1e1b18, text #e8e2d6, muted #a9a193, accent #7aa5ff, good #4fb97a. Bricolage Grotesque 500 for headlines (the app's `.card-title`), Geist for text, Geist Mono for figures. Hairline rules, no glows.
**Source of UI:** real app screens captured from the local dev server (2x), logged in as the local fictional demo user (`scripts/seed-test-user.sh` data: Maple Court Apartments, Acme Corp Payroll, etc.). No real user data. Cells and flows are animated by masking the real captures. Spreadsheet rows in the hook are rows from the same fictional demo account.

**Format:** 1920×1080, 30fps, 21.0s (630 frames).
**Music:** 120 BPM (beat 0.5s, bar 2s), D minor / F major (Dm, Bb, F, C). Every cut on a beat.

| # | Time | Beats | Scene | On screen text |
|---|---|---|---|---|
| 1 | 0.0–3.0 | 0–6 | Hook: spreadsheet rows scroll and fill | "Your money lives in a spreadsheet." |
| 2 | 3.0–7.0 | 6–14 | Reveal: logo lockup, Financial summary card, four figures land on beats 9, 10, 11, 12 | "Import the spreadsheet. Read the month." |
| 3 | 7.0–11.0 | 14–22 | Calendar: October's day cells pop in one by one | "See when the money left" / "Every day, colour-coded" |
| 4 | 11.0–15.0 | 22–30 | Sankey wipes in: income → categories → merchants | "And where it went" |
| 5 | 15.0–18.0 | 30–36 | Month pace: projection line draws | "Know where the month is heading" |
| 6 | 18.0–21.0 | 36–42 | Outro lockup | Spend Analyser / "Open source. Self-host on Vercel + Supabase." / github.com/Tanmayb05/spend-analyser |

Sound: soft kick on beats from bar 2, off-beat hats low in the mix, bass on roots, pad chords per bar, plucks in key on the four KPI landings and the outro; a quiet filtered-noise swell into each cut. Final chord rings out.


## Cut 2 (current brag.mp4): feature-led, 25.0 s, 750 frames

Priorities from the user: AI entry (voice/text/receipt) and Ask your data are major; credit cards and trips are minor.
AI outputs are real: Claude (the dev server's configured provider) on the fictional demo account; nothing was saved.
Ask answer verified against the database (12 Amazon expenses $939.92, one $34.99 return, net $904.93 across 13).
Display fix: the Ask card prints the model's markdown literally (`**$904.93**`); the capture strips `**` so the frame reads as a fixed app would.

| # | Time | Scene | Text |
|---|---|---|---|
| 1 | 0.0-2.5 | Hook: spreadsheet | "Your money lives in a spreadsheet." |
| 2 | 2.5-4.5 | Reveal lockup | "Spend Analyser" / "Your spending, in plain words" |
| 3 | 4.5-9.0 | Describe it: real typing frames, real parse into two entries | "Type it or say it" / "One sentence, two entries" |
| 4 | 9.0-11.5 | Receipt fixture scanned, real parsed fields | "Or snap the receipt" |
| 5 | 11.5-16.0 | Ask your data: question types, real answer | "Then ask your data" |
| 6 | 16.0-18.5 | Sankey wipe | "See where it went" |
| 7 | 18.5-20.5 | Trip stamps (no companion names shown) | "Trips, kept apart" / "$8,990 across 8 trips" |
| 8 | 20.5-22.5 | Credit card faces | "Your credit cards, limits and bills" |
| 9 | 22.5-25.0 | Outro | name, open source line, repo |

Music: same 120 BPM D minor -> F, 25 s; plucks land on the parsed entries (7.0/7.25/7.5), receipt (10.0), answer (13.5/14.0), stamps, outro.
