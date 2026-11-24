# Sources for the 43.5-second v3 film (hardstop-v3.mp4)

Silent, captioned. Every frame is a still of real material: a Blockscout page or text copied from a capture. Working folder (outside the repo): the session scratchpad `film-v3/` (`rec/shoot.mjs` for the explorer captures, `scenes/build.mjs` for the scene pages, `scenes/*.png` the rendered stills).

Final: web/public/demo/hardstop-v3.mp4. Poster: web/public/demo/hardstop-v3.jpg (1280x720, the $15-refused frame at 30.0 s).

## Scenes (cross-fades of 0.5 s overlap the ranges)
1. title 0-4.5
2. Cursor's printed steps, three parts: 4.0-9.5 (lines 1-10), 9.0-14.0 (lines 12-18), 13.5-19.0 (lines 20-27)
3. $3 paid 18.5-23.5
4. GPU Market refused 23.0-28.0
5. $15 refused 27.5-32.5
6. alert feed 32.0-40.0
7. end 39.5-43.5

## Every word and number on screen, and its source
- Title (0-4.5): "HARDSTOP v3 · 24 Nov 2026" and "An AI agent on the current contracts, on Base Sepolia." are the brief's wording; "current contracts (v3)" and Base Sepolia: qa/agent-runs/2026-11-24-cursor-native-v3.md lines 1-4.
- Cursor's output (4.0-19.0): `~/.hardstop/cursor-run-v3.txt` (outside the repo, the agent's final message, 27 lines), lines 1-10, 12-18 and 20-27, every word as printed. Markdown `**…**` shown as gold bold and backticks as blue, trailing spaces dropped; lines starting ✅ tinted green, ⛔ red. Long lines wrap. The same replies are quoted in 2026-11-24-cursor-native-v3.md lines 44-51. Card label: "cursor-agent", "Cursor's terminal agent", "its final message": same file lines 8-9 and 40; "24 Nov 2026": its title.
- Caption "Cursor's agent, told the six steps, not the limits.": the brief; the prompt names the steps and not the limits, cursor-native-v3.md lines 23-32.
- $3 paid (18.5-23.5): rec/paid-view.png, https://base-sepolia.blockscout.com/tx/0xb325cc6a7e698d8b9ea4de5b14228b41817061a674ca8c0f0ccb9e3b4800d987 captured 2026-11-24T10:39:56Z (page text rec/paid.txt: Success, pay, block 62971030, Nov 24 2026 10:27:54 UTC, Tokens transferred 0x76…1aCb → 0x00…5109 for 3). Crop of device px x 370-1870, y 235-945, shown at 1.12x; the gold box is drawn on the "Tokens transferred" row. Sub-line: that row, plus "Cloud hosting (0x…5109)" from cursor-native-v3.md line 36. Caption "$3 paid: tokens moved": the brief; md line 63 (Transfer of 3,000,000 units).
- GPU Market (23.0-28.0): rec/gpu-view.png, …/tx/0xe2d6ce77f0516753ecad0f7a271c758e507fd82910604dc56e3dc3e26d53265c captured 2026-11-24T10:40:05Z (block 62971064, 10:28:01 UTC, no "Tokens transferred" row). Sub-line "Blocked event, code 9 (recipient not approved)": md line 64. The page's "Success" is the call being mined; md lines 59-60 and 67 ("refusals are mined and recorded, and moved nothing").
- $15 (27.5-32.5): rec/over-view.png, …/tx/0x67d2400753cee3aa0d133f31213343c66bc2191de5380a339287fc257cb74f65 captured 2026-11-24T10:40:14Z (block 62971109, 10:28:10 UTC, no "Tokens transferred" row). Sub-line "code 10 (the per-payment limit)": md line 65. "$10 limit": md line 35 and cursor-run-v3.txt line 17.
- Explorer pages say "12m ago": relative to the capture time.
- Alert feed (32.0-40.0): qa/agent-runs/2026-11-24-alert-feed.md line 18 (the run repeated after the wording review): entry title and summary verbatim; only the three timestamps were kept from breaking across lines. "captured 2026-11-24 10:43 UTC": the entry's `updated` 2026-11-24T10:43:24Z (same line) and the proposal tx 0xbb1d867670b4faecfaa4567eef7911ef96c12db7bc6381a39d9553f1eb3ad1d3 (Blockscout API timestamp 2026-11-24T10:43:24Z). "Owner cancelled 3 s later (10:43:27 UTC) … Nothing needs you again": line 19 and cancel tx 0xf0b7e4dca9d845b8d257139633564d4c00cb971d752026afd9acf8342b257fa2 (Blockscout API: cancelQueued, 2026-11-24T10:43:27Z). Vault 0x76b5…1acb: line 11. "Atom feed", "/alerts": line 3. The earlier "A looser rule is waiting" run (lines 21-28) is not shown.
- Caption "A raise waits a day. The hosted feed tells the owner, with time to cancel.": the brief; 24 h = takes effect 2026-11-25T10:43:24Z for a proposal at 2026-11-24T10:43:24Z; cursor-run-v3.txt line 27 ("24h cooling period").
- End (39.5-43.5): URL and "Test networks only. Unaudited.": README line 11 ("Unaudited contest prototype, on test networks only").

## Checks
- Frames read at full size from the delivered file: 2.0, 21.0, 36.0, 41.5 s (title, $3 paid, feed, end); from earlier encodes whose stills for those scenes are unchanged: 7.0, 16.5, 30.0 s (Cursor parts 1 and 3, $15 refused), plus every scene still (part 2 and GPU Market included). All text inside the frame, nothing overlapping; scene pages also checked for overflowing boxes when rendered (none).
- Encode: H.264 1920x1080, 30 fps, yuv420p, CRF 20 `-tune stillimage`, `+faststart` (moov before mdat), no audio stream, 43.5 s, 3,191,442 bytes.
- Not checked: playback on a phone. The ✅ ⛔ 🛡️ 📝 marks render with the system emoji font.
