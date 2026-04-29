#!/usr/bin/env python3
"""
TekaTeka Ambassador System API Testing
Tests all 10 scenarios from the review request
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://low-data-shop.preview.emergentagent.com"
ADMIN_PASSWORD = "TekaTeka2025"

class AmbassadorAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.admin_password = ADMIN_PASSWORD
        self.ambassador_id = None
        self.ambassador_token = None
        self.client_user_id = None
        self.test_results = []
        
    def log_test(self, test_name, success, details=""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method.upper() == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            print(f"Request: {method} {endpoint}")
            print(f"Status: {response.status_code}")
            if data:
                print(f"Body: {json.dumps(data, indent=2)}")
            
            try:
                response_data = response.json()
                print(f"Response: {json.dumps(response_data, indent=2)}")
                return response.status_code, response_data
            except:
                print(f"Response (text): {response.text}")
                return response.status_code, response.text
                
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None, str(e)
    
    def test_1_create_ambassador(self):
        """Test 1: Create Ambassador (Admin)"""
        print("\n" + "="*50)
        print("TEST 1: Create Ambassador (Admin)")
        print("="*50)
        
        data = {
            "adminPassword": self.admin_password,
            "name": "Jean Ambassadeur",
            "country": "Congo",
            "city": "Kinshasa",
            "email": "ambassador@tekateka.com",
            "ambassadorPassword": "Ambassador2025"
        }
        
        status, response = self.make_request("POST", "/api/admin/ambassadors/create", data)
        
        if status == 200 and isinstance(response, dict) and response.get("success"):
            self.ambassador_id = response["ambassador"]["id"]
            self.log_test("Create Ambassador", True, f"Ambassador ID: {self.ambassador_id}")
            return True
        else:
            self.log_test("Create Ambassador", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_2_ambassador_login(self):
        """Test 2: Ambassador Login"""
        print("\n" + "="*50)
        print("TEST 2: Ambassador Login")
        print("="*50)
        
        data = {
            "email": "ambassador@tekateka.com",
            "password": "Ambassador2025"
        }
        
        status, response = self.make_request("POST", "/api/ambassador/login", data)
        
        if status == 200 and isinstance(response, dict) and "token" in response:
            self.ambassador_token = response["token"]
            self.log_test("Ambassador Login", True, f"Token received: {self.ambassador_token[:20]}...")
            return True
        else:
            self.log_test("Ambassador Login", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_3_generate_codes(self):
        """Test 3: Generate Codes (Admin)"""
        print("\n" + "="*50)
        print("TEST 3: Generate Codes (Admin)")
        print("="*50)
        
        if not self.ambassador_id:
            self.log_test("Generate Codes", False, "No ambassador ID available")
            return False
            
        data = {
            "adminPassword": self.admin_password,
            "ambassadorId": self.ambassador_id,
            "count": 5,
            "plan": "monthly"
        }
        
        status, response = self.make_request("POST", "/api/admin/codes/generate", data)
        
        if status == 200 and isinstance(response, dict) and response.get("success"):
            codes = response.get("codes", [])
            if len(codes) == 5:
                self.log_test("Generate Codes", True, f"Generated {len(codes)} codes")
                return True
            else:
                self.log_test("Generate Codes", False, f"Expected 5 codes, got {len(codes)}")
                return False
        else:
            self.log_test("Generate Codes", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_4_ambassador_dashboard(self):
        """Test 4: Ambassador Dashboard"""
        print("\n" + "="*50)
        print("TEST 4: Ambassador Dashboard")
        print("="*50)
        
        if not self.ambassador_token:
            self.log_test("Ambassador Dashboard", False, "No ambassador token available")
            return False
            
        data = {"token": self.ambassador_token}
        
        status, response = self.make_request("POST", "/api/ambassador/dashboard", data)
        
        if status == 200 and isinstance(response, dict):
            stats = response.get("stats", {})
            total_sales = stats.get("totalSales", -1)
            remaining_codes = stats.get("remainingCodes", -1)
            
            if total_sales == 0 and remaining_codes == 5:
                self.log_test("Ambassador Dashboard", True, f"totalSales: {total_sales}, remainingCodes: {remaining_codes}")
                return True
            else:
                self.log_test("Ambassador Dashboard", False, f"Expected totalSales: 0, remainingCodes: 5, got totalSales: {total_sales}, remainingCodes: {remaining_codes}")
                return False
        else:
            self.log_test("Ambassador Dashboard", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_5_ambassador_codes_list(self):
        """Test 5: Ambassador Codes List"""
        print("\n" + "="*50)
        print("TEST 5: Ambassador Codes List")
        print("="*50)
        
        if not self.ambassador_token:
            self.log_test("Ambassador Codes List", False, "No ambassador token available")
            return False
            
        data = {"token": self.ambassador_token}
        
        status, response = self.make_request("POST", "/api/ambassador/codes", data)
        
        if status == 200 and isinstance(response, list):
            if len(response) == 5:
                unused_codes = [code for code in response if code.get("status") == "unused"]
                if len(unused_codes) == 5:
                    self.log_test("Ambassador Codes List", True, f"5 codes with status: unused")
                    return True
                else:
                    self.log_test("Ambassador Codes List", False, f"Expected 5 unused codes, got {len(unused_codes)}")
                    return False
            else:
                self.log_test("Ambassador Codes List", False, f"Expected 5 codes, got {len(response)}")
                return False
        else:
            self.log_test("Ambassador Codes List", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_6_scan_client(self):
        """Test 6: Scan Client (First create a user via phone login)"""
        print("\n" + "="*50)
        print("TEST 6: Scan Client")
        print("="*50)
        
        # First create a user via phone login
        print("Creating user via phone login...")
        phone_data = {"phoneNumber": "+243111000111"}
        status, response = self.make_request("POST", "/api/auth/phone-login", phone_data)
        
        if status == 200 and isinstance(response, dict) and "user" in response:
            self.client_user_id = response["user"]["id"]
            print(f"User created with ID: {self.client_user_id}")
        else:
            self.log_test("Scan Client", False, f"Failed to create user. Status: {status}, Response: {response}")
            return False
        
        # Now scan the client
        if not self.ambassador_token:
            self.log_test("Scan Client", False, "No ambassador token available")
            return False
            
        data = {
            "token": self.ambassador_token,
            "clientUserId": self.client_user_id
        }
        
        status, response = self.make_request("POST", "/api/ambassador/scan-client", data)
        
        if status == 200 and isinstance(response, dict) and "client" in response:
            client = response["client"]
            if client.get("id") == self.client_user_id:
                self.log_test("Scan Client", True, f"Client info retrieved: {client.get('name', 'N/A')}")
                return True
            else:
                self.log_test("Scan Client", False, f"Client ID mismatch")
                return False
        else:
            self.log_test("Scan Client", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_7_activate_code(self):
        """Test 7: Activate Code for Client"""
        print("\n" + "="*50)
        print("TEST 7: Activate Code for Client")
        print("="*50)
        
        if not self.ambassador_token or not self.client_user_id:
            self.log_test("Activate Code", False, "Missing ambassador token or client user ID")
            return False
            
        data = {
            "token": self.ambassador_token,
            "clientUserId": self.client_user_id,
            "plan": "monthly"
        }
        
        status, response = self.make_request("POST", "/api/ambassador/activate", data)
        
        if status == 200 and isinstance(response, dict) and response.get("success"):
            commission = response.get("commission", 0)
            code = response.get("code", "")
            self.log_test("Activate Code", True, f"Code activated: {code}, Commission: {commission}")
            return True
        else:
            self.log_test("Activate Code", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_8_verify_dashboard_updated(self):
        """Test 8: Verify Dashboard Updated"""
        print("\n" + "="*50)
        print("TEST 8: Verify Dashboard Updated")
        print("="*50)
        
        if not self.ambassador_token:
            self.log_test("Verify Dashboard Updated", False, "No ambassador token available")
            return False
            
        data = {"token": self.ambassador_token}
        
        status, response = self.make_request("POST", "/api/ambassador/dashboard", data)
        
        if status == 200 and isinstance(response, dict):
            stats = response.get("stats", {})
            total_sales = stats.get("totalSales", -1)
            used_codes = stats.get("usedCodes", -1)
            remaining_codes = stats.get("remainingCodes", -1)
            
            if total_sales == 1 and used_codes == 1 and remaining_codes == 4:
                self.log_test("Verify Dashboard Updated", True, f"totalSales: {total_sales}, usedCodes: {used_codes}, remainingCodes: {remaining_codes}")
                return True
            else:
                self.log_test("Verify Dashboard Updated", False, f"Expected totalSales: 1, usedCodes: 1, remainingCodes: 4, got totalSales: {total_sales}, usedCodes: {used_codes}, remainingCodes: {remaining_codes}")
                return False
        else:
            self.log_test("Verify Dashboard Updated", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_9_list_ambassadors(self):
        """Test 9: List Ambassadors (Admin)"""
        print("\n" + "="*50)
        print("TEST 9: List Ambassadors (Admin)")
        print("="*50)
        
        data = {"adminPassword": self.admin_password}
        
        status, response = self.make_request("POST", "/api/admin/ambassadors/list", data)
        
        if status == 200 and isinstance(response, list):
            if len(response) >= 1:
                # Check if our ambassador is in the list
                found_ambassador = False
                for amb in response:
                    if amb.get("email") == "ambassador@tekateka.com":
                        found_ambassador = True
                        break
                
                if found_ambassador:
                    self.log_test("List Ambassadors", True, f"Found {len(response)} ambassadors including our test ambassador")
                    return True
                else:
                    self.log_test("List Ambassadors", False, "Test ambassador not found in list")
                    return False
            else:
                self.log_test("List Ambassadors", False, f"Expected at least 1 ambassador, got {len(response)}")
                return False
        else:
            self.log_test("List Ambassadors", False, f"Status: {status}, Response: {response}")
            return False
    
    def test_10_all_ambassador_sales(self):
        """Test 10: All Ambassador Sales (Admin)"""
        print("\n" + "="*50)
        print("TEST 10: All Ambassador Sales (Admin)")
        print("="*50)
        
        data = {"adminPassword": self.admin_password}
        
        status, response = self.make_request("POST", "/api/admin/ambassador-sales", data)
        
        if status == 200 and isinstance(response, list):
            if len(response) >= 1:
                # Check if our sale is in the list
                found_sale = False
                for sale in response:
                    if sale.get("ambassadorId") == self.ambassador_id and sale.get("clientUserId") == self.client_user_id:
                        found_sale = True
                        break
                
                if found_sale:
                    self.log_test("All Ambassador Sales", True, f"Found {len(response)} sales including our test sale")
                    return True
                else:
                    self.log_test("All Ambassador Sales", False, "Test sale not found in list")
                    return False
            else:
                self.log_test("All Ambassador Sales", False, f"Expected at least 1 sale, got {len(response)}")
                return False
        else:
            self.log_test("All Ambassador Sales", False, f"Status: {status}, Response: {response}")
            return False
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print("🚀 Starting TekaTeka Ambassador System API Tests")
        print(f"Base URL: {self.base_url}")
        print(f"Admin Password: {self.admin_password}")
        print("="*70)
        
        tests = [
            self.test_1_create_ambassador,
            self.test_2_ambassador_login,
            self.test_3_generate_codes,
            self.test_4_ambassador_dashboard,
            self.test_5_ambassador_codes_list,
            self.test_6_scan_client,
            self.test_7_activate_code,
            self.test_8_verify_dashboard_updated,
            self.test_9_list_ambassadors,
            self.test_10_all_ambassador_sales,
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ EXCEPTION in {test.__name__}: {e}")
                failed += 1
        
        print("\n" + "="*70)
        print("📊 TEST SUMMARY")
        print("="*70)
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Success Rate: {(passed/(passed+failed)*100):.1f}%")
        
        if failed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   ❌ {result['test']}: {result['details']}")
        
        return failed == 0

if __name__ == "__main__":
    tester = AmbassadorAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)