#!/usr/bin/env python3
"""
TekaTeka Payment Methods Test Suite
Tests the sales endpoint with different payment methods: cash, mobileMoney, card
"""
import requests
import json
import sys
from typing import Dict, Any

# Backend URL from frontend .env
BACKEND_URL = "https://low-data-shop.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class PaymentMethodsTester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        self.product_id = None
        self.sales_ids = []
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages with formatting"""
        print(f"[{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None, token: str = None) -> Dict[str, Any]:
        """Make HTTP request with proper error handling"""
        url = f"{API_BASE}{endpoint}"
        
        # Add auth header if token provided
        if token:
            if not headers:
                headers = {}
            headers["Authorization"] = f"Bearer {token}"
            
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
                
            # Handle case where result is a list (like products/sales endpoints)
            if isinstance(result, list):
                return {"data": result, "status_code": response.status_code}
            else:
                result["status_code"] = response.status_code
                return result
            
        except requests.exceptions.RequestException as e:
            self.log(f"Request failed: {e}", "ERROR")
            return {"error": str(e), "status_code": 0}
    
    def test_phone_login(self) -> bool:
        """Step 1: Login with phone number to get JWT token"""
        self.log("=== STEP 1: Phone Login ===")
        
        data = {"phoneNumber": "+243111000111"}
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
            
        if not result.get("user", {}).get("id"):
            self.log("No user ID returned from phone login", "ERROR")
            return False
            
        self.token = result["token"]
        self.user_id = result["user"]["id"]
        
        self.log(f"✅ Phone login successful - User ID: {self.user_id}")
        self.log(f"✅ JWT Token obtained: {self.token[:20]}...")
        return True
    
    def test_create_product(self) -> bool:
        """Step 2: Create a test product"""
        self.log("=== STEP 2: Create Test Product ===")
        
        if not self.token:
            self.log("No token available for creating product", "ERROR")
            return False
            
        data = {
            "name": "Test Product",
            "purchasePrice": 100,
            "salePrice": 200,
            "stock": 50,
            "category": "food"
        }
        
        result = self.make_request("POST", "/data/products", data, token=self.token)
        
        if result.get("status_code") != 200:
            self.log(f"Create product failed: {result}", "ERROR")
            return False
            
        if not result.get("id"):
            self.log("No product ID returned", "ERROR")
            return False
            
        self.product_id = result["id"]
        
        # Verify product data
        if result.get("name") != "Test Product":
            self.log("Product name mismatch", "ERROR")
            return False
            
        if result.get("purchasePrice") != 100:
            self.log("Product purchase price mismatch", "ERROR")
            return False
            
        if result.get("salePrice") != 200:
            self.log("Product sale price mismatch", "ERROR")
            return False
            
        if result.get("stock") != 50:
            self.log("Product stock mismatch", "ERROR")
            return False
            
        if result.get("category") != "food":
            self.log("Product category mismatch", "ERROR")
            return False
            
        self.log(f"✅ Test product created successfully - ID: {self.product_id}")
        return True
    
    def test_sale_with_payment_method(self, payment_method: str) -> bool:
        """Test sale creation with specific payment method"""
        self.log(f"=== STEP 3.{len(self.sales_ids)+1}: Test Sale with paymentMethod '{payment_method}' ===")
        
        if not self.token or not self.product_id:
            self.log("Token or product ID not available for creating sale", "ERROR")
            return False
            
        data = {
            "productId": self.product_id,
            "productName": "Test Product",
            "quantity": 1,
            "total": 200,
            "paymentMethod": payment_method,
            "currency": "USD"
        }
        
        result = self.make_request("POST", "/data/sales", data, token=self.token)
        
        if result.get("status_code") != 200:
            self.log(f"Create sale with {payment_method} failed: {result}", "ERROR")
            return False
            
        if not result.get("id"):
            self.log(f"No sale ID returned for {payment_method}", "ERROR")
            return False
            
        sale_id = result["id"]
        self.sales_ids.append(sale_id)
        
        # Verify sale data
        if result.get("productId") != self.product_id:
            self.log(f"Sale product ID mismatch for {payment_method}", "ERROR")
            return False
            
        if result.get("productName") != "Test Product":
            self.log(f"Sale product name mismatch for {payment_method}", "ERROR")
            return False
            
        if result.get("quantity") != 1:
            self.log(f"Sale quantity mismatch for {payment_method}", "ERROR")
            return False
            
        if result.get("total") != 200:
            self.log(f"Sale total mismatch for {payment_method}", "ERROR")
            return False
            
        if result.get("paymentMethod") != payment_method:
            self.log(f"Sale payment method mismatch for {payment_method}. Expected: {payment_method}, Got: {result.get('paymentMethod')}", "ERROR")
            return False
            
        if result.get("currency") != "USD":
            self.log(f"Sale currency mismatch for {payment_method}", "ERROR")
            return False
            
        self.log(f"✅ Sale with paymentMethod '{payment_method}' created successfully - ID: {sale_id}")
        return True
    
    def test_get_sales_verification(self) -> bool:
        """Step 6: Get all sales and verify payment methods are stored correctly"""
        self.log("=== STEP 6: Verify All Sales with Payment Methods ===")
        
        if not self.token:
            self.log("No token available for getting sales", "ERROR")
            return False
            
        result = self.make_request("GET", "/data/sales", token=self.token)
        
        if result.get("status_code") != 200:
            self.log(f"Get sales failed: {result}", "ERROR")
            return False
            
        # Get the sales list from the response
        sales = result.get("data", [])
        
        if not isinstance(sales, list):
            self.log(f"Sales response is not a list: {type(sales)}", "ERROR")
            return False
            
        # Find our test sales by product name and verify payment methods
        test_sales = [sale for sale in sales if sale.get("productName") == "Test Product"]
        
        if len(test_sales) < 3:
            self.log(f"Expected at least 3 test sales, found {len(test_sales)}", "ERROR")
            return False
            
        # Check for each payment method
        payment_methods_found = set()
        for sale in test_sales:
            payment_method = sale.get("paymentMethod")
            if payment_method:
                payment_methods_found.add(payment_method)
                self.log(f"✅ Found sale with paymentMethod: {payment_method}")
                
                # Verify paymentMethod field is present and not None/empty
                if not payment_method:
                    self.log(f"PaymentMethod field is empty or None in sale: {sale.get('id')}", "ERROR")
                    return False
            else:
                self.log(f"PaymentMethod field missing in sale: {sale.get('id')}", "ERROR")
                return False
        
        # Verify all three payment methods are present
        expected_methods = {"cash", "mobileMoney", "card"}
        if not expected_methods.issubset(payment_methods_found):
            missing = expected_methods - payment_methods_found
            self.log(f"Missing payment methods: {missing}", "ERROR")
            return False
            
        self.log(f"✅ All 3 sales verified with correct paymentMethod values: {sorted(payment_methods_found)}")
        return True
    
    def run_payment_methods_test(self) -> bool:
        """Run the complete payment methods test suite"""
        self.log("🚀 Starting TekaTeka Payment Methods Test Suite")
        self.log(f"Backend URL: {BACKEND_URL}")
        self.log("Testing sales endpoint with payment methods: cash, mobileMoney, card")
        
        # Step 1: Login
        if not self.test_phone_login():
            return False
            
        # Step 2: Create test product
        if not self.test_create_product():
            return False
            
        # Steps 3-5: Test sales with different payment methods
        payment_methods = ["cash", "mobileMoney", "card"]
        for payment_method in payment_methods:
            if not self.test_sale_with_payment_method(payment_method):
                return False
                
        # Step 6: Verify all sales are stored correctly
        if not self.test_get_sales_verification():
            return False
            
        # Summary
        self.log("=" * 60)
        self.log("🎉 ALL PAYMENT METHODS TESTS PASSED!")
        self.log(f"✅ Successfully tested {len(payment_methods)} payment methods")
        self.log(f"✅ Created {len(self.sales_ids)} sales with different payment methods")
        self.log("✅ Verified paymentMethod field is present in all sale responses")
        self.log("✅ Backend accepts and stores all payment methods correctly")
        
        return True

if __name__ == "__main__":
    tester = PaymentMethodsTester()
    success = tester.run_payment_methods_test()
    sys.exit(0 if success else 1)