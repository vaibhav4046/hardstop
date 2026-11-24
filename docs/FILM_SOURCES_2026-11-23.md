# Sources for the 70-second film (hardstop-laws.mp4)

Copied from the film's working folder (film/work/v4, kept out of git because it holds renders and voice files). Paths are as on the machine it was made on.


Final: web/public/demo/hardstop-laws.mp4 (encode numbers at the end). Poster: web/public/demo/hardstop-laws.jpg.
Master (silent, CRF 16): renders/master.mp4. It shows what was built on 2026-11-23 evening and complements the earlier films (hardstop-demo, hardstop-walkthrough, hardstop-update); it replaces none of them.

## Scenes (70.5 s)
1. promise 0-9.5: the site's dithered door (same drawing as v2/v3), "One promise to the owner", then law 4's promise word by word.
2. laws 9.5-22.6: lines 182-200 of fe/src/kernel/laws.fe (law 4), then 271 / 128 / 16,384 beside the real `static_assert` lines 511-560 scrolling.
3. broken 22.6-31.8: the table of ten broken kernels from docs/EVIDENCE.md, then a real `fe check` of a kernel that ignores a pause (10 × error[8-0081]).
4. pay 31.8-43.9: lines 316-330 of fe/src/vault.fe and line 99 of fe/src/kernel/sealed.fe, then a real `fe check` of a hand-made Payout (error[2-0003] ... is not visible).
5. chain 43.9-53.9: the Blockscout page of the owner's setAgent transaction on Base Sepolia, then three lines of that run's log (old key: reverted NotAgent, not sent).
6. try 53.9-64.6: https://hardstop-omega.vercel.app/mcp, then the real reply to hardstop_pay $15 from the live endpoint.
7. end 64.6-70.5: mark, HARDSTOP, hardstop-omega.vercel.app, "Test networks only. Unaudited.", "Narration: synthetic voice".

