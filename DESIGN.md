# HARDSTOP design

This describes the web app in `web/` as built. Tokens live in
`web/src/app/globals.css`, the parts in `web/src/app/styles/pieces.css`, and
the home page in `web/src/app/styles/home.css`. Nothing here is aspirational.

The visual direction (near-black page, serif display type over a sans, one
gold accent, pill buttons, glass top bar, product cards beside numbered
steps) was requested by the project owner with xade.xyz as the visual
reference. No assets, copy, logo, typeface files, data or code from that site
are used: every word, figure, component and the hero picture are HARDSTOP's
own.

## Brand idea

A hard stop is a physical thing: the block a mechanism cannot travel past.
The interface is a dark vault room. An agent hands a request to the vault and
the vault hands back a receipt labelled PAID or BLOCKED. Three devices carry
that:

1. **The receipt.** Every verdict is a card with a label, the amount, the
   contract's sentence, and the facts under it.
2. **The mark and the stop.** The mark is the owner's logo, redrawn as
   vectors (`web/src/components/logo.tsx`): a gold ring split in two, two
   smaller arcs inside it, and a blade laid across the cut, all in one gold
   gradient. In the top bar and footer it sits left of the name "HARDSTOP",
   set in Outfit 500 with 0.04em tracking (the free face nearest the
   geometric sans the owner pointed to on hydradb.com). On hover the split
   ring turns half a turn, which brings it back to the same drawing. Brand
   files: `brand/hardstop-mark.svg` (vector, any size),
   `brand/hardstop-mark-4096.png` (transparent) and
   `brand/hardstop-mark-on-black-4096.png`, and
   `brand/hardstop-lockup-on-black.png` (mark and name, 4167px wide). The
   site icon (`web/src/app/icon.svg`) is the mark on a dark rounded tile.
   The "spent today" gauge ends in a neutral tick for the day's limit,
   which turns the red of the refusal colour only once the limit is
   reached. The red square marks a refused receipt and "Never" on the
   permissions card.
3. **The door.** The home hero is a vault door with a bar across it, drawn
   in dithered gold dots, and moving where the browser has a graphics card.

The page is dark only. There is no light theme; `color-scheme: dark` makes
the browser's own controls (select lists, scrollbars) match.

## Type

Loaded with `next/font/google`, self-hosted at build time (the site's
Content-Security-Policy allows fonts from its own origin only).

| Role | Face | Use |
|---|---|---|
| Display | Instrument Serif 400 | h1 to h3, legends, money figures |
| Text and UI | Outfit 400 to 600 | everything else, including receipt labels |
| Technical | IBM Plex Mono 400 | only inside "Technical details", code blocks and inline code names |

Instrument Serif has one weight, so display type is never bold; hierarchy
comes from size.

| Class | Size | Notes |
|---|---|---|
| `.hero-title` | `clamp(2.5rem, 1.5rem + 4.6vw, 4.875rem)` (40 to 78px) | line-height 1, two lines |
| `.page-title` | `clamp(2.25rem, 1.6rem + 2.8vw, 3.6875rem)` (36 to 59px) | h1 of the other four routes |
| `.section-title` | `clamp(2rem, 1.5rem + 2.2vw, 3.25rem)` (32 to 52px) | h2 |
| `.step-title` | `clamp(1.875rem, 1.5rem + 1.4vw, 2.625rem)` | h3 of a home step |
| `.sub-title` | 1.75rem | card headings, legends |
| `.figure` | `clamp(2.75rem, 2.2rem + 2.2vw, 3.75rem)` | a sum of money, large |
| body | 1rem, line-height 1.6 | `.lede` and step text 1.125 to 1.25rem |
| small | 0.875rem; receipt labels and code 0.8125rem | |

Headings: letter-spacing -0.01em, `text-wrap: balance`. Two-line headlines
use `.lines` (each `span` is a line). Measure is capped at 30 to 40rem.
Labels are sentence case. The only capitals are the eyebrows over sections ("BUILT WITH", "THE PROBLEM") and the label on
a receipt (PAID, BLOCKED, REJECTED), where the owner asked for them.

