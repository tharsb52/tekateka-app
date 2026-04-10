#!/usr/bin/env python3
"""
TekaTeka New Backend Endpoints Test Suite
Tests the new purchases CRUD, sales update, and subscription endpoints
"""
import requests
import json
import sys
from typing import Dict, Any

# Backend URL from review request
BACKEND_URL = "https://low-data-shop.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class NewEndpointsTester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        self.purchase_id = None
        self.sale_id = None
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages with formatting"""
        print(f"[{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None) -> Dict[str, Any]:
        """Make HTTP request with proper error handling"""
        url = f"{API_BASE}{endpoint}"
        
        # Add auth header if token available
        if self.token:
            if not headers:
                headers = {}
            headers["Authorization"] = f"Bearer {self.token}"
            
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=headers)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            self.log(f"{method.upper()} {endpoint} -> {response.status_code}")
            
            # Try to parse JSON response
            try:
                result = response.json()
            except:
                result = {"text": response.text, "status_code": response.status_code}
                return result
                
            # Handle case where result is a list (like purchases/sales endpoints)
            if isinstance(result, list):
                return {"data": result, "status_code": response.status_code}
            else:
                result["status_code"] = response.status_code
                return result
            
        except requests.exceptions.RequestException as e:
            self.log(f"Request failed: {e}", "ERROR")
            return {"error": str(e), "status_code": 0}
    
    def test_phone_login(self) -> bool:
        """Step 1: Phone login to get JWT token"""
        self.log("=== STEP 1: Phone Login ===")
        
        data = {"phoneNumber": "+243999888777"}
        result = self.make_request("POST", "/auth/phone-login", data)
        
        if result.get("status_code") != 200:
            self.log(f"Phone login failed: {result}", "ERROR")
            return False
            
        if not result.get("success"):
            self.log(f"Phone login unsuccessful: {result}", "ERROR")
            return False
            
        if not result.get("token"):
            self.log("No token returned from phone login", "ERROR")
            return False
            
        self.token = result["token"]
        self.user_id = result.get("user", {}).get("id")
        
        self.log(f"✅ Phone login successful - Token obtained")
        return True
    
    def test_add_purchase(self) -> bool:
        """Step 2: Add a purchase"""
        self.log("=== STEP 2: Add Purchase ===")
        
        if not self.token:
            self.log("No token available for adding purchase", "ERROR")
            return False
            
        data = {
            "productName": "Farine",
            "supplier": "Fournisseur Congo",
            "quantity": 10,
            "unitPrice": 5.0,
            "totalCost": 50.0,
            "currency": "CDF"
        }
        
        result = self.make_request("POST", "/data/purchases", data)
        
        if result.get("status_code") != 200:
            self.log(f"Add purchase failed: {result}", "ERROR")
            return False
            
        if not result.get("id"):
            self.log("No purchase ID returned", "ERROR")
            return False
            
        self.purchase_id = result["id"]
        
        # Verify purchase data
        if result.get("productName") != "Farine":
            self.log("Purchase product name mismatch", "ERROR")
            return False
            
        if result.get("supplier") != "Fournisseur Congo":
            self.log("Purchase supplier mismatch", "ERROR")
            return False
            
        if result.get("quantity") != 10:
            self.log("Purchase quantity mismatch", "ERROR")
            return False
            
        self.log(f"✅ Purchase added successfully - ID: {self.purchase_id}")
        return True
    
    def test_get_purchases(self) -> bool:
        """Step 3: Get purchases to verify it appears"""
        self.log("=== STEP 3: Get Purchases ===")
        
        if not self.token:
            self.log("No token available for getting purchases", "ERROR")
            return False
            
        result = self.make_request("GET", "/data/purchases")
        
        if result.get("status_code") != 200:
            self.log(f"Get purchases failed: {result}", "ERROR")
            return False
            
        # Get the purchases list from the response
        purchases = result.get("data", [])
        
        if not isinstance(purchases, list):
            self.log(f"Purchases response is not a list: {type(purchases)}", "ERROR")
            return False
            
        # Check if our purchase is in the list
        farine_found = False
        for purchase in purchases:
            if (purchase.get("productName") == "Farine" and 
                purchase.get("supplier") == "Fournisseur Congo" and
                purchase.get("id") == self.purchase_id):
                farine_found = True
                break
                
        if not farine_found:
            self.log("Farine purchase not found in purchases list", "ERROR")
            return False
            
        self.log("✅ Purchase appears in purchases list")
        return True
    
    def test_update_purchase(self) -> bool:
        """Step 4: Update the purchase quantity to 20"""
        self.log("=== STEP 4: Update Purchase ===")
        
        if not self.token or not self.purchase_id:
            self.log("No token or purchase ID available for updating purchase", "ERROR")
            return False
            
        data = {"quantity": 20}
        
        result = self.make_request("PUT", f"/data/purchases/{self.purchase_id}", data)
        
        if result.get("status_code") != 200:
            self.log(f"Update purchase failed: {result}", "ERROR")
            return False
            
        # Verify the quantity was updated
        if result.get("quantity") != 20:
            self.log(f"Purchase quantity not updated correctly. Expected: 20, Got: {result.get('quantity')}", "ERROR")
            return False
            
        self.log("✅ Purchase quantity updated successfully to 20")
        return True
    
    def test_delete_purchase(self) -> bool:
        """Step 5: Delete the purchase"""
        self.log("=== STEP 5: Delete Purchase ===")
        
        if not self.token or not self.purchase_id:
            self.log("No token or purchase ID available for deleting purchase", "ERROR")
            return False
            
        result = self.make_request("DELETE", f"/data/purchases/{self.purchase_id}")
        
        if result.get("status_code") != 200:
            self.log(f"Delete purchase failed: {result}", "ERROR")
            return False
            
        if not result.get("success"):
            self.log("Delete purchase did not return success", "ERROR")
            return False
            
        self.log("✅ Purchase deleted successfully")
        return True
    
    def test_add_sale(self) -> bool:
        """Step 6: Add a sale"""
        self.log("=== STEP 6: Add Sale ===")
        
        if not self.token:
            self.log("No token available for adding sale", "ERROR")
            return False
            
        data = {
            "productId": "test",
            "productName": "Test Product",
            "quantity": 2,
            "total": 20.0,
            "paymentMethod": "cash",
            "currency": "USD"
        }
        
        result = self.make_request("POST", "/data/sales", data)
        
        if result.get("status_code") != 200:
            self.log(f"Add sale failed: {result}", "ERROR")
            return False
            
        if not result.get("id"):
            self.log("No sale ID returned", "ERROR")
            return False
            
        self.sale_id = result["id"]
        
        # Verify sale data
        if result.get("productName") != "Test Product":
            self.log("Sale product name mismatch", "ERROR")
            return False
            
        if result.get("quantity") != 2:
            self.log("Sale quantity mismatch", "ERROR")
            return False
            
        self.log(f"✅ Sale added successfully - ID: {self.sale_id}")
        return True
    
    def test_get_sales(self) -> bool:
        """Step 7: Get sales to find the sale ID"""
        self.log("=== STEP 7: Get Sales ===")
        
        if not self.token:
            self.log("No token available for getting sales", "ERROR")
            return False
            
        result = self.make_request("GET", "/data/sales")
        
        if result.get("status_code") != 200:
            self.log(f"Get sales failed: {result}", "ERROR")
            return False
            
        # Get the sales list from the response
        sales = result.get("data", [])
        
        if not isinstance(sales, list):
            self.log(f"Sales response is not a list: {type(sales)}", "ERROR")
            return False
            
        # Check if our sale is in the list
        test_sale_found = False
        for sale in sales:
            if (sale.get("productName") == "Test Product" and 
                sale.get("quantity") == 2 and
                sale.get("id") == self.sale_id):
                test_sale_found = True
                break
                
        if not test_sale_found:
            self.log("Test Product sale not found in sales list", "ERROR")
            return False
            
        self.log("✅ Sale appears in sales list")
        return True
    
    def test_update_sale(self) -> bool:
        """Step 8: Update the sale quantity to 5"""
        self.log("=== STEP 8: Update Sale ===")
        
        if not self.token or not self.sale_id:
            self.log("No token or sale ID available for updating sale", "ERROR")
            return False
            
        data = {"quantity": 5}
        
        result = self.make_request("PUT", f"/data/sales/{self.sale_id}", data)
        
        if result.get("status_code") != 200:
            self.log(f"Update sale failed: {result}", "ERROR")
            return False
            
        # Verify the quantity was updated
        if result.get("quantity") != 5:
            self.log(f"Sale quantity not updated correctly. Expected: 5, Got: {result.get('quantity')}", "ERROR")
            return False
            
        self.log("✅ Sale quantity updated successfully to 5")
        return True
    
    def test_subscribe(self) -> bool:
        """Step 9: Subscribe to monthly plan"""
        self.log("=== STEP 9: Subscribe to Monthly Plan ===")
        
        if not self.token:
            self.log("No token available for subscription", "ERROR")
            return False
            
        data = {"plan": "monthly"}
        
        result = self.make_request("POST", "/auth/subscribe", data)
        
        if result.get("status_code") != 200:
            self.log(f"Subscribe failed: {result}", "ERROR")
            return False
            
        if not result.get("success"):
            self.log("Subscribe did not return success", "ERROR")
            return False
            
        # Verify subscription data
        user = result.get("user", {})
        subscription = user.get("subscription", {})
        
        if subscription.get("plan") != "monthly":
            self.log(f"Subscription plan mismatch. Expected: monthly, Got: {subscription.get('plan')}", "ERROR")
            return False
            
        if subscription.get("status") != "active":
            self.log(f"Subscription status mismatch. Expected: active, Got: {subscription.get('status')}", "ERROR")
            return False
            
        self.log("✅ Monthly subscription activated successfully")
        return True
    
    def test_get_profile(self) -> bool:
        """Step 10: Get profile to verify subscription is active"""
        self.log("=== STEP 10: Get Profile ===")
        
        if not self.token:
            self.log("No token available for getting profile", "ERROR")
            return False
            
        result = self.make_request("GET", "/auth/profile")
        
        if result.get("status_code") != 200:
            self.log(f"Get profile failed: {result}", "ERROR")
            return False
            
        if not result.get("success"):
            self.log("Get profile did not return success", "ERROR")
            return False
            
        # Verify subscription is active
        user = result.get("user", {})
        subscription = user.get("subscription", {})
        
        if subscription.get("plan") != "monthly":
            self.log(f"Profile subscription plan mismatch. Expected: monthly, Got: {subscription.get('plan')}", "ERROR")
            return False
            
        if subscription.get("status") != "active":
            self.log(f"Profile subscription status mismatch. Expected: active, Got: {subscription.get('status')}", "ERROR")
            return False
            
        self.log("✅ Profile shows active monthly subscription")
        return True
    
    def run_all_tests(self) -> bool:
        """Run all tests in sequence"""
        self.log("🚀 Starting TekaTeka New Backend Endpoints Tests")
        self.log(f"Backend URL: {BACKEND_URL}")
        
        tests = [
            ("Phone Login", self.test_phone_login),
            ("Add Purchase", self.test_add_purchase),
            ("Get Purchases", self.test_get_purchases),
            ("Update Purchase", self.test_update_purchase),
            ("Delete Purchase", self.test_delete_purchase),
            ("Add Sale", self.test_add_sale),
            ("Get Sales", self.test_get_sales),
            ("Update Sale", self.test_update_sale),
            ("Subscribe Monthly", self.test_subscribe),
            ("Get Profile", self.test_get_profile),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
                    self.log(f"❌ {test_name} FAILED", "ERROR")
            except Exception as e:
                failed += 1
                self.log(f"❌ {test_name} FAILED with exception: {e}", "ERROR")
                import traceback
                self.log(f"Traceback: {traceback.format_exc()}", "ERROR")
            
            print()  # Add spacing between tests
        
        # Summary
        self.log("=" * 50)
        self.log(f"TEST SUMMARY: {passed} passed, {failed} failed")
        
        if failed == 0:
            self.log("🎉 ALL TESTS PASSED! New backend endpoints working perfectly!")
            return True
        else:
            self.log(f"⚠️  {failed} tests failed. Check logs above for details.")
            return False

if __name__ == "__main__":
    tester = NewEndpointsTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)