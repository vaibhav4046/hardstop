2026-11-17T20:11:08Z
$ /d/tools/fe/fe.exe --version
fe 26.6.0 (5b3f96a)
[exit 0]

$ /d/tools/fe/fe.exe fmt --check
[exit 0]

$ /d/tools/fe/fe.exe test --color never
PASS  [0.0906s] catches_a_raise_that_lands_one_second_early
PASS  [0.0854s] the_campaign_presses_on_the_exposure_bound
PASS  [0.1161s] catches_an_exposure_bound_that_forgets_a_waiting_raise
PASS  [0.0760s] the_kernel_survives_the_campaign

test result: ok. 68 passed; 0 failed
[exit 0]

$ /d/tools/fe/fe.exe build --emit bytecode,runtime-bytecode,abi --color never
Wrote \\?\D:\hardstop\fe\out/TestDollar.runtime.bin
Wrote \\?\D:\hardstop\fe\out/Vault.bin
Wrote \\?\D:\hardstop\fe\out/Vault.runtime.bin
Wrote \\?\D:\hardstop\fe\out/Actor.abi.json
Wrote \\?\D:\hardstop\fe\out/BrokenToken.abi.json
Wrote \\?\D:\hardstop\fe\out/Evil.abi.json
Wrote \\?\D:\hardstop\fe\out/TestDollar.abi.json
Wrote \\?\D:\hardstop\fe\out/Vault.abi.json
[exit 0]

$ wsl -d Ubuntu-24.04 -- bash /mnt/d/hardstop/scripts/native.sh   (fe test --backend native; fe build --backend native)
PASS  [0.0774s] a_matured_raise_is_the_baseline_for_the_next_proposal
PASS  [0.0604s] exposure_ignores_spending_from_an_older_window
PASS  [0.0532s] a_raise_that_would_mature_past_the_end_of_time_never_does
PASS  [0.0103s] exposure_owner_promise_needs_a_queue_built_by_amend

test result: ok. 44 passed; 0 failed
Wrote /mnt/d/hardstop/fe/out/hardstop
-rwxrwxrwx 1 root root 87280 Nov 17  2026 out/hardstop
[exit 0]

$ wsl -d Ubuntu-24.04 -- bash -c "cd /mnt/d/hardstop/fe && ./out/hardstop campaign 5206533097626292048 20000 40"
violation 0
at_case 0
at_step 0
digest 11679353013553752036
promises 287976
promises_with_queue 36775
promises_with_spend 52600
promises_reached 8396

real	0m0.223s
user	0m0.167s
sys	0m0.013s
[exit 0]

 M .gitignore
 M web/package-lock.json
 M web/package.json
?? qa/
?? web/e2e/
?? web/playwright.config.ts