## Colour

| Token | Value | Meaning |
|---|---|---|
| `--color-page` | `#0c0c0e` | the page |
| `--color-ink` | `#ffffff` | text, primary button |
| `--color-ink-soft` | white at 68% | secondary text, hints |
| `--color-surface` | white at 3% | cards |
| `--color-raised` | white at 5.5% | receipts, notices |
| `--color-rule` | white at 9% | card borders and hairlines (decorative) |
| `--color-edge` | white at 42% | boundaries of inputs and choices |
| `--color-gold` | `rgb(227 176 75)` | brand accent, numbers worth noticing, focus ring |
| `--color-cool` | `rgb(227 176 75)` | scheduled or waiting; always with the word and a clock mark |
| `--color-stop` | `rgb(248 113 113)` | refused: blocked or rejected by the vault, paused, "Never", invalid input, and the stop square |
| `--color-paid` | `rgb(124 214 166)` | paid; only on a PAID label and that receipt's border |

Colour never carries a meaning alone. A verdict has its word and a shape (a
dot for paid, a square for refused); "Scheduled" has its word and a clock
face with a quarter filled; "Allowed" is an open ring and "Never" a square.

Contrast ratios (WCAG 2 relative luminance, computed with a script on
2026-11-17; translucent colours were composited over what is under them
first. AA needs 4.5 for text and 3 for large text and control boundaries):

| Foreground on background | Composited | Ratio |
|---|---|---|
| ink on page | #ffffff on #0c0c0e | 19.54 |
| ink on raised (receipt) | #ffffff on #19191b | 17.49 |
| ink-soft on page | #b1b1b2 on #0c0c0e | 9.14 |
| ink-soft on surface (card) | #b4b4b4 on #131315 | 8.89 |
| ink-soft on raised (receipt) | #b6b6b6 on #19191b | 8.58 |
| ink-soft on a live card | #b5b5b5 on #171719 | 8.72 |
| ink-soft on the waiting panel | #bbb9b7 on #29251f | 7.76 |
| bullet text (86% white) on surface | #dedede on #131315 | 13.76 |
| chip text (82% white) on page | #d3d3d4 on #0c0c0e | 13.09 |
| disabled button text (50% white) on its fill | #8e8e8f on #1e1e20 | 5.12 |
| gold on page | #e3b04b on #0c0c0e | 9.84 |
| gold on a live card | #e3b04b on #171719 | 9.02 |
| gold on the waiting panel | #e3b04b on #29251f | 7.63 |
| stop on page | #f87171 on #0c0c0e | 7.07 |
| stop on a live card | #f87171 on #171719 | 6.48 |
| stop on its label fill (receipt) | #f87171 on #302224 | 5.50 |
| stop on the pause button's fill | #f87171 on #291e20 | 5.83 |
| page on stop (pause button, hover) | #0c0c0e on #f87171 | 7.07 |
| paid on its label fill (receipt) | #7cd6a6 on #232c29 | 8.19 |
| page on gold plate (primary button), darkest stop | #0c0c0e on #b98528 | 6.00 |
| page on gold plate (primary button, hover), darkest stop | #0c0c0e on #c48f30 | 6.81 |
| 50% white on a disabled button (any kind) | #898989 on #131313 | 5.31 |
| hero gold line, darkest stop, on page | #c8902f on #0c0c0e | 6.97 |
| edge on page (non-text) | #727273 on #0c0c0e | 4.07 |
| edge on a live card (non-text) | #78787a on #171719 | 4.09 |
| focus ring on page (non-text) | #e3b04b on #0c0c0e | 9.84 |

`--color-rule` on the page is 1.23. It only draws card edges and separators
that carry no meaning on their own; anything a person has to find (an input,
a radio row) uses `--color-edge`.

## The finish: glass and gold plate