## Every number on screen, and its source
- Promise (0-9.5 s): wording of law 4's doc comment, fe/src/kernel/laws.fe lines 182-184, and README "For judges, in 60 seconds" item 2 ("whatever the owner signs, the worst case cannot rise before the cooling period ends").
- Law 4 code (9.7-13.4 s): fe/src/kernel/laws.fe lines 182-200 as on disk 2026-11-23, printed by rec/rows.mjs (HTML-escaped, common indent removed). Lines 190, 199, 200 highlighted.
- 271 `static_assert`s: `grep -c '^static_assert' fe/src/kernel/laws.fe` = 271 (2026-11-23); docs/EVIDENCE.md "The kernel's laws, checked by the compiler (2026-11-23)": "holds 271 `static_assert`s". The scrolling lines are laws.fe lines 511-560 verbatim (texture, marked data-layout-ignore).
- 128 policies, 16,384 pairs (128 × 128): laws.fe line 11 ("The grid is 128 policies"), line 41 (`const GRID: u64 = 128`); FE_HIGHLIGHT.md and docs/EVIDENCE.md row 11 ("a grid of 128 policies (16,384 pairs)"); README line 18. "A grid, not every input": laws.fe line 13.
- Ten broken kernels and the counts 24, 2, 8, 10, 2, 20, 18, 2, 32, 224 (22.8-26.4 s): docs/EVIDENCE.md table in that section, row text verbatim, column "Law asserts failed". "None of them builds" follows from every row having at least 2 failed asserts (each is error 8-0081, which stops the build).
- Pause terminal (26.9-31.8 s): evidence/laws-break-check.txt. D:\hardstop\fe copied to D:\hardstop-film-scratch\fe-laws on 2026-11-23, kernel.fe line 416 `    if policy.paused {` changed to `    if false {` (diff in the file), then `D:/tools/fe/fe.exe check` (fe 26.6.0 (5b3f96a)): exit 1, 48.851 s ("49 s"), 10 errors, all `error[8-0081]: static assertion failed`, at laws.fe lines 644, 645, 652, 653, 668-673. The first error block is shown verbatim; the other nine are summarised in a gold note (not styled as output). The 10 matches the "decide ignores a pause" row of the EVIDENCE table. Baseline: an unmodified copy (D:\hardstop-film-scratch\fe-clean) printed nothing and exited 0 in 59 s (evidence/clean-check.txt; the machine was also running TTS then).
- Pay handler (32.1-38.7 s): fe/src/vault.fe lines 316-330 and fe/src/kernel/sealed.fe line 99 as on disk 2026-11-23, via rec/rows.mjs. "the payout's fields are not pub": line 99 `pub struct Payout { token: Address, to: Address, amount: u256 }` (no `pub` on the fields).
- Hand-made payout terminal (38.8-43.9 s): evidence/payout-break-check.txt. Copy D:\hardstop-film-scratch\fe-payout, vault.fe line 329 `payout.send()` replaced by `ingot::kernel::sealed::Payout { token, to: ctx.caller(), amount: amount * 1000 }.send()`, then `fe check`: exit 1, three `error[2-0003]` (`token`, `to`, `amount` is not visible). The first block is verbatim; the `to` and `amount` blocks are shown by their header lines only. Every shown output line was matched against the capture with `grep -xF`.
- Base Sepolia (44.1-49.7 s): rec/setagent-view.png, taken by rec/shoot-tx.mjs (headless Chromium from web/node_modules, 1440x810 CSS px at 4/3, every request to a host outside *.blockscout.com blocked) from https://base-sepolia.blockscout.com/tx/0xdda4044c90521d99c2b5eb8c58e20475ceeb48634abdc808e0c1d19a00b6f6bd at 2026-11-23T22:55:20Z; page text in rec/setagent.txt (Success, setAgent, block 62729975, Nov 23 2026 21:04:23 UTC, from 0x296067…1870, contract 0x28C9…2C69). Scaled to 0.8 and zoomed 6% only. "23 Nov 2026 21:04 UTC" is that page's timestamp. Same tx in docs/EVIDENCE.md ("Current contracts on Base Sepolia (2026-11-23 ...)": "replaced the agent's key"). "a public test network": the page's own "This is a testnet transaction only" banner and README.
- Run log (49.8-53.9 s): evidence/base-sepolia-evidence-v2.txt (copy of D:\hardstop-mut\evidence-v2.txt), lines "owner replaces agent key ... ok gas 48400", "agent now ... may pay from 1795554263 (2026-11-24T21:04:23.000Z)", "old key pays after that (not sent) reverted NotAgent gas 0". Long hashes and addresses shortened with "…" (said on screen); nothing else changed. Gas 48,400 also in docs/EVIDENCE.md's gas table. "refused before anything is sent" = "(not sent) reverted NotAgent": the old key's payment was rejected in simulation and never broadcast; EVIDENCE.md: "the old key's next payment reverted `NotAgent` before sending".
- Live MCP reply (59.1-64.6 s): evidence/remote-output.txt, written by `node film/work/v4/evidence/remote-client.mjs` from D:\hardstop on 2026-11-23T22:54:49Z (@modelcontextprotocol/sdk Client + StreamableHTTPClientTransport from web/node_modules against https://hardstop-omega.vercel.app/mcp; tools listed: hardstop_status, hardstop_preview_payment, hardstop_pay, hardstop_recipients, hardstop_request_more). Call `hardstop_pay {"to":"Cloud hosting","amount_usd":"15"}`; the three reply lines are verbatim: "⛔ Refused: $15.00 to Cloud hosting. One payment may be at most $10.00." / "Left today: $20.00." / "Recorded on the in-memory demo network, which no explorer can show."
- End: URL and "Unaudited ... test networks only": README header.

## Sound
- Narration: synthetic voice, Kokoro-82M, voice af_heart, made with `npx hyperframes@0.9.70 tts` (HYPERFRAMES_PYTHON = the scratchpad kvenv); script voice/lines.txt (13 lines), times voice/place.txt, mixed by voice/build-narration.sh (70.5 s, loudnorm -16 LUFS, 48 kHz mono) and muxed in the second encode pass.
- The product name is written "Hard Stop" in the TTS text. Whisper (small.en, `hyperframes transcribe --engine whisper`, voice/transcript-whisper.json) wrote it "Hard Stop" both times, so it is not heard as "Should stop".
- "Fe": the first take ("The Fe compiler", kept as voice/line03.fee.wav) came back from Whisper as "The fee compiler". Line 3 was regenerated as "The F E compiler"; Whisper then wrote "The FE Compiler". All 13 lines are present, in order, in the final transcript. Whisper also wrote "base sepolia" in lower case and "handmade" as one word.
- Nobody has listened to it with human ears in this session; only the Whisper transcript was checked.
- No music: no licensed track is available (same rule as v3).

## Captions
compositions/captions.html: 15 captions (lines 4 and 7 split in two), same words as voice/lines.txt with numbers as numerals, "Hard Stop" as HARDSTOP and "F E" as Fe; timed from place.txt, the measured line lengths and the Whisper word times.

## Checks
- `npx hyperframes@0.9.70 check`: "Check passed", 0 errors. First run had 4 layout errors (static_assert rows below the clipped scroll box seen as covered by a caption): fixed by marking that texture box data-layout-ignore. Warnings kept: timeline_track_too_dense (one scene per story beat, as v3), film_silent / audio_none (the narration is muxed after the render, as v3), text_below_floor for the verbatim compiler output (22-25 px: the 117-character error line does not fit at 28 px), line_unread for the law-4 code (on screen 3.6 s while the narration covers it) and the run-log line 2.
- Frames looked at before render: renders/snap1 (16 frames: 2.5, 7, 9, 11.5, 16, 21, 24.5, 29, 34.5, 38, 41.5, 47, 52, 57, 62, 67.5 s) and renders/snap2 (29, 41.5 s full size after shrinking the terminal cards).
- Looked at, in the delivered file: 22 frames (renders/contact-sheet.png: 2.0, 6.5, 9.2, 10.5, 12.5, 15.0, 19.5, 21.8, 24.0, 28.5, 30.5, 33.0, 37.0, 40.0, 43.0, 46.0, 51.0, 55.5, 60.5, 63.0, 66.5, 70.2 s), at least one per scene and per caption block; full-size reads at 20.5 s and 47.5 s (renders/full-*.png). No labels overlap, every text block is inside the frame, the gold box sits on the explorer's "Success setAgent" badge.
- Blank gaps: `ffmpeg -vf blackdetect=d=0.3:pix_th=0.06` on the delivered file reports nothing (no stretch of 0.3 s or more is empty). Scene changes leave at most about 0.45 s of plain ground (53.9-54.3 s).
- Fixed during review: the terminal cards were 820 px tall with half of them empty (now sized to their text); terminal text raised from 21-23 px to 22-25 px; two long labels shortened.
- Known soft spots: the compiler output is 22-25 px (the long line 329 cannot be larger without wrapping); the law-4 code is on screen 3.6 s, too short to read every line (the highlights carry it); the explorer page says "2h ago" (relative to the capture, 22:55 UTC); the ⛔ in the MCP reply renders with the system emoji font; the run-log line 2 shows for about 3.2 s.
- Not checked: playback on a phone; listening to the voice with human ears (only the Whisper transcript).

## Delivery encode (ffprobe)
- web/public/demo/hardstop-laws.mp4 (= renders/hardstop-laws.mp4, byte-identical by `cmp`): H.264 1920x1080 30 fps (~1,191 kb/s), AAC 48 kHz mono ~94 kb/s, 70.5 s, 11,398,493 bytes (11.4 MB). Two-pass x264 preset slower at 1100 kb/s from renders/master.mp4 (CRF 16, 10,759,498 bytes, silent), narration muxed in the second pass (voice/encode.sh). Audio: integrated -16.3 LUFS (ebur128), mean -17.3 dB, peak -1.3 dB.
- Poster: web/public/demo/hardstop-laws.jpg, 1920x1080, 392,377 bytes, the frame at 9.0 s (the promise beside the door).
- Nothing else in D:\hardstop was edited; no git, no deploy. Scratch copies of fe/ used for the compiler captures: D:\hardstop-film-scratch\fe-laws, fe-payout, fe-clean.

**Later the same night:** law 8 added six checks (277 in all), after this film was made; the film shows the 271 of that moment. The film was deployed to the site after this review, around 23:45 UTC.
