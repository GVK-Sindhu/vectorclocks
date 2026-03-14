#!/bin/bash

# Multi-Region Incident Management - Partition Simulation Script

US_URL="http://region-us:3000"
EU_URL="http://region-eu:3000"

echo "--------------------------------------------------"
echo "Step 1: Create a new incident in US region"
echo "--------------------------------------------------"
CREATE_RES=$(curl -s -X POST $US_URL/incidents \
  -H "Content-Type: application/json" \
  -d '{"title": "Database Connectivity Issue", "description": "Primary DB is slow", "severity": "HIGH"}')

INCIDENT_ID=$(echo $CREATE_RES | jq -r '.id')
echo "Created Incident ID: $INCIDENT_ID"
echo "Initial Vector Clock (US): $(echo $CREATE_RES | jq -c '.vector_clock')"

echo ""
echo "Waiting for replication to EU (approx 6 seconds)..."
sleep 6

echo "--------------------------------------------------"
echo "Step 2: Verify incident exists in EU region"
echo "--------------------------------------------------"
EU_RES=$(curl -s $EU_URL/incidents/$INCIDENT_ID)
echo "Vector Clock in EU: $(echo $EU_RES | jq -c '.vector_clock')"

echo ""
echo "--------------------------------------------------"
echo "Step 3: Simulate Concurrent Updates (Partition)"
echo "--------------------------------------------------"
echo "Updating incident in US..."
US_VC=$(echo $EU_RES | jq -c '.vector_clock')
UPDATE_US=$(curl -s -X PUT $US_URL/incidents/$INCIDENT_ID \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"ACKNOWLEDGED\", \"vector_clock\": $US_VC}")
echo "New VC (US): $(echo $UPDATE_US | jq -c '.vector_clock')"

echo "Updating incident in EU concurrently..."
UPDATE_EU=$(curl -s -X PUT $EU_URL/incidents/$INCIDENT_ID \
  -H "Content-Type: application/json" \
  -d "{\"assigned_team\": \"SRE-EU\", \"vector_clock\": $US_VC}")
echo "New VC (EU): $(echo $UPDATE_EU | jq -c '.vector_clock')"

echo ""
echo "--------------------------------------------------"
echo "Step 4: Manually Trigger Replication to Detect Conflict"
echo "--------------------------------------------------"
echo "Replicating US state to EU..."
# We send the US version to EU's internal replication endpoint
curl -s -X POST $EU_URL/internal/replicate \
  -H "Content-Type: application/json" \
  -d "$UPDATE_US"

echo "Replication complete."

echo ""
echo "--------------------------------------------------"
echo "Step 5: Verify Conflict Flag in EU"
echo "--------------------------------------------------"
FINAL_RES=$(curl -s $EU_URL/incidents/$INCIDENT_ID)
echo "Final State in EU:"
echo "$FINAL_RES" | jq .

CONFLICT_FLAG=$(echo $FINAL_RES | jq -r '.version_conflict')

if [ "$CONFLICT_FLAG" == "true" ]; then
  echo ""
  echo "SUCCESS: Version conflict detected and flagged!"
else
  echo ""
  echo "FAILURE: Conflict flag not set."
  exit 1
fi

echo "--------------------------------------------------"
echo "Step 6: Resolve Conflict"
echo "--------------------------------------------------"
RESOLVE_RES=$(curl -s -X POST $EU_URL/incidents/$INCIDENT_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{"status": "RESOLVED", "assigned_team": "Global-SRE"}')

echo "Resolved State in EU:"
echo "$RESOLVE_RES" | jq .
echo "--------------------------------------------------"