Asked for by the owner, with Apple's metallic product pages as the reference
for the feel (nothing taken from them). It is one file,
`web/src/app/styles/finish.css`, unlayered so it sits on top of the plain
styles; removing it gives the flat look back.

- **Cards are glass.** A lit surface (lighter at the top left, warm gold at
  the far corner), light along the top edge, a reflection band across the
  panel, a 1px rim that is gold where the light catches it, and a deep
  shadow. Painted once with gradients and shadows; no backdrop blur and no
  frame loop.
- **The main button is gold plate.** A polished gradient like the mark, an
  inner highlight and a darker lower lip, a gold glow under it, and on hover a
  light that sweeps across the metal once. Text is the page colour.
- **Other buttons are glass with a gold edge.** Pause keeps the refusal red,
  as glass. A disabled button of any kind is flat and dim.
- **The headline's second line** ("It cannot raise the limit.") is set in
  polished gold. In a forced-colours (high contrast) mode it falls back to
  plain text.

## Surfaces and spacing

- **Card** (`.card`): white at 3%, 1px `--color-rule` border, radius 24px,
  padding `clamp(1.25rem, 1rem + 1.2vw, 2rem)`.
- **Live card** (`.card-live`): a card that holds a working part of the
  product. White at 4.5%, an inner top highlight and a deep soft shadow lift
  it off the page. The fill is flat, not a gradient, so that axe can measure
  the contrast of everything on it.
- **Tile** (`.tile`): a darker inset inside a card, radius 16px.
  `.tile-waiting` and `.scheduled` are the gold-tinted waiting panels.
- **Receipt** (`.slip`): radius 20px on the raised colour.
- Inputs are 14px, radio rows 16px, buttons and labels full pills. The radii
  step down with nesting on purpose.

Named distances: `--gap-hair` 0.375rem, `--gap-line` 0.75rem,
`--gap-part` `clamp(2rem, 1.5rem + 2vw, 3rem)`, `--gap-section`
`clamp(4.5rem, 3rem + 7vw, 9rem)`, `--gutter`
`clamp(1rem, 0.25rem + 3.6vw, 2.75rem)`. Content width 76rem, left aligned.

## Frame

- **Practice notice**: a slim band at the very top of every page, "Practice
  mode." in gold, in normal flow.
- **Top bar** (`.topbar`): 76px, `rgb(12 12 13 / 0.72)` with
  `backdrop-filter: blur(18px)` and a hairline under it; the mark and the name "HARDSTOP" left (the
  link is named "HARDSTOP home"), links and the white "Protect my AI" pill
  right. From 56rem up it is sticky. `scroll-padding-top` keeps anything
  focused or jumped to clear of it.
- **Footer**: the mark and name, the unaudited / practice-only line, and links to How
  it works, Developers, GitHub and the licence.
- **Built with** (home, under the hero): the real logos of what HARDSTOP is
  made with and runs on, each with its name under it: Fe (the contract),
  Ethereum Sepolia and Base Sepolia (the test networks), MetaMask (standing
  for any browser wallet; the connection is the standard one), Next.js and
  Vercel (the site). Grey until passed over, then each takes its own colour.
  Sources: Fe's own logo file from fe-lang.org; Ethereum, Next.js and Vercel
  from Simple Icons; Base and MetaMask from web3icons. They are facts about
  the project, not endorsements, and the component says so.
- **Connect your AI** (home, after the three steps; `connect-ai.tsx`): what
  installing HARDSTOP in an assistant does (it pays only through your vault
  and cannot raise its own limit), the logos of the assistants it works with
  (Claude, ChatGPT, Cursor, VS Code + Copilot, Windsurf, Hermes, Python), one
  install line with a Copy button (announced in a polite live region; the
  line scrolls inside its own box on a phone and can be reached by keyboard),
  and a link to `web/mcp/README.md` for the rest. "Works with" wording only;
  the section says none of the makers has reviewed or endorses HARDSTOP. The
  install line is one constant, `INSTALL_COMMAND`, at the top of the file.
  Logos are self-hosted in `web/public/logos/` as light-filled SVGs: Claude,
  Cursor, GitHub Copilot, Windsurf and Python from Simple Icons (CC0 icon
  data); OpenAI and Hermes (the Nous Research mark) from LobeHub icons (MIT).
  Neither set has a VS Code logo, so that entry shows GitHub Copilot.
