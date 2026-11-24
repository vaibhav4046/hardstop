# Sources for the narrated v3 film (hardstop-v3-narrated.mp4)

Film: web/public/demo/hardstop-v3-narrated.mp4, 76.6 s. Poster: web/public/demo/hardstop-v3-narrated.jpg (the frame at 31.0 s, the broken-kernel terminal).
Made on 2026-11-24 (UTC) to replace hardstop-laws.mp4 as the lead film, because that film shows pre-v3 code and "271 static_asserts".

Working folder (kept out of the repo; it holds renders, voice files and a scratch copy of fe/): the session scratchpad `film-v5`
(`C:\Users\lalwa\AppData\Local\Temp\claude\0fa2f3b7e932577a\a1cdd2d9-3fdc-4f3c-8227-ebdfa91d06a6\scratchpad\film-v5`). Below, `film-v5/` means that folder.

## How it was made
- Captures: `film-v5/rec/shoot.mjs` (headless Chromium from web/node_modules, 1440x810 CSS px at 4/3, dark). Blockscout pages with every request to a host outside `*.blockscout.com` blocked; the alert feed with `hardstop-omega.vercel.app` also allowed. Each capture saved its page text and capture time (`rec/<name>.txt`) next to the screenshot.
- Stills: `film-v5/scenes/build.mjs` builds one 1920x930 page per shot from repo text read at build time (README.md, fe/src/kernel/laws.fe, the qa/agent-runs table) and the captures, and screenshots it.
- Film: `film-v5/assemble.mjs` places the voice lines, times shots and captions from them, gives each still a slow push-in (3 to 7 %), crossfades shots (0.5 s), adds a 150 px caption band with burned-in captions (`captions.ass`), and mixes the narration. `film-v5/encode.sh` does the two-pass delivery encode. Timeline: `film-v5/timeline.json`.

## Scenes, every word and number, and its source

### 1. The problem, 0.0–14.6 s
- 0.0–7.1 s, still 1a: "The problem · a controlled test published in October 2026 · Cornell Tech and Yale"; "AI agents holding a wallet with a daily spending cap". README.md lines 3–6 ("In a controlled test published in October 2026 … AI agents holding a wallet with a daily spending cap"); "Cornell Tech and Yale": docs/EVIDENCE.md lines 36–37. Sources line (preprint arxiv.org/html/2610.35835v3, CoinDesk 1 Nov 2026): README.md lines 4–5 (the CoinDesk URL holds the date 2026/11/01).
- 7.1–14.6 s, still 1b: "raised that cap themselves in 9 of 10 models tested. The cap's arithmetic held. The path that *changes* the cap is what failed." README.md lines 6–8, verbatim. "in at least one of 20 runs each, per the preprint": docs/EVIDENCE.md line 40.
- Narration 1 (0.6 s): "In a test published in October 2026, AI agents held a wallet with a daily spending cap." Narration 2 (7.4 s): "In nine of ten models, an agent raised its own cap. The cap's math held. The path that changes it failed." Same sources ("math" for "arithmetic").

