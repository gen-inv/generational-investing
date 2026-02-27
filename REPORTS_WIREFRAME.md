# Reports Section - Wireframe & Design Specification

## Overview
Transform the current basic Reports page into a comprehensive, highly visual reporting dashboard with multiple report types, charts, graphs, and performance metrics.

---

## Navigation Structure

### Current State
- Single "Reports" menu item → P/L Reports page

### Proposed State
- **Reports** menu item → Reports Dashboard (landing page)
  - Quick access tiles to different report types
  - Visual preview of key metrics

---

## Proposed Reports Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  REPORTS DASHBOARD                                    [Date Range: ▼]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │  📊 PORTFOLIO OVERVIEW   │  │  💰 P/L SUMMARY          │            │
│  │  ─────────────────────   │  │  ───────────────────     │            │
│  │  Total Value: $125,450   │  │  YTD P/L: +$12,340      │            │
│  │  Total Return: +24.5%    │  │  Win Rate: 68%          │            │
│  │  [View Details →]        │  │  [View Report →]        │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
│                                                                           │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │  📈 PERFORMANCE CHARTS   │  │  🎯 CLOSED TRADES        │            │
│  │  ─────────────────────   │  │  ───────────────────     │            │
│  │  Portfolio Growth        │  │  156 Closed Trades      │            │
│  │  Monthly Returns         │  │  Avg P/L: $79.10        │            │
│  │  [View Charts →]         │  │  [View Trades →]        │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
│                                                                           │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │  🏆 STRATEGY ANALYSIS    │  │  📊 POSITION ANALYSIS    │            │
│  │  ─────────────────────   │  │  ───────────────────     │            │
│  │  Best: Covered Calls     │  │  Top Holdings           │            │
│  │  Win Rate: 85%           │  │  Sector Allocation      │            │
│  │  [View Analysis →]       │  │  [View Breakdown →]     │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  📉 QUICK CHARTS (INLINE PREVIEW)                                 │  │
│  │  ────────────────────────────────────────────────────────────     │  │
│  │                                                                    │  │
│  │  Portfolio Value Trend (Last 12 Months)                          │  │
│  │  [Line Chart: Portfolio Value Over Time]                         │  │
│  │                                                                    │  │
│  │  Monthly P/L Breakdown (Current Year)                            │  │
│  │  [Bar Chart: Monthly Profit/Loss]                                │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Report Types & Pages

### 1. **Portfolio Overview Report**

**Purpose**: Comprehensive view of entire portfolio performance

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO OVERVIEW                        [Account: All ▼] [Year: 2026▼]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  KEY METRICS (Card Grid)                                                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────┐ │
│  │ Total Value    │ │ YTD P/L        │ │ Total Return   │ │ Sharpe   │ │
│  │ $125,450.00    │ │ +$12,340.50    │ │ +24.5%         │ │ Ratio    │ │
│  │ USD/CAD Mixed  │ │ ↑ 18.2%        │ │ vs S&P: +8.3%  │ │ 1.45     │ │
│  └────────────────┘ └────────────────┘ └────────────────┘ └──────────┘ │
│                                                                           │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────┐ │
│  │ Win Rate       │ │ Avg Win        │ │ Avg Loss       │ │ Largest  │ │
│  │ 68.5%          │ │ +$245.30       │ │ -$128.40       │ │ Win      │ │
│  │ 107/156 trades │ │ per trade      │ │ per trade      │ │ $1,850   │ │
│  └────────────────┘ └────────────────┘ └────────────────┘ └──────────┘ │
│                                                                           │
│  PORTFOLIO VALUE TREND (Full Width Chart)                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  $150k ┤                                              ╭──╮          │  │
│  │        │                                          ╭───╯  │          │  │
│  │  $125k ┤                                      ╭───╯      │          │  │
│  │        │                                  ╭───╯          │          │  │
│  │  $100k ┤                              ╭───╯              ╰──╮       │  │
│  │        │ ╭────────────────────────────╯                     │       │  │
│  │  $75k  ┼─┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴───    │  │
│  │        Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ACCOUNT BREAKDOWN (Side by Side)                                        │
│  ┌────────────────────────────────┐  ┌─────────────────────────────┐   │
│  │  Account Distribution (Pie)    │  │  Account Performance (Bar)  │   │
│  │                                 │  │                             │   │
│  │       ┌─────────┐               │  │  Cash:      ████████░  78%  │   │
│  │       │  Cash   │               │  │  TFSA:      ██████████ 92%  │   │
│  │       │  45%    │  TFSA         │  │  Margin:    ████░░░░░░ 45%  │   │
│  │       │         │  35%          │  │  RRSP:      ███████░░░ 65%  │   │
│  │       └─────────┘               │  │                             │   │
│  │         Margin: 20%             │  │                             │   │
│  └────────────────────────────────┘  └─────────────────────────────┘   │
│                                                                           │
│  MONTHLY P/L BREAKDOWN (Bar Chart)                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  $3k  ┤                            ███                             │  │
│  │       │         ███                ███          ███                │  │
│  │  $2k  ┤         ███                ███    ███   ███                │  │
│  │       │   ███   ███          ███   ███    ███   ███          ███   │  │
│  │  $1k  ┤   ███   ███    ███   ███   ███    ███   ███    ███   ███   │  │
│  │       │   ███   ███    ███   ███   ███    ███   ███    ███   ███   │  │
│  │   $0  ┼───███───███────███───███───███────███───███────███───███───│  │
│  │       │                                                  ░░░         │  │
│  │ -$1k  ┤                                                  ░░░         │  │
│  │       Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  │       Green = Profit, Red = Loss                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  [Export PDF] [Export CSV] [Print Report]                               │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Data Required:**
- Portfolio value history (daily/monthly snapshots)
- All closed trades with P/L
- Account balances by type
- Performance metrics (win rate, Sharpe ratio, etc.)

