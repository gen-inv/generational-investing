#!/bin/bash
# Test closing a trade with notes containing special characters

curl -X POST http://localhost:3000/api/daily-trades/1/close \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{
    "exit_time": "16:00:00",
    "exit_cost": 0,
    "close_commission": 0,
    "exit_reason": "EXPIRED_WORTHLESS",
    "notes": "extreme range as jobs report was better than expected, and I waited until most of the down move had happened."
  }'