- **Connect your AI on a vault** (`/activity`, only for a vault on a test
  network; `vault-connect.tsx`): this vault's setup for Claude Code, Claude
  Desktop, Cursor and VS Code, and the owner's 24/7 watcher, filled in with
  its address, chain and agent key, one at a time behind a switch, each with
  a Copy button and a polite announcement. The forms are those in
  `web/mcp/clients/*`. The agent key is masked (`0x••••••••`) in what is
  shown and is in the page only while "Show agent key" is open, with a
  sentence saying it is the agent's test-network key, never the owner's, and
  what holding it allows. Copy always copies the complete setup. VS Code keeps
  its own masked prompt for the key; the watcher takes no key.
- **Icons and link previews**: `web/src/app/icon.svg` (vector, the mark on a
  dark tile) is what browsers show. `favicon.ico` (16, 32, 48px) and
  `apple-icon.png` (180px) are rendered from that vector for browsers and
  home screens that only take pixels, and `opengraph-image.png` (1200x630, the
  mark and the headline) is the picture in link previews, which also only
  take pixels. `metadataBase` makes its URL absolute.

## The hero backdrop

`web/src/components/hero-backdrop.tsx` draws the picture on a `<canvas>`;
there is no image file. A brightness function describes a vault door from a
few circles and lines (collar, lit rim, bolts, a four-spoke wheel, machined
rings) with a bar lying across it and on past its right edge. Each cell of a
4px grid is lit when that brightness beats an 8x8 Bayer threshold, which
gives ordered dithering in one gold and one lighter gold. It is drawn once
and again when the canvas changes size (about 63,000 cells for a 1440 by
704px hero), and does not run a frame loop.

The canvas is `aria-hidden`. From 72rem up it lies behind the copy: the copy
is held to the left 58% of the hero at every width and text size, a mask
removes the picture from the left 46% and fades it in by 72%, and a scrim in
the page colour (solid to 50%, 90% at 58%) sits between the picture and the
text. Measured on 2026-11-17 by hiding the copy and reading the brightest
pixel behind where it sits, at 1152, 1280, 1440 and 1920px and at 1280px with
125% text: secondary text is at least 8.36:1 and white at least 17.93:1.
axe cannot judge text over a canvas and reports those nodes as undecided, so
that measurement is the evidence. Below 72rem the picture is a 240px band
under the copy (272px since the moving door was added) and no text overlaps it. It is drawn once and fades in over
900ms; with reduced motion it is simply there. On a wide screen a glow runs
along the bar (see Motion). It starts right of the door's centre line, at
60% of the hero's width or further right, so it is never behind the copy.

### The moving door

Once the page is idle, `hero-backdrop.tsx` loads `vault-scene.ts` (three.js,
in its own chunk) and, if it starts, lays a second canvas over the still
picture and fades it in over 600ms. Where motion is allowed the still picture waits 1.6s before it shows, and the moving door is asked for within 0.6s, so normally only one door is ever seen; without WebGL the still one then fades in as before. The door underneath is a lit 3D model (lathe-turned rim, face, fourteen
bolts, a four-spoke wheel, the bar and its bracket), built in code; nothing
is fetched. Each frame it is rendered at one pixel per 4px cell, and a
second pass turns each pixel's brightness into a gold dot with the same 8x8
Bayer threshold, so it is the same dot drawing as the still one, moving.
It starts in the still picture's exact place, size and pose (door square on,
bar home; the same radius formula and the same masks), so it never jumps,
and it has no opening move: it appears where it stays. A slow sway eases in
from nothing over four seconds; otherwise it leans toward the mouse, and
turns, rises and spins its wheel as the hero scrolls away. (A first version
swung the door shut and slid the bar in on arrival; the owner saw that as
the picture changing position, so it was removed.)

It is not loaded under reduced motion, and the browser is asked for a
graphics context that refuses a software-only path
(`failIfMajorPerformanceCaveat`), so a machine without a graphics card keeps
the still picture. After the opening it draws at most 30 frames a second,
and none while the hero is off screen or the tab is hidden. If the graphics
context is lost, the still picture comes back.

## Motion

- Hover and focus states: 150ms on colour, background and border. Buttons
  scale to 0.98 while pressed.
- A new receipt prints: 320ms, `translateY(-0.75rem)`, ease-out-expo, at full
  opacity. Its label lands 160ms later over 240ms by scale alone. A verdict
  is never faded in: it has full contrast from its first frame.
- The gauge fill eases over 300ms (`transform: scaleX`).
- Home sections marked `.reveal` fade and rise 16px over 450ms as they are
  scrolled to. `ScrollReveal` only hides a section that is still below the
  screen at the moment the visitor first scrolls with a wheel or a finger, so
  a page that is read, printed or captured without scrolling shows
  everything.
  The working panel in a revealed section follows its text 80ms behind, and
  a gold rule draws out from each step's number.
- The hero backdrop fades in once. On a wide screen a glow crosses the bar
  every 5.2s. The glow is a strip of CSS laid over the bar's bright dots and
  cut to the same 4px dot grid, with a soft light sliding through it
  (`transform` only); the canvas itself is never redrawn. A first version
  redrew the canvas many times a second, and measured a whole processor core
  for an idle home page in a browser without a graphics card; this version
  measures 5% (see `EVIDENCE_LOG.md`).
- The first lines of each page are wiped in from below over 700ms
  (`clip-path` and `translateY`, staggered 90ms). Never by opacity: text has
  full contrast in every frame.
- Money figures that a payment changes (in the vault, spent today, left
  today, worst case) count to the new value over 450ms. React always renders
  the true value; only the text on screen is run through the count.
- A blocked receipt shakes its head once (420ms, 6px). A paid receipt gets
  one pass of light (900ms).
- Buttons lift 1px on hover.
- On a wide screen a gold hairline along the bar's lower edge shows how far
  down the page you are, in browsers that support scroll-driven animation.
- "How it works" opens with a looping nine-second diagram: $4 passes through
  the vault to the recipient, $80 is stopped at it. It is labelled an
  illustration and is hidden from screen readers; its caption carries the
  meaning. A row from 640px, a column below.
- The home page has its own twelve-second diagram ("Every request meets the
  same checks", `vault-diagram.tsx`, `styles/diagram.css`) built from the
  practice vault's rules: $4.00 passes the four checks one after another
  (each open ring fills with a green dot) and is paid; $80.00 stops at the
  first check (a red square), a bar drops across the vault's door and it
  is blocked; a request to raise the limit is rejected at the door, which
  outlines in red. The verdict for each is written under the checks. It
  plays only while on screen, is hidden from screen readers, and its caption
  lists the three outcomes in words. A row from 52rem, a column below.
- Tied to the scroll, not the clock (`styles/scroll.css`, in browsers with
  scroll-driven animations): the hero copy drifts up as it leaves; section
  openers rise 36px into place as they arrive; the two figures from other
  tests, and the two paths, move at different speeds (parallax); the loss
  bars and payment bars grow as they are scrolled to (a loss bar's faded
  range, where a source gives one, grows on from its solid part, so the two
  never come apart; a key above the list says what solid and faded mean);
  the worst-case chart
  and the home diagram lift 48px into place (never scaled, so their buttons keep their full size). Only `transform`, and
  only vertically, so nothing can stick out sideways. Nothing is hidden at
  any scroll position.

Motion is `transform` and `clip-path` only, apart from the backdrop's
fades (a picture, not text), the colour of the diagram's tokens and rings,
and the opacity of the home diagram's verdict lines and door outline.

Under `prefers-reduced-motion: reduce` every animation and transition is
off, `ScrollReveal` does nothing, figures change without counting, the
backdrop is the still picture with no glow and the moving door is never
loaded, the scroll-tied motion is off, the "How it works" diagram shows its
end state ($80 stopped at the vault, $4 arrived), and the home diagram shows
the three parties and the four checks, with its caption.

## Components and states

- **Button** (`.btn`): a translucent dark pill with a hairline border;
  hover lightens the fill and border; disabled is dimmer with `not-allowed`.
  `.btn-primary` is a white pill with dark text, gold on hover. `.btn-stop`
  (pause only) is red-outlined and fills red on hover. `.btn-quiet` is an
  underlined text button. Minimum height 46px; `.btn-large` 54px.
- **Focus**: 3px gold outline, 3px offset, on everything focusable. A radio
  row shows it on the whole row.
- **Field** (`.field`, `.input`, `MoneyField`): visible label above, hint
  below, 1px `--color-edge` border. Invalid: red border doubled with a ring,
  `aria-invalid`, message linked with `aria-describedby`. Money fields show a
  `$` that is not part of the value and use `inputmode="decimal"`.
- **Choice** (`.choice`): a whole-row radio; selected gets a white border,
  an inner ring and a lighter fill.
- **Receipt** (`Slip`): label (Paid / Blocked / Rejected / Not sent), amount,
  the contract's sentence, rows for recipient, what is left today and the
  practice clock, then a collapsed "Technical details" with reason code and
  name, request number, gas used and addresses. A paid receipt has a green
  edge, a refused one a red edge. Owner actions and clock skips are one
  dashed line instead of a receipt; a change the contract queued carries a
  gold "Scheduled" tag.
- **Gauge**: spent share of today's limit, a white fill on a dim track that
  ends in the stop square; `role="meter"` with a text value.
- **Scheduled panel**: gold-tinted, the "Scheduled" tag with its clock mark,
  the time it takes effect, the rules that will apply, and a Cancel button.
  Read from the contract's queue.
- **Permissions card** (home): what the agent's key can do, as term and
  answer rows: one "Allowed, inside your limits", three "Never", and what
  only the owner can do.
- **Step panels** (home): the three numbered steps each have a live card
  wired to the home page's one practice vault (`HomeVaultProvider`): the
  rules and worst-case figure read from the contract; two more requests an
  agent might send and the vault's last answer; pause, raise the daily limit
  and cancel as the owner. Nothing in them is a mock-up.
- **Disclosure** (`details.disclosure`): plus and minus markers, 52px
  summary.
- **Vault states**: starting ("Starting your practice vault…"), none
  (example vault or own rules), ready, error (retry, or discard the saved
  vault). The home example has its own starting and failed states, and its
  step panels say when the vault is loading or could not start.

## Narrow screens

No page scrolls sideways at 320, 360 or 375px, at 100% or at a 125% root
font size (360px is in the e2e suite; 320 and 375 were checked by script).

- Below 56rem the top bar is not sticky and has two rows: wordmark and the
  "Protect my AI" pill, then the three links. (The pill is in the markup
  twice, once beside the wordmark and once in the nav; CSS displays one.)
- Every two-column layout becomes one column, text first, panel second.
- The hero picture is a band under the copy (this holds up to 72rem).
- Tables and code blocks scroll sideways inside their own box; the page
  never does.
- Every target is at least 44 by 44 CSS px, except links inside a sentence.

## Error language

Errors say what happened and what to do, without apology and without
jargon. Examples in the app: "One payment cannot be larger than the whole
day's limit." "The vault only holds $16.00." "The practice vault could not
start. Check your connection and try again." A contract revert that is not a
rule refusal is shown as "Not sent", with the revert name under Technical
details. Invalid input never reaches the contract.

Words kept out of primary copy: EVM, ABI, gas, nonce, hash, smart contract.