---

### 2. **P/L Summary Report** (Enhanced Current Report)

**Purpose**: Detailed profit/loss breakdown by asset type and time period

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PROFIT & LOSS SUMMARY                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  FILTERS:  [Year: 2026 ▼]  [Month: All ▼]  [Account: All ▼]           │
│            [Trade Type: All ▼]  [Generate Report]                       │
│                                                                           │
│  SUMMARY CARDS                                                           │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐  │
│  │  STOCK TRADES      │ │  OPTION TRADES     │ │  DAILY TRADES      │  │
│  │  Total P/L         │ │  Total P/L         │ │  Total P/L         │  │
│  │  +$8,450.25        │ │  +$3,240.10        │ │  +$650.15          │  │
│  │  45 trades         │ │  89 trades         │ │  22 trades         │  │
│  │  Win Rate: 71%     │ │  Win Rate: 67%     │ │  Win Rate: 64%     │  │
│  └────────────────────┘ └────────────────────┘ └────────────────────┘  │
│                                                                           │
│  P/L TREND CHART (Line Chart)                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         ┌Stock ┌Options ┌Daily ┌Total              │  │
│  │  $4k  ┤                                                            │  │
│  │       │                                                ╭───╮       │  │
│  │  $3k  ┤                                            ╭───╯   │       │  │
│  │       │                                        ╭───╯       ╰───╮   │  │
│  │  $2k  ┤                                    ╭───╯               │   │  │
│  │       │                                ╭───╯                   │   │  │
│  │  $1k  ┤                            ╭───╯                       ╰─  │  │
│  │       │ ╭──────────────────────────╯                              │  │
│  │   $0  ┼─┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────  │  │
│  │       Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  DETAILED BREAKDOWN (Tabbed Interface)                                  │
│  [Stock Trades] [Option Trades] [Daily Trades] [All Trades]            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Date       │ Ticker │ Type │ Quantity │ Entry │ Exit  │ P/L     │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │  2026-02-15 │ AAPL   │ BUY  │ 100      │ $145  │ $158  │ +$1,300 │  │
│  │  2026-02-10 │ TSLA   │ BUY  │ 50       │ $210  │ $228  │ +$900   │  │
│  │  2026-02-05 │ MSFT   │ BUY  │ 75       │ $380  │ $372  │ -$600   │  │
│  │  ...                                                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  [Export to PDF] [Export to CSV] [Export to Excel]                     │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Filterable by date range, account, trade type
- Visual P/L trend over time
- Detailed trade list with sorting/filtering
- Export functionality

---

### 3. **Performance Charts** (NEW)

