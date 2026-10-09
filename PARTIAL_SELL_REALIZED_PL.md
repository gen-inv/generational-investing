# Partial Sells: Realized P/L per SELL

## Problem
Selling part of a holding (e.g. 500 of 2,000 NFLX shares) only reduced `total_shares` and wrote a
SELL row to `stock_transactions`. Every P/L report filtered on `stock_holdings.is_open = 0`, so a
partial sell never reached Closed Trades, YTD P/L or the dashboard. Several reports (dashboard,
performance, `/api/reports/pl`) also still read the legacy `stock_trades` table.

## Model
Each SELL stands on its own:

    realized P/L = (sell price - average cost) x shares sold
                   - sell commission
                   - buy commissions x (shares sold / shares held before the sale)

- Average cost is the weighted average of the BUYs held on the sale date (the holding's transactions
  are replayed in date order; BUY before SELL on the same day). A later buy never changes an earlier sell.
- Dividends, covered-call premiums and put premiums are **not** part of a stock sell's P/L. They stay
  their own income (`cost_basis_adjustments`, `option_trades`) and only reduce the theoretical
  cost basis while shares are held: `cost basis/share = avg price - adjustments / shares held`.
- For a holding that reaches 0 shares, the per-sell results add up to
  `total sells - total buys - all commissions` (the old full-close total).

## Code
- `src/lib/stock-pl.ts` - `replayHolding()` (pure) and `loadRealizedSells()` (D1 loader). Single source of truth.
- `tests/stock-pl.test.ts` - unit tests (partial sell, final sell, later buys, same-day, overselling).
- No schema change and no backfill: results are derived from existing transactions on read,
  so existing partial sells appear as soon as this is deployed.

## Behaviour changes
| Area | Change |
|---|---|
| `GET /api/stocks/closed-trades` (new) | One row per SELL (partial + full). Closed holdings with no SELL row stay visible with P/L unknown. |
| Closed Trades screen | Uses the new endpoint; "Partial" badge; Sell Price column; Re-open only on the closing sell. |
| `GET /api/stocks`, `GET /api/stocks/:id` | `realized_pl` added; closed `profit_loss` from per-sell results; each SELL transaction carries `avg_cost`, `realized_pl`, `shares_remaining`. |
| `GET /api/stocks/:id/purchase-history` | SELL rows carry realized P/L; shown in the modal's Share Ownership History. |
| `PUT /api/stocks/:id/close` | Returned P/L is for the closing sell only. |
| `PUT /api/stocks/:id/reopen` | Deletes only the **final** SELL (was: every SELL) and restores `total_shares` when it was 0. |
| Dashboard YTD, win rate, monthly P/L; account YTD; P/L summary; performance; `/api/reports/pl` | Stock P/L now = realized P/L of every SELL (dashboard/performance/`/api/reports/pl` no longer read legacy `stock_trades`). |

Not changed: Monthly Income (already per-SELL), open-position analysis (already uses remaining shares + adjustments).

## Verify after deploy
`npx wrangler d1 execute webapp-production --remote --file=scripts/check-ticker-sells.sql`
lists NFLX's holdings and transactions (read-only) to compare with Closed Trades and the modal.
