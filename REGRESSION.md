# Regression tests

One named test per fixed bug. Each test's name or doc comment carries the issue number, so `git grep 'Regression #N'` (Rust) or `'regression #N'` (JS) finds it. `node scripts/regressions.mjs` (run in CI) fails if a test listed here no longer exists. Add a row with every `fix:` PR.

| Bug | Fixed in | Test | Pins |
|---|---|---|---|
| #23 | #24 | `packages/core/src/fill.rs` `fill_records_sum_over_matches` | A fill record sums size and total cost over every match the order took part in |
| #31 | #32 | `packages/sdk/src/bytes.test.ts` `regression #31` | `fromHex` rejects odd-length and non-hex input, in linear time on megabyte inputs |
| #49 | #65 | `packages/core/src/balance.rs` `markets_clear_apart_with_their_own_prices` | Orders in different markets never cross; one public price per market |
| #49 | #65 | `apps/relayer/src/tests/batching.rs` `three_relayers_clear_expire_and_restart` | The same through three relayers ("no cross-market fill") |
| #57 | #65 | `apps/relayer/src/tests/funds.rs` `unfunded_orders_never_fill_and_top_ups_land_in_the_same_row` | A top-up after MPC is a credit into the existing row, never a second row |
| #85 | #87 | `packages/circuit/tests/differential.rs` `a_relayer_cannot_act_as_an_account` | In the circuit: a withdrawal built from a relayer's own key share takes nothing |
| #85 | #87 | `apps/relayer/src/tests/funds.rs` `regression_85_a_relayer_cannot_order_for_an_account` | Orders a relayer forges from an account's id and its key share spend and fill nothing |
| #85 | #87 | `apps/relayer/src/tests/settlement.rs` `withdrawals_take_only_what_the_account_holds` | A relayer's forged withdrawal is `refused` through three relayers |
| PR #92 | #92 | `apps/relayer/src/api/tests.rs` `orders_contract` | `/view` serves digests only; a fill share needs the read token this relayer got |
| #99 | #101 | `apps/relayer/src/api/account_tests.rs` `accounts_and_judge_claims` | A claim on a full table is `503`, a retry is `200` with no second credit, an account past the cap reads `waiting` |
| #99 | #101 | `packages/sdk/src/index.test.ts` `a full table is a TableFullError` | The sdk turns that `503` into `TableFullError` and reports the seat |
| #104 | #111 | `packages/circuit/tests/differential.rs` `mock_rows_never_withdraw` | In the circuit: a judge-mode row never withdraws, even with its real key |
| #104 | #111 | `apps/relayer/src/tests/settlement.rs` `withdrawals_take_only_what_the_account_holds` | Through three relayers: the judge account's withdrawal is `refused` |
| #104 | #111 | `apps/relayer/src/tests/settlement.rs` `regression_104_a_failed_payout_never_blocks_clearing_or_preprocessing` | A failed payout round leaves `debited` + `payout: "retrying"`; the next windows still clear and preprocess |
| PR #113 | febb1d6 | `apps/relayer/src/markets/rolling.rs` `one_action_is_singular` | "≥ 1 shielded action", not "actions" |
| PR #119 | #119 | `packages/plugins/polymarket/src/client.rs` `regression_119_closed_markets_by_slug_and_the_condition_id_must_match` | Lookup by slug (finds closed markets); a record with another conditionId never resolves |
| PR #122 | #122 (open) | `apps/web/mock-relayer/src/batch.test.mjs` `regression #122` | The mock relayer serves one `historyAt` per `history` price, also once capped |

Found by these tests and still open: #130 (`apps/web/lib/format.test.ts`, skipped).