**Purpose**: Visual analysis of portfolio performance over time

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PERFORMANCE CHARTS                      [Time Period: Last 12 Months ▼]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  PORTFOLIO GROWTH (Area Chart)                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  $150k ┤                                                  ▓▓▓▓▓▓▓  │  │
│  │        │                                              ▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │  $125k ┤                                          ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │        │                                      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │  $100k ┤                                  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │        │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │  $75k  ┼─────────────────────────────────────────────────────────  │  │
│  │        Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ROLLING RETURNS (Multi-Line Chart)                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │         ┌ 1-Month  ┌ 3-Month  ┌ 6-Month  ┌ 12-Month                │  │
│  │  +40% ┤                                                            │  │
│  │       │                                                   ╭───     │  │
│  │  +30% ┤                                               ╭───╯        │  │
│  │       │                                           ╭───╯            │  │
│  │  +20% ┤                                       ╭───╯                │  │
│  │       │                                   ╭───╯                    │  │
│  │  +10% ┤ ──────────────────────────────────╯                       │  │
│  │       │                                                            │  │
│  │    0% ┼────────────────────────────────────────────────────────   │  │
│  │       Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  DRAWDOWN ANALYSIS (Area Chart)                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │    0% ┼─────────────────────────────────────────────────────────   │  │
│  │       │                                                            │  │
│  │   -5% ┤             ░░░░░                                          │  │
│  │       │         ░░░░░░░░░░░░                                       │  │
│  │  -10% ┤     ░░░░░░░░░░░░░░░░░░░░░                                 │  │
│  │       │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░                  ░░░░░       │  │
│  │  -15% ┤                             ░░░░░          ░░░░░░░░░░░     │  │
│  │       │                                 ░░░░░░░░░░░░░░░░░░░░░░     │  │
│  │  -20% ┤                                                            │  │
│  │       Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  │       Max Drawdown: -12.5% (Mar 15 - Apr 22)                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  WIN/LOSS DISTRIBUTION (Histogram)                                      │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  40 ┤                                                              │  │
│  │     │                                                              │  │
│  │  30 ┤                  ███                                         │  │
│  │     │            ███   ███   ███                                   │  │
│  │  20 ┤      ███   ███   ███   ███   ███                            │  │
│  │     │ ███  ███   ███   ███   ███   ███  ███                       │  │
│  │  10 ┤ ███  ███   ███   ███   ███   ███  ███  ███                  │  │
│  │     │ ███  ███   ███   ███   ███   ███  ███  ███  ░░░  ░░░  ░░░  │  │
│  │   0 ┼────────────────────────────────────────────────────────────  │  │
│  │     -$500 -$300 -$100  $0  $100  $300  $500  $700  $900 $1100 ... │  │
│  │     Red = Losses (38 trades) │ Green = Wins (118 trades)          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Charts:**
- Portfolio Growth (area chart)
- Rolling Returns (multi-line)
- Drawdown Analysis (area chart)
- Win/Loss Distribution (histogram)
- Cumulative P/L (line chart)

---

### 4. **Strategy Analysis** (NEW)

