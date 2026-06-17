# Script to add account filtering to monthly income endpoint

queries = [
    # Stock transactions (closed P/L)
    ("st.user_id", "sh.account_id"),
    # Covered calls (option_trades)
    ("ot.user_id", "ot.account_id"),
    # Dividends (cost_basis_adjustments via stock_holdings)
    ("cba.user_id", "sh.account_id"),
    # Option trades (direct)
    ("user_id", "account_id"),
    # Daily trades
    ("user_id", "account_id"),
]

print("Add account filtering:")
print("1. Get accountId from query: const accountId = c.req.query('account_id')")
print("2. For each query add account filter and conditional binding")
print("")
print("Stock queries (9): Add 'AND sh.account_id = ?' if accountId")
print("Option queries (3): Add 'AND account_id = ?' if accountId")
print("Daily trades (1): Add 'AND account_id = ?' if accountId")
