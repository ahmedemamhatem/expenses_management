#!/bin/bash

# Real-time Sales Invoice Dashboard - Demo Simulation Runner
# This script runs the invoice generation simulation for video recording

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Invoice Dashboard Demo Simulator${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Default values
DURATION=${1:-5}  # Default: 5 minutes
INTERVAL=${2:-15} # Default: 15 seconds

echo -e "${GREEN}Duration:${NC} $DURATION minutes"
echo -e "${GREEN}Interval:${NC} $INTERVAL seconds"
echo ""
echo "Press Ctrl+C to stop the simulation"
echo ""

# Navigate to bench directory
cd /workspace/frappe-bench

# Run the simulation using bench execute
bench --site expenses_management.local execute expenses_management.scripts.create_demo_invoices.run_simulation --kwargs "{'duration_minutes': $DURATION, 'interval_seconds': $INTERVAL}"
