#!/usr/bin/env python3
"""
TekaTeka Backend API Testing Script
Tests all backend endpoints for functionality and response format validation.
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any

# Backend URL from frontend environment
BACKEND_URL = "https://low-data-shop.preview.emergentagent.com"

class BackendTester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.timeout = 30
        self.test_results = []
        
    def log_test(self, endpoint: str, status: str, details: str, response_data: Any = None):
        """Log test results"""
        result = {
            "endpoint": endpoint,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status_emoji = "✅" if status == "PASS" else "❌"
        print(f"{status_emoji} {endpoint}: {details}")
        if response_data and status == "PASS":
            print(f"   Response: {json.dumps(response_data, indent=2)}")
        print()

    def test_health_endpoint(self):
        """Test GET /api/health endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/api/health")
            
            if response.status_code == 200:
                data = response.json()
                expected_keys = {"status", "database"}
                
                if all(key in data for key in expected_keys):
                    if data.get("status") == "healthy" and data.get("database") == "connected":
                        self.log_test("/api/health", "PASS", 
                                    "Health check returned correct format and healthy status", data)
                    else:
                        self.log_test("/api/health", "FAIL", 
                                    f"Health check returned unexpected values: {data}", data)
                else:
                    self.log_test("/api/health", "FAIL", 
                                f"Missing required keys. Expected {expected_keys}, got {data.keys()}", data)
            else:
                self.log_test("/api/health", "FAIL", 
                            f"Expected 200 OK, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_test("/api/health", "FAIL", f"Request failed: {str(e)}")

    def test_root_endpoint(self):
        """Test GET /api/ endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/api/")
            
            if response.status_code == 200:
                data = response.json()
                expected_message = "Hello World"
                
                if data.get("message") == expected_message:
                    self.log_test("/api/", "PASS", 
                                "Root endpoint returned correct message", data)
                else:
                    self.log_test("/api/", "FAIL", 
                                f"Expected message '{expected_message}', got: {data}", data)
            else:
                self.log_test("/api/", "FAIL", 
                            f"Expected 200 OK, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_test("/api/", "FAIL", f"Request failed: {str(e)}")

    def test_analytics_endpoint(self):
        """Test GET /api/reports/analytics endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/api/reports/analytics")
            
            if response.status_code == 200:
                data = response.json()
                expected_keys = {
                    "total_users", "new_users_this_week", "countries", 
                    "total_revenue", "revenue_growth", "active_users"
                }
                
                if all(key in data for key in expected_keys):
                    # Validate data types
                    validation_errors = []
                    
                    if not isinstance(data.get("total_users"), int):
                        validation_errors.append("total_users should be int")
                    if not isinstance(data.get("new_users_this_week"), int):
                        validation_errors.append("new_users_this_week should be int")
                    if not isinstance(data.get("countries"), dict):
                        validation_errors.append("countries should be dict")
                    if not isinstance(data.get("total_revenue"), (int, float)):
                        validation_errors.append("total_revenue should be number")
                    if not isinstance(data.get("revenue_growth"), (int, float)):
                        validation_errors.append("revenue_growth should be number")
                    if not isinstance(data.get("active_users"), int):
                        validation_errors.append("active_users should be int")
                    
                    if validation_errors:
                        self.log_test("/api/reports/analytics", "FAIL", 
                                    f"Data type validation errors: {validation_errors}", data)
                    else:
                        self.log_test("/api/reports/analytics", "PASS", 
                                    "Analytics endpoint returned correct format and data types", data)
                else:
                    missing_keys = expected_keys - set(data.keys())
                    self.log_test("/api/reports/analytics", "FAIL", 
                                f"Missing required keys: {missing_keys}. Got: {list(data.keys())}", data)
            else:
                self.log_test("/api/reports/analytics", "FAIL", 
                            f"Expected 200 OK, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_test("/api/reports/analytics", "FAIL", f"Request failed: {str(e)}")

    def test_status_endpoint_with_pagination(self):
        """Test GET /api/status with pagination parameters"""
        try:
            # Test with specified parameters
            response = self.session.get(f"{self.base_url}/api/status?limit=10&skip=0")
            
            if response.status_code == 200:
                data = response.json()
                
                if isinstance(data, list):
                    # Check if we got at most 10 items (respecting limit)
                    if len(data) <= 10:
                        # Validate structure of status check items if any exist
                        if data:  # If there are items
                            first_item = data[0]
                            expected_keys = {"id", "client_name", "timestamp"}
                            
                            if all(key in first_item for key in expected_keys):
                                self.log_test("/api/status", "PASS", 
                                            f"Status endpoint returned {len(data)} items with correct structure", 
                                            {"count": len(data), "sample": first_item})
                            else:
                                missing_keys = expected_keys - set(first_item.keys())
                                self.log_test("/api/status", "FAIL", 
                                            f"Status items missing keys: {missing_keys}", first_item)
                        else:
                            self.log_test("/api/status", "PASS", 
                                        "Status endpoint returned empty list (no data yet)", data)
                    else:
                        self.log_test("/api/status", "FAIL", 
                                    f"Expected max 10 items, got {len(data)}", {"count": len(data)})
                else:
                    self.log_test("/api/status", "FAIL", 
                                f"Expected list response, got: {type(data)}", data)
            else:
                self.log_test("/api/status", "FAIL", 
                            f"Expected 200 OK, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_test("/api/status", "FAIL", f"Request failed: {str(e)}")

    def test_status_endpoint_create(self):
        """Test POST /api/status to create a status check"""
        try:
            test_data = {
                "client_name": "TekaTeka Mobile App"
            }
            
            response = self.session.post(
                f"{self.base_url}/api/status", 
                json=test_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                expected_keys = {"id", "client_name", "timestamp"}
                
                if all(key in data for key in expected_keys):
                    if data.get("client_name") == test_data["client_name"]:
                        self.log_test("POST /api/status", "PASS", 
                                    "Status check created successfully", data)
                    else:
                        self.log_test("POST /api/status", "FAIL", 
                                    f"Client name mismatch. Expected: {test_data['client_name']}, got: {data.get('client_name')}", data)
                else:
                    missing_keys = expected_keys - set(data.keys())
                    self.log_test("POST /api/status", "FAIL", 
                                f"Created status missing keys: {missing_keys}", data)
            else:
                self.log_test("POST /api/status", "FAIL", 
                            f"Expected 200 OK, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_test("POST /api/status", "FAIL", f"Request failed: {str(e)}")

    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting TekaTeka Backend API Tests")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        print()
        
        # Test all endpoints
        self.test_health_endpoint()
        self.test_root_endpoint()
        self.test_analytics_endpoint()
        self.test_status_endpoint_with_pagination()
        self.test_status_endpoint_create()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["status"] == "PASS")
        failed = sum(1 for result in self.test_results if result["status"] == "FAIL")
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {failed}/{total}")
        print()
        
        if failed > 0:
            print("🔍 FAILED TESTS:")
            for result in self.test_results:
                if result["status"] == "FAIL":
                    print(f"   • {result['endpoint']}: {result['details']}")
            print()
        
        return failed == 0

def main():
    """Main test execution"""
    tester = BackendTester(BACKEND_URL)
    success = tester.run_all_tests()
    
    # Save detailed results
    with open("/app/backend_test_results.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "backend_url": BACKEND_URL,
            "summary": {
                "total_tests": len(tester.test_results),
                "passed": sum(1 for r in tester.test_results if r["status"] == "PASS"),
                "failed": sum(1 for r in tester.test_results if r["status"] == "FAIL")
            },
            "results": tester.test_results
        }, f, indent=2)
    
    print(f"📄 Detailed results saved to: /app/backend_test_results.json")
    
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()