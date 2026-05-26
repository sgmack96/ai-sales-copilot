#!/bin/bash

# Test script for AI Sales Co-Pilot
# Run this while `wrangler dev` is running

API_URL="http://localhost:8787/api/v1/copilot"

echo "=== Test 1: Research Agent ==="
echo "Request: Research Stripe"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-001",
    "message": "Research Stripe"
  }' | jq .

echo ""
echo "=== Test 2: Health Check ==="
curl -X GET "http://localhost:8787/health" | jq .

echo ""
echo "=== Test 3: Session History ==="
curl -X GET "http://localhost:8787/session/test-session-001" | jq .