**Purpose**: Compare performance across different trading strategies

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  STRATEGY ANALYSIS                         [Period: Last 12 Months ▼]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  STRATEGY COMPARISON (Performance Cards)                                 │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐  │
│  │  COVERED CALLS      │ │  NAKED PUTS         │ │  WHEEL STRATEGY  │  │
│  │  Total P/L: $5,240  │ │  Total P/L: $3,890  │ │  Total P/L: $890 │  │
│  │  Trades: 45         │ │  Trades: 32         │ │  Trades: 12      │  │
│  │  Win Rate: 85% 🏆   │ │  Win Rate: 72%      │ │  Win Rate: 67%   │  │
│  │  Avg P/L: +$116.44  │ │  Avg P/L: +$121.56  │ │  Avg P/L: +$74   │  │
│  │  Best: +$450        │ │  Best: +$680        │ │  Best: +$340     │  │
│  │  Worst: -$120       │ │  Worst: -$280       │ │  Worst: -$190    │  │
│  └─────────────────────┘ └─────────────────────┘ └──────────────────┘  │
│                                                                           │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐  │
│  │  0DTE OPTIONS       │ │  LONG STOCK         │ │  SWING TRADES    │  │
│  │  Total P/L: $650    │ │  Total P/L: $8,450  │ │  Total P/L: $120 │  │
│  │  Trades: 22         │ │  Trades: 28         │ │  Trades: 8       │  │
│  │  Win Rate: 64%      │ │  Win Rate: 71%      │ │  Win Rate: 50%   │  │
│  │  Avg P/L: +$29.55   │ │  Avg P/L: +$301.79  │ │  Avg P/L: +$15   │  │
│  │  Best: +$180        │ │  Best: +$1,850      │ │  Best: +$290     │  │
│  │  Worst: -$95        │ │  Worst: -$620       │ │  Worst: -$240    │  │
│  └─────────────────────┘ └─────────────────────┘ └──────────────────┘  │
│                                                                           │
│  CUMULATIVE P/L BY STRATEGY (Stacked Area Chart)                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ $20k ┤                                                  ▓▓▓▓▓▓▓▓▓  │  │
│  │      │                                              ▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │ $15k ┤                                          ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │      │                                      ▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓  │  │
│  │ $10k ┤                                  ▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓  │  │
│  │      │                              ▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓  │  │
│  │  $5k ┤                          ▓▓▓▓▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░▒▒▓  │  │
│  │      │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▓  │  │
│  │   $0 ┼──────────────────────────────────────────────────────────  │  │
│  │      Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  │      ░ 0DTE  ▒ Covered Calls  ▓ Long Stock                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  STRATEGY WIN RATE COMPARISON (Horizontal Bar Chart)                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Covered Calls    ████████████████████░░░░  85%                    │  │
│  │  Naked Puts       ██████████████░░░░░░░░░░  72%                    │  │
│  │  Long Stock       ██████████████░░░░░░░░░░  71%                    │  │
│  │  Wheel Strategy   █████████████░░░░░░░░░░░  67%                    │  │
│  │  0DTE Options     ████████████░░░░░░░░░░░░  64%                    │  │
│  │  Swing Trades     ██████████░░░░░░░░░░░░░░  50%                    │  │
│  │                   0%    20%   40%   60%   80%   100%               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  RISK-ADJUSTED RETURNS (Scatter Plot)                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                    ● Covered Calls                  │  │
│  │  High Return ┤              ● Naked Puts                           │  │
│  │              │                                                      │  │
│  │              │                      ● Long Stock                   │  │
│  │              │                                                      │  │
│  │  Med Return  ┤                              ● Wheel                │  │
│  │              │  ● 0DTE                                             │  │
│  │              │                  ● Swing                            │  │
│  │  Low Return  ┤                                                     │  │
│  │              └───────────────────────────────────                  │  │
│  │              Low Risk    Med Risk      High Risk                   │  │
│  │              (Sharpe Ratio / Risk-Adjusted Performance)            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Compare different trading strategies side-by-side
- Visualize cumulative P/L by strategy
- Risk-adjusted performance metrics
- Strategy-specific statistics

---

### 5. **Position Analysis** (NEW)

