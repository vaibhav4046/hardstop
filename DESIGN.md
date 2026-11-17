# HARDSTOP design

This describes the web app in `web/` as built. Tokens live in
`web/src/app/globals.css`; nothing here is aspirational.

## Brand idea

A hard stop is a physical thing: the block a mechanism cannot travel past.
The interface is a counter where an agent hands over a request and the vault
hands back a printed slip, stamped PAID or BLOCKED. It should feel like a
bank ledger and a till roll, not a crypto dashboard.

Three devices carry that, and nothing else is decorative:

1. **The slip.** Every verdict is a receipt on lighter paper with a torn
   lower edge, dashed and dotted rules, and a stamp.
2. **The full stop.** The wordmark ends in a square full stop in the stop
   colour. The same block closes the "spent today" gauge: the fill runs
   toward it and cannot pass it.
3. **Clarendon.** Headlines and money figures are set in Besley, a Clarendon
   revival: the letterform of cheques, ledgers and bank notes.

The page is light only. There is no dark theme.

## Type

Loaded with `next/font/google`, self-hosted at build time.

| Role | Face | Use |
|---|---|---|
| Display | Besley 600 to 800 | h1 to h3, money figures, stamps, wordmark |
| Text and UI | Schibsted Grotesk 400 to 700 | everything else |
| Technical | IBM Plex Mono 400 | only inside "Technical details", code blocks and inline code names |

Scale (rem): 0.8125, 0.875, 1, 1.125, 1.3125, 1.5, 2.25, 3. The home
headline is fluid, `clamp(2.25rem, 1.35rem + 4.4vw, 4.5rem)`; page titles
`clamp(2rem, 1.5rem + 2.4vw, 3rem)`.

Headings: line-height 1.02 to 1.15, letter-spacing -0.012em to -0.022em,
`text-wrap: balance`. Body: 1rem at 1.55, measure capped at 38 to 40rem.
Labels are sentence case; the only capitals are the stamps and the wordmark.

## Colour

| Token | Hex | Meaning |
|---|---|---|
| `--color-paper` | `#efe9dc` | page |
| `--color-slip` | `#fbf8f1` | receipts, inputs, notices |
| `--color-ink` | `#1e1a15` | text, rules, primary button |
| `--color-ink-soft` | `#5b5346` | secondary text, hints |
| `--color-rule` | `#c9bfab` | hairlines (decorative, not relied on) |
| `--color-edge` | `#8c8271` | boundaries of unselected controls |
| `--color-stop` | `#c2310e` | refused: blocked or rejected by the vault, paused by the owner, or input the form will not send |
| `--color-paid` | `#1b6340` | paid; used only on the PAID stamp |
| `--color-cool` | `#7a4e00` | scheduled or cooling |
| `--color-cool-wash` | `#f3dfa8` | background of the "Scheduled" panel |

Contrast ratios (WCAG 2 relative luminance, computed with a script on
2026-11-17; AA needs 4.5 for text and 3 for control boundaries):

| Foreground on background | Ratio |
|---|---|
| ink on paper | 14.30 |
| ink on slip | 16.31 |
| ink-soft on paper | 6.27 |
| ink-soft on slip | 7.15 |
| paper on ink (primary button) | 14.30 |
| stop on paper | 4.64 |
| stop on slip | 5.29 |
| white on stop (pause button, hover) | 5.62 |
| paid on slip | 6.81 |
| cool on paper | 5.95 |
| cool on cool-wash | 5.46 |
| ink on cool-wash | 13.13 |
| edge on paper (non-text) | 3.13 |
| edge on slip (non-text) | 3.57 |

Stop on cool-wash is 4.26 and is never used. `--color-rule` on paper is 1.51;
it only draws separators that carry no meaning on their own.

Colour never carries a verdict alone: stamps and tags always have the word.

## Spacing

Tailwind's 4px steps for small gaps, plus five named distances that are
deliberately uneven, tight inside a thought and wide between thoughts:

| Token | Value |
|---|---|
| `--gap-hair` | 0.375rem (label to field) |
| `--gap-line` | 0.75rem (paragraph to paragraph) |
| `--gap-block` | 1.75rem |
| `--gap-part` | clamp(2.5rem, 1.75rem + 3vw, 4.25rem) |
| `--gap-section` | clamp(3.75rem, 2.5rem + 6vw, 7.5rem) |
| `--gutter` | clamp(1rem, 0.25rem + 3.6vw, 2.75rem) |

