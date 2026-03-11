#!/bin/bash
# Quick test script for the 4 failing tests

echo "Testing Option Trade Update..."
timeout 30 npm test 2>&1 | grep -A 5 "should update an option trade"

echo "Testing Option Trade Close..."
timeout 30 npm test 2>&1 | grep -A 5 "should close an option trade with profit"

echo "Testing Option Trade Reopen..."
timeout 30 npm test 2>&1 | grep -A 5 "should reopen a closed option trade"

echo "Testing Account Snapshot..."
timeout 30 npm test 2>&1 | grep -A 5 "should create account snapshot"

echo "Done!"
