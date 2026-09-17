#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Counter for tests
TESTS_RUN=0
TESTS_PASSED=0

# Test function
run_test() {
    local command=$1
    local description=$2
    ((TESTS_RUN++))
    
    echo -n "Testing $description... "
    
    # Run command and capture both stdout and stderr
    output=$(./quick-red.py "$command" 2>&1)
    exit_code=$?
    
    # Check if command executed successfully
    if [ $exit_code -eq 0 ] && [ ! -z "$output" ]; then
        echo -e "${GREEN}PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}FAILED${NC}"
        echo "Command: ./quick-red.py $command"
        echo "Exit code: $exit_code"
        echo "Output: $output"
    fi
}

# Print header
echo "=== Quick-Red Functional Test Suite ==="
echo "Testing read-only commands..."
echo

# Basic information commands
run_test "realm" "realm information"
run_test "nodes" "node listing"
run_test "clusters" "cluster listing"
run_test "tenants" "tenant information"

# Network-related commands
run_test "network" "network interface details"
run_test "control-ips" "control plane IPs"
run_test "hsn-ips" "high-speed network IPs"

# Storage-related commands
run_test "drives" "drive listing"
run_test "drive-summary" "drive summary"
run_test "drives-by-node" "drives by node distribution"

# S3-related commands
run_test "s3" "S3 access information"

# Other safe commands
run_test "swagger" "Swagger UI URL generation"
run_test "fox" "ASCII art display"

# Print summary
echo
echo "=== Test Summary ==="
echo "Total tests run: $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $(($TESTS_RUN - $TESTS_PASSED))"

# Exit with failure if any tests failed
if [ $TESTS_PASSED -ne $TESTS_RUN ]; then
    exit 1
fi

exit 0