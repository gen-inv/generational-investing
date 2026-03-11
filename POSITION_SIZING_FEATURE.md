# Account-Based Position Sizing Feature

## Overview
Added a new position sizing method to the Daily Trade Configuration that calculates contract sizes based on account balance, alongside the existing profit-based method.

## Implementation Summary

### 1. Database Changes
**Migration**: `migrations/0020_add_account_based_position_sizing.sql`

Added three new columns to `daily_trade_config` table:
- `enable_position_sizing` (INTEGER DEFAULT 0) - Master toggle for calculated position sizing
- `position_sizing_type` (TEXT DEFAULT 'profit') - Type selector: 'profit' or 'account'
- `account_max_loss_percent` (DECIMAL(5,2) DEFAULT 4.00) - Max loss % for account-based sizing

### 2. Backend API Updates

#### GET `/api/daily-trade/config`
Default response now includes:
```json
{
  "enable_position_sizing": false,
  "position_sizing_type": "profit",
  "account_max_loss_percent": 4.00,
  // ... other existing fields
}
```

#### POST `/api/daily-trade/config`
Accepts and saves all three new fields along with existing configuration.

#### POST `/api/daily-trade/config/reset`
Reset response includes the new fields with default values.

### 3. Frontend UI

#### Master Toggle
- Toggle to enable/disable calculated position sizing
- When disabled, hides all sizing configuration
- Located in Risk Management section

#### Type Selector
- Radio buttons for "Profit-Based" vs "Account-Based"
- Visual icons and descriptions for each type
- Only visible when master toggle is enabled

#### Profit-Based Config (existing)
- **Rolling Profit Window**: Number of recent trades to analyze
- **Formula**: `Contracts = floor(Total Profit / (Strike Width × 100))`
- Capped at Max Contract Limit

#### Account-Based Config (new)
- **Max Loss % of Account Balance**: Default 4.00%
- **Formula**: `Contracts = floor((Balance × Max Loss %) / (Strike Width × 100))`
- Capped at Max Contract Limit

### 4. JavaScript Functions

#### `togglePositionSizing()`
- Shows/hides the entire position sizing configuration section
- Called when master toggle changes state
- Initializes sizing type display when enabled

#### `toggleSizingType()`
- Shows profit-based config when "profit" is selected
- Shows account-based config when "account" is selected
- Hides the non-selected configuration
- Called when type selector changes

#### `loadDailyTradeConfig()`
Enhanced to:
- Load and set the master toggle state
- Select the appropriate radio button for sizing type
- Load account-based config values
- Initialize UI state correctly on page load

#### `saveDailyTradeConfig()`
Enhanced to:
- Save master toggle state
- Save selected sizing type
- Save account-based config values
- Submit all fields to backend API

## Usage

### Enable Calculated Position Sizing
1. Navigate to Daily Trade Configuration (gear icon)
2. Locate "Risk Management & Position Sizing" section
3. Toggle "Enable Calculated Position Sizing" ON
4. Configuration section will appear

### Choose Sizing Method

#### Option A: Profit-Based (existing method)
1. Select "Profit-Based" radio button
2. Set "Rolling Profit Window" (default: 50 trades)
3. Formula calculates contracts based on recent trade profits
4. Best for: Traders who want to scale up after profitable runs

#### Option B: Account-Based (new method)
1. Select "Account-Based" radio button
2. Set "Max Loss % of Account Balance" (default: 4.00%)
3. Formula calculates contracts based on account size and max acceptable loss
4. Best for: Risk management based on capital preservation

### Both Methods
- **Respect Max Contract Limit**: Both calculations are capped at your configured maximum
- **Strike Width**: Both use your configured strike width in calculations
- **Dynamic**: Recalculates automatically when conditions change

## Testing

All 93 regression tests pass with the new feature:
```bash
Test Files  1 passed (1)
Tests       93 passed (93)
Duration    2.95s
```

No breaking changes to existing functionality.

## Example Scenarios

### Profit-Based Sizing
```
Rolling Window: Last 50 trades
Total Profit: $5,000
Strike Width: 5 points
Max Contract Limit: 25

Calculation:
Contracts = floor(5000 / (5 × 100)) = floor(10) = 10 contracts
Result: 10 contracts (under limit of 25)
```

### Account-Based Sizing
```
Account Balance: $50,000
Max Loss %: 4.00%
Strike Width: 5 points
Max Contract Limit: 25

Calculation:
Max Loss Amount = $50,000 × 0.04 = $2,000
Max Risk Per Spread = 5 × 100 = $500
Contracts = floor(2000 / 500) = floor(4) = 4 contracts
Result: 4 contracts (under limit of 25)
```

## Configuration Persistence

All settings are:
- Saved to database (`daily_trade_config` table)
- User-specific (each user has their own configuration)
- Loaded automatically on page refresh
- Reset to defaults via "Reset Configuration" button

## Future Enhancements

Potential improvements:
1. Real-time contract calculation preview
2. Historical sizing analysis
3. Hybrid sizing method (combine both approaches)
4. Per-strategy sizing rules
5. Account balance auto-detection
6. Risk/reward ratio calculator

## Commit Information

**Commit**: f81e981
**Message**: "Add account-based position sizing to daily trade config"
**Date**: 2026-03-11
**Tests**: ✅ All 93 tests passing

## Deployment

**Live Application**: https://3000-imi5lx8i4w7yx1t3dzzid-18e660f9.sandbox.novita.ai

To deploy the new feature:
1. Apply database migration: `npm run db:migrate:local` (local) or `npm run db:migrate:prod` (production)
2. Build application: `npm run build`
3. Deploy: `npm run deploy` (or `npm run deploy:prod` for production)

## Support

For questions or issues with this feature:
1. Check the UI tooltips (info icons) for inline help
2. Review this documentation
3. Test with small values first
4. Monitor results and adjust as needed