Content width 74rem. Layouts are two unequal columns (7:5, 5:7, 4:8), left
aligned. Sections are separated by a 1px ink rule or by space, not by cards.
Radius is 4px on controls and 0 on everything else.

## Motion

Only two things move, and only in answer to an action:

- a new slip prints: 320ms, `translateY(-0.875rem)` and opacity, ease-out-expo;
- its stamp lands: 240ms, scale 1.7 to 1 and opacity, 160ms later.

The gauge fill eases over 300ms (`transform: scaleX`). Buttons change colour
in 120ms. Nothing animates on load or on scroll, and nothing moves while a
request is being decided. Under `prefers-reduced-motion: reduce` all
animation and transition is off.

## Components and states

- **Button** (`.btn`): outlined ink; hover fills with slip; active moves 1px;
  disabled is grey-outlined with `not-allowed`. `.btn-primary` is solid ink,
  black on hover. `.btn-stop` (pause only) is stop-outlined and fills on
  hover. `.btn-quiet` is an underlined text button. Minimum height 46px.
- **Field** (`.field`, `.input`, `MoneyField`): visible label above, hint
  below, 1.5px ink border on slip. Invalid: 2px stop border, `aria-invalid`,
  message linked with `aria-describedby`. Money fields show a `$` that is not
  part of the value and use `inputmode="decimal"`.
- **Choice** (`.choice`): a whole-row radio; selected gets an ink border and
  a 4px ink bar on the left.
- **Slip** (`Slip`): stamp (Paid / Blocked / Rejected / Not sent), amount,
  the contract's sentence, rows for recipient, what is left today and the
  practice clock, then a collapsed "Technical details" with reason code and
  name, request number, gas used and addresses. Owner actions and clock skips
  print as one grey line with a left rule instead of a slip.
- **Gauge**: spent share of today's limit, ending in the stop block;
  `role="meter"` with a text value.
- **Scheduled panel**: amber wash and bar, the time it takes effect, the
  rules that will apply, and a Cancel button. Read from the contract's
  queue.
- **Disclosure** (`details.disclosure`): plus and minus markers, 48px
  summary.
- **Vault states**: starting ("Starting your practice vault…"), none
  (example vault or own rules), ready, error (retry, or discard the saved
  vault). The home example has its own starting and failed states.

## Error language

Errors say what happened and what to do, without apology and without
jargon. Examples in the app: "One payment cannot be larger than the whole
day's limit." "The vault only holds $16.00." "The practice vault could not
start. Check your connection and try again." A contract revert that is not a
rule refusal is shown as "Not sent", with the revert name under Technical
details. Invalid input never reaches the contract.

Words kept out of primary copy: EVM, ABI, gas, nonce, hash, smart contract.
They appear only inside collapsed "Technical details" and on `/developers`.
The app never says "guarantee".

## Mobile

One column below 1024px. On `/activity` the order is balance and today's
gauge, the agent's buttons, receipts, then worst case, rules, clock and owner
controls. Buttons go full width in narrow columns. Tables and code blocks
scroll inside their own box. Checked at 320px: no horizontal overflow on any
of the five routes, and every button, summary, input and standalone link is
at least 44px tall.

## Accessibility conventions

- Landmarks: skip link, practice-mode `aside`, `header`, `nav`, `main`,
  `footer`. One `h1` per page; slips are `article`s with a hidden `h3`.
- Every verdict and owner action is announced through one
  `role="status" aria-live="polite"` region per surface.
- Focus: 3px ink outline, 3px offset, on `:focus-visible`. After validation
  fails focus moves to the error summary; on the review step it moves to the
  review heading.
- All controls are native elements (`button`, `a`, `input`, `select`,
  `details`), so everything works from the keyboard.
- Times are always written out with the date; amounts always with `$` and
  two decimals.

## Honesty rules the design enforces

- A practice-mode strip is the first thing on every page.
- The receipts list is built only from what the visitor did in this session.
- Every Paid, Blocked and Rejected is the contract's answer. The page never
  works out a verdict. The one piece of arithmetic it repeats is display
  only: which fixed day the practice clock is in, to label "spent today" and
  the reset time (`today()` in `web/src/lib/session.ts`).