**Purpose**: Deep dive into current and historical positions

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  POSITION ANALYSIS                         [View: Current Positions ▼]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  TOP HOLDINGS (Current Positions)                                        │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────┐ │
│  │  #1 AAPL             │ │  #2 TSLA             │ │  #3 MSFT        │ │
│  │  300 shares          │ │  150 shares          │ │  200 shares     │ │
│  │  $43,500 (34.8%)     │ │  $31,500 (25.2%)     │ │  $25,200 (20%)  │ │
│  │  Cost Basis: $145.00 │ │  Cost Basis: $210.00 │ │  Cost: $126.00  │ │
│  │  Current: $154.30    │ │  Current: $228.40    │ │  Current: $134  │ │
│  │  Unrealized: +$2,790 │ │  Unrealized: +$2,760 │ │  Unrealized: +  │ │
│  └──────────────────────┘ └──────────────────────┘ └─────────────────┘ │
│                                                                           │
│  SECTOR ALLOCATION (Donut Chart)                                         │
│  ┌────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │                                 │  │  SECTOR BREAKDOWN           │  │
│  │       ┌─────────────┐           │  │  ──────────────────────     │  │
│  │       │ Technology  │           │  │  Technology:    45.2%       │  │
│  │       │   45.2%     │           │  │  Healthcare:    18.5%       │  │
│  │       │             │ Healthcare│  │  Financials:    15.8%       │  │
│  │       │             │  18.5%    │  │  Consumer:      12.3%       │  │
│  │       │             │           │  │  Energy:         5.2%       │  │
│  │       └─────────────┘           │  │  Other:          3.0%       │  │
│  │         Financials: 15.8%       │  │                             │  │
│  │                                 │  │  Risk Level: Moderate       │  │
│  └────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                           │
│  POSITION PERFORMANCE OVER TIME (Multi-Line Chart)                      │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ +50% ┤                                                   ─── AAPL  │  │
│  │      │                                                   ─── TSLA  │  │
│  │ +40% ┤                                               ╭───╯──MSFT   │  │
│  │      │                                           ╭───╯             │  │
│  │ +30% ┤                                       ╭───╯                 │  │
│  │      │                                   ╭───╯                     │  │
│  │ +20% ┤                               ╭───╯                         │  │
│  │      │                           ╭───╯                             │  │
│  │ +10% ┤ ──────────────────────────╯                                │  │
│  │      │                                                             │  │
│  │   0% ┼─────────────────────────────────────────────────────────   │  │
│  │      Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  POSITION CONCENTRATION RISK (Treemap)                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  ┌────────────────────┐┌──────────┐┌─────────┐                    │  │
│  │  │                    ││          ││         │                    │  │
│  │  │       AAPL         ││   TSLA   ││  MSFT   │                    │  │
│  │  │       34.8%        ││   25.2%  ││  20.1%  │                    │  │
│  │  │                    ││          ││         │                    │  │
│  │  └────────────────────┘└──────────┘└─────────┘                    │  │
│  │  ┌──────────┐┌──────┐┌─────┐┌────┐┌────┐                         │  │
│  │  │   NVDA   ││ GOOGL││ AMZN││META││Others                         │  │
│  │  │   8.5%   ││ 4.2% ││3.8% ││2.4%││1.0%                           │  │
│  │  └──────────┘└──────┘└─────┘└────┘└────┘                         │  │
│  │  ⚠️ Concentration Warning: Top 3 holdings = 80.1% of portfolio    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  HISTORICAL POSITION P/L (Table with Sparklines)                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Ticker │ Trades │ Total P/L │ Win Rate │ Trend (Sparkline)       │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │  AAPL   │   15   │  +$4,250  │   87%    │  ╱╲╱─╱──╱╲─              │  │
│  │  TSLA   │   12   │  +$3,180  │   75%    │  ╱─╲╱╲─╱╲╱              │  │
│  │  NVDA   │    8   │  +$2,890  │   88%    │  ─╱─╱──╱──              │  │
│  │  MSFT   │   10   │  +$1,940  │   70%    │  ╱╲─╱─╲─╱─              │  │
│  │  GOOGL  │    6   │  +$820    │   67%    │  ╱─╲╱─╱─╱               │  │
│  │  AMZN   │    5   │  -$340    │   40%    │  ╲─╲╱╲─╲                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Top holdings breakdown
- Sector allocation with risk assessment
- Position concentration analysis
- Historical performance by ticker
- Visual treemap of portfolio composition

---

### 6. **Closed Trades Report** (Enhanced Current)

**Purpose**: Detailed view of all closed positions with filters and analytics

**Enhancements to Current:**
- Add filters: Date range, ticker, strategy type, P/L range
- Add summary statistics at top
- Add export with customizable columns
- Add sparkline charts showing trade history
- Add "Replay" feature to show position evolution over time

---

## Visual Design Guidelines