### 2. The compiler checks the promise, 14.6–34.4 s
- 14.6–19.6 s, still 2a: README.md lines 10–15 verbatim ("HARDSTOP guards that path." and the three bullets). Narration 3: "Hard Stop guards that path. A raise has to wait, and the owner can cancel it." (README line 13).
- 19.6–25.5 s, still 2b: fe/src/kernel/laws.fe lines 182–185 (law 4), 229–230 (law 4b) and 260–264 (law 4c), read from disk at build time, verbatim. "373": `grep -c '^static_assert' fe/src/kernel/laws.fe` → 373 on 2026-11-24; docs/EVIDENCE.md line 170 ("holds 373 `static_assert`s"). "Laws 4b and 4c are new in v3": EVIDENCE.md lines 170–171 ("law 4 in three setups since 2026-11-24"). Narration 4: "The F E compiler checks that promise on every build, with three hundred seventy-three checks." (README line 15: "on every build, the Fe compiler itself checks").
- 25.5–34.4 s, still 2c, a real `fe check` of a deliberately broken kernel:
  - D:\hardstop\fe copied to `film-v5/fe` on 2026-11-24; in src/kernel.fe line 499 (inside `amend`) `Queued { policy: proposed, effective_at: matures_at(rules.schedule, now) }` replaced by `Queued { policy: proposed, effective_at: if rules.queued.is_some() && rules.queued.effective_at > now { rules.queued.effective_at } else { matures_at(rules.schedule, now) } }` (diff: `film-v5/fecheck.diff`; the two diff lines are shown on screen).
  - `D:/tools/fe/fe.exe check` (fe 26.6.0 (5b3f96a)) started 2026-11-24T12:54:54Z: exit 1, `real 0m53.049s`, 64 errors, every one `error[8-0081]: static assertion failed`, on laws.fe lines 844–907 (64 distinct lines: every law 4c assert). Full output: `film-v5/fecheck.txt`. The first and last error blocks are shown verbatim; the gold line "… 62 more of the same, laws.fe lines 845–906 …" is a summary, not output. "64 × error[8-0081] · exit 1 · 53 s" are counted from that file. "Law 4c fails. The kernel does not build." follows from the errors all being law 4c lines and 8-0081 stopping the build.
  - Narration 5: "Here is a kernel broken on purpose. A bigger raise keeps the date of one already waiting." (what the edit does: a new proposal inherits the earlier `effective_at` of a raise already queued; law 4c's doc, laws.fe line 264: "A new signature never makes a waiting raise land sooner or bigger.") Narration 6: "Sixty-four checks fail. It does not build."
  - Note: docs/EVIDENCE.md says `fe check` takes "about 72 s"; this run took 53 s.

### 3. The agent's raw key is refused on chain, 34.4–55.3 s
Source for all words: qa/agent-runs/2026-11-24-raw-agent-key-v3.md.
- 34.4–42.8 s, still 3a: Blockscout https://base-sepolia.blockscout.com/tx/0xfe46d3c5760dc11887ef71bb75480951d3d493f3f302746207f4cbf54302f6ee, captured 2026-11-24T12:56:05Z (`rec/propose-view.png`, page text `rec/propose.txt`: Failed, method 0x0c5e9db7, block 63003994, Nov 24 2026 12:17:47 UTC, from 0x906C…A5C3, contract 0x76B5…1aCb). Gold box on "Failed". The note below ("propose(1000000000, 1000000000, 1798074988, false), raise its own limits to $1,000 / $1,000 → reverted NotOwner") is the run file's table row (line 38); Blockscout did not decode the revert reason (it showed the block as "being re-synced").
- Narration 7: "Next, the agent's own key, sent straight at the contract on Base Sepolia." Narration 8: "It tried to raise its own limits. Refused: not the owner." (row "Raise its own limits to $1,000 / $1,000", reverted `NotOwner`).
- 42.8–49.5 s, still 3b: Blockscout …/tx/0x47652dafed0edfb7f6b6172924e6d3e14a9793bcbc1e44bd190cd7ece2bf6bd6, captured 2026-11-24T12:56:15Z (`rec/gpu500.*`: Success, pay, block 63004331, Nov 24 2026 12:18:55 UTC, gas 56,561 in the page text, matching the run file). Gold box on "Success pay". Note: run file line 36 ("pay(0x…60f0, 500000000, 4)", "mined; vault Blocked, code 9 (recipient not approved); no Transfer"). Narration 9: "It tried to pay five hundred dollars to a recipient the owner never approved. Refused. Nothing moved."
- 49.5–55.3 s, still 3c: the run file's table, lines 36–43, verbatim (links reduced to their text; Gas column left out). "Read back afterwards … $86, as before … $0": run file lines 52–57. "Claude Code and Cursor … moved $0 past its limits": README.md line 17, which links qa/agent-runs/2026-11-24-claude-code-native-v3.md and qa/agent-runs/2026-11-24-cursor-native-v3.md. Narration 10: "Claude Code and Cursor, with the agent's tools, moved nothing past the limits." (both runs: one allowed $3 paid, $5 to GPU Market and $15 refused on chain, the raise only drafted for the owner).

### 4. A Safe as owner, 55.3–63.9 s
Source for all words: qa/agent-runs/2026-11-24-safe-owner-v3.md.
- 55.3–59.7 s, still 4a: Blockscout …/tx/0x1088945bd100c8e0fbd6d7bc698b32d888e0a72a7c9d8b17352696e3b9e50434, captured 2026-11-24T12:56:26Z (`rec/gs020.*`: Failed, execTransaction, block 63006345, 12:25:37 UTC, from 0x2960…1870, contract the Safe 0xC350…81BA). Note: table row "One owner alone signs a raise to $40 a day … reverted: the Safe refuses with GS020 (not enough signatures); the vault never sees it" (the GS020 reason was read by simulation, per the run file). Narration 11: "The owner can be a two of two Safe. One signer alone was refused."
- 59.7–63.9 s, still 4b: Blockscout …/tx/0x4d39514199ec1e396abed2a2998a7e449c135f593b03915165e00c6aa863b4e5, captured 2026-11-24T12:56:36Z (`rec/queued.*`: Success, execTransaction, block 63006350, 12:25:38 UTC). Note: row "Both owners sign the same raise … queued, not applied: policy still $20 a window, queued $40". Narration 12: "With both signatures, the raise was queued, not applied."

### 5. The owner hears about it, 63.9–71.7 s
- 63.9–68.0 s, still 5a: the live feed https://hardstop-omega.vercel.app/alerts?chain=84532&vault=0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb opened in headless Chromium at 2026-11-24T12:56:40Z (HTTP 200, application/atom+xml; raw body `rec/alerts-raw.xml`, screenshot `rec/alerts-view.png`). Its subtitle, verbatim: "Nothing needs you: no change is waiting, read from Base Sepolia at 2026-11-24T12:56:38.000Z." The line under it paraphrases qa/agent-runs/2026-11-24-alert-feed.md lines 4–8 ("reads the vault fresh from the chain on each request … A feed reader that follows it alerts the owner when a rule change that loosens a limit is waiting").
- 68.0–71.7 s, still 5b: the waiting entry quoted in qa/agent-runs/2026-11-24-alert-feed.md (table row "Owner proposes $40 a day", tx 0xbb1d8676…, updated 2026-11-24T10:43:24Z): title and summary verbatim. "The owner then cancelled it (tx 0xf0b7e4dc…), and the feed said 'Nothing needs you' again": the next row.
- Narration 13: "And the owner hears about it. A live feed shows a waiting change, and when it takes effect, while there is time to cancel." (alert-feed.md lines 6–8: "with the time it takes effect: the moment to cancel it").

### 6. End, 71.7–76.6 s
- Still 6: "HARDSTOP", "hardstop-omega.vercel.app" (README line 20), "Test networks only. Unaudited." (README line 22: "Unaudited contest prototype, on test networks only"; line 145: "Test networks only"), "Narration: synthetic voice." Narration 14: "Hard Stop. Test networks only. Unaudited."

## Sound
- Narration: synthetic voice, Kokoro-82M, voice af_heart, `npx hyperframes@0.9.70 tts` with HYPERFRAMES_PYTHON = the scratchpad kvenv, one file per line of `film-v5/voice/lines.txt` (14 lines; "Hard Stop" and "F E" written that way so they are said right; numbers written as words). Lines placed by `assemble.mjs` (start times in `timeline.json`), mixed to 48 kHz mono with loudnorm I=-16 TP=-1.5.
- No music.

## Captions
`film-v5/captions.ass`: 15 captions (line 13 split in two at "and when", 68.15 s, from Whisper's word time), the same words as the narration with numbers as numerals, "Hard Stop" as HARDSTOP and "F E" as Fe; Segoe UI Semibold 44 px, centred in the caption band.

## Checks
- Delivery file (ffprobe): H.264 High, 1920x1080, 30 fps, yuv420p, ~1,010 kb/s; AAC LC 48 kHz mono ~88 kb/s; 76.63 s; 10,599,137 bytes (10.6 MB); `moov` before `mdat` (+faststart). Two-pass x264 preset slower at 1000 kb/s from `film-v5/out/master.mp4` (CRF 16). x264 printed one "slice=P but 2pass stats say B" warning in pass 2; no visible effect found in the frames below. web/public/demo copies are byte-identical to `film-v5/out` (`cmp`).
- Poster: 1280x720 JPEG, 110,912 bytes, the frame at 31.0 s.
- Loudness (ebur128 on the delivered file): integrated -16.3 LUFS, LRA 2.4 LU, true peak -1.3 dBFS.
- Blank gaps: `blackdetect=d=0.3:pix_th=0.06` on the delivered file reports nothing.
- Frames read: 13 stills before assembly; 14 frames of the master (3.5, 10.5, 17, 22.5, 29, 33, 37, 46, 52, 57.5, 61.5, 66, 70, 74.5 s); 12 frames of the delivered file (2, 11, 22, 29.5, 38, 46, 52, 58, 62, 66, 70, 75 s), with 29.5 s read full size. Every scene has text inside the frame, no label overlaps, captions sit inside the band and match the voice line playing then. Fixed after the first look: Blockscout URLs wrapped into the note (now shortened with "…"), a table separator row was shown as a data row and the Pause row was missing (rows now 36–43), law text wrapped (smaller code font), two gold boxes clipped their badge, the feed card's date broke across lines.
- Transcript: `npx hyperframes@0.9.70 transcribe --engine whisper` (small.en) on `voice/narration.wav` (`film-v5/tr/transcript.json`). All 14 lines are present, in order, word for word, except how Whisper spells names: "Hard stop" for Hard Stop, "The FE compiler", "base Sepolia", "2 of 2 safe", and "Clawed code and cursor" for Claude Code and Cursor (Whisper's spelling; nobody listened with human ears to judge how "Claude" is said).
- Caption sync: each caption starts within 0.3 s of Whisper's first-word time for its line (0.6 s for the very first line, where Whisper put the first word at 0.00), and the split of line 13 is 0.07 s from "and when".
- Not checked: playback on a phone or in the site's player; listening to the voice with human ears.
- Nothing else in D:\hardstop was edited; no git, no deploy, no transactions. The site still links hardstop-laws.mp4 as its newest film (web/src/app/layout.tsx line 88), and README.md line 53 and SUBMISSION.md line 16 still lead with it; nothing links the new file yet.