### Color Scheme
- **Positive/Profit**: Green (#10B981) - for gains, wins
- **Negative/Loss**: Red (#EF4444) - for losses
- **Neutral**: Gray (#6B7280) - for neutral data
- **Primary**: Teal (#0D9488) - brand color for headings
- **Accent**: Gold (#F59E0B) - for highlights, important metrics
- **Background**: White/Light Gray - clean, professional

### Chart Library Recommendations
- **Chart.js** (already included in project via CDN)
  - Pros: Lightweight, responsive, good documentation
  - Best for: Line, bar, pie, doughnut charts
  
- **ApexCharts** (alternative)
  - Pros: More interactive features, better tooltips
  - Best for: Advanced charts, sparklines, treemaps

### Typography
- **Headings**: Bold, Teal color
- **Metrics**: Large, bold numbers with context
- **Charts**: Clear labels, legends, tooltips

### Layout Principles
1. **Card-based Design**: Each report section in a card
2. **Grid Layout**: 2-3 columns on desktop, stacked on mobile
3. **Responsive**: Mobile-friendly charts and tables
4. **Progressive Disclosure**: Summary → Details on click
5. **Visual Hierarchy**: Important metrics prominent, details accessible

---

## Navigation Implementation

### Menu Structure
```
Current Menu:
- Dashboard
- Accounts
- Companies
- Stock Trades
- Options Trades
- Daily Trade
- Reports          ← Current single page

Proposed Menu:
- Dashboard
- Accounts
- Companies  
- Stock Trades
- Options Trades
- Daily Trade
- Reports ▼        ← Dropdown or single page with tabs
  - Overview       ← New landing page
  - P/L Summary    ← Enhanced current
  - Performance    ← New charts page
  - Strategy       ← New analysis
  - Positions      ← New analysis
  - Closed Trades  ← Current, enhanced
```

### Tab-Based Alternative (Single Page)
```
REPORTS PAGE
[Overview] [P/L Summary] [Performance] [Strategy] [Positions] [Closed Trades]
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1)
1. ✅ Create Reports landing page with cards
2. ✅ Add Chart.js integration
3. ✅ Create basic portfolio value chart
4. ✅ Add monthly P/L bar chart
5. ✅ Enhance existing Closed Trades with filters

### Phase 2: Core Reports (Week 2)
6. ✅ Build P/L Summary with trends
7. ✅ Create Performance Charts page
8. ✅ Add sector allocation pie chart
9. ✅ Implement export functionality

### Phase 3: Advanced Analytics (Week 3)
10. ✅ Build Strategy Analysis page
11. ✅ Create Position Analysis page
12. ✅ Add risk metrics (Sharpe ratio, drawdown)
13. ✅ Implement sparklines and mini-charts

### Phase 4: Polish & Optimization (Week 4)
14. ✅ Mobile responsive design
15. ✅ Performance optimization
16. ✅ User testing and feedback
17. ✅ Documentation

---

## API Endpoints Required

### New Endpoints to Create:
```typescript
// Portfolio value history
GET /api/reports/portfolio-value?period=12m
Response: [{ date, value_cad, value_usd }]

// Monthly P/L breakdown
GET /api/reports/monthly-pl?year=2026
Response: [{ month, stock_pl, option_pl, daily_pl, total_pl }]

// Strategy performance
GET /api/reports/strategy-performance?period=12m
Response: [{ strategy, trades, total_pl, win_rate, avg_pl }]

// Sector allocation
GET /api/reports/sector-allocation
Response: [{ sector, value, percentage, tickers[] }]

// Top holdings
GET /api/reports/top-holdings?limit=10
Response: [{ ticker, shares, value, cost_basis, unrealized_pl }]

// Position history
GET /api/reports/position-history?ticker=AAPL
Response: [{ date, quantity, cost_basis, value }]

// Performance metrics
GET /api/reports/performance-metrics?period=12m
Response: { sharpe_ratio, max_drawdown, volatility, win_rate }
```

---

## Success Metrics

1. **User Engagement**: Time spent in Reports section increases
2. **Actionable Insights**: Users make trading decisions based on report data
3. **Visual Clarity**: Users can understand their portfolio at a glance
4. **Export Usage**: Reports are exported and shared
5. **Mobile Usage**: Reports accessible and useful on mobile devices

---

## Next Steps

1. **Review & Approve Wireframe**: Get stakeholder feedback
2. **Choose Implementation Approach**: Tabs vs separate pages
3. **Set Up Chart.js**: Install and configure charting library
4. **Build Backend APIs**: Create data endpoints for reports
5. **Implement Frontend**: Build UI components and charts
6. **Testing**: Ensure accuracy of calculations and charts
7. **Documentation**: Update user guide with Reports section

---

## Questions for Consideration

1. **Single page with tabs OR separate pages for each report?**
   - Tabs: Faster navigation, all in one place
   - Separate pages: Better for deep linking, cleaner URLs

2. **Default time period for charts?**
   - Last 12 months? YTD? All time?

3. **Mobile-first or desktop-first design?**
   - Most portfolio analysis done on desktop, but mobile viewing is important

4. **Real-time data or cached snapshots?**
   - Real-time: More accurate but slower
   - Cached: Faster but need refresh mechanism

5. **Export formats needed?**
   - PDF for printing/sharing
   - CSV for Excel analysis
   - JSON for programmatic access

---

This wireframe provides a comprehensive vision for a highly visual, professional reporting section that gives users deep insights into their portfolio performance.
