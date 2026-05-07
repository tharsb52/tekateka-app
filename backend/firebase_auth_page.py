"""
Firebase Phone Auth WebView Page
Serves an HTML page that handles Firebase Phone Auth with reCAPTCHA
The WebView in the React Native app loads this page
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

FIREBASE_AUTH_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TekaTeka - Vérification</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0f172a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.container{width:100%;max-width:400px;text-align:center}
h1{font-size:24px;color:#f59e0b;margin-bottom:8px}
p{color:#94a3b8;margin-bottom:24px;font-size:14px}
.step{display:none}
.step.active{display:block}
input{width:100%;padding:16px;border-radius:12px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:18px;text-align:center;margin-bottom:16px;letter-spacing:2px}
input::placeholder{color:#64748b;letter-spacing:normal}
button{width:100%;padding:16px;border-radius:12px;border:none;background:#f59e0b;color:#0f172a;font-size:16px;font-weight:700;cursor:pointer}
button:disabled{opacity:0.5}
.error{background:rgba(220,38,38,0.15);color:#fca5a5;padding:12px;border-radius:10px;margin-bottom:16px;font-size:14px;display:none}
.success{background:rgba(16,185,129,0.15);color:#34d399;padding:12px;border-radius:10px;margin-bottom:16px;font-size:14px;display:none}
.loading{color:#94a3b8;font-size:14px;margin-top:12px;display:none}
#recaptcha-container{margin:12px 0}
</style>
</head>
<body>
<div class="container">
  <h1>TekaTeka</h1>

  <!-- Step 1: Enter phone & send code -->
  <div id="step1" class="step active">
    <p id="phoneDisplay"></p>
    <div id="error1" class="error"></div>
    <div id="recaptcha-container"></div>
    <button id="sendBtn" onclick="sendCode()">Envoyer le code SMS</button>
    <div id="loading1" class="loading">Envoi du SMS en cours...</div>
  </div>

  <!-- Step 2: Enter OTP code -->
  <div id="step2" class="step">
    <p>Entrez le code reçu par SMS</p>
    <div id="error2" class="error"></div>
    <div id="success2" class="success"></div>
    <input type="tel" id="otpInput" maxlength="6" placeholder="Code SMS" autofocus>
    <button id="verifyBtn" onclick="verifyCode()">Vérifier</button>
    <div id="loading2" class="loading">Vérification...</div>
  </div>
</div>

<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script>
const firebaseConfig = {
  apiKey: "AIzaSyDfVtCcpe0c5ZJnVIfyKvHkN-o1sVlmPxk",
  authDomain: "tekateka-f8aac.firebaseapp.com",
  projectId: "tekateka-f8aac",
  storageBucket: "tekateka-f8aac.firebasestorage.app",
  messagingSenderId: "696848531104",
  appId: "1:696848531104:web:4e4fe2d6ebdeb76a89d3c5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
let confirmationResult = null;

// Get phone number from URL params
const params = new URLSearchParams(window.location.search);
const phoneNumber = params.get('phone') || '';
document.getElementById('phoneDisplay').textContent = 'Vérification du numéro ' + phoneNumber;

// Setup invisible reCAPTCHA
window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
  size: 'invisible',
  callback: function() {}
});

function sendMessage(data) {
  // Send to React Native WebView
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }
}

async function sendCode() {
  const btn = document.getElementById('sendBtn');
  const loading = document.getElementById('loading1');
  const error = document.getElementById('error1');
  
  btn.disabled = true;
  loading.style.display = 'block';
  error.style.display = 'none';
  
  try {
    confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier);
    // Show step 2
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
    sendMessage({type: 'codeSent', success: true});
  } catch (e) {
    error.textContent = getErrorMessage(e.code);
    error.style.display = 'block';
    btn.disabled = false;
    loading.style.display = 'none';
    sendMessage({type: 'error', message: getErrorMessage(e.code)});
    
    // Reset reCAPTCHA
    try { window.recaptchaVerifier.render().then(function(widgetId) { grecaptcha.reset(widgetId); }); } catch(ex) {}
  }
}

async function verifyCode() {
  const code = document.getElementById('otpInput').value.trim();
  if (!code || code.length < 4) return;
  
  const btn = document.getElementById('verifyBtn');
  const loading = document.getElementById('loading2');
  const error = document.getElementById('error2');
  const success = document.getElementById('success2');
  
  btn.disabled = true;
  loading.style.display = 'block';
  error.style.display = 'none';
  
  try {
    const result = await confirmationResult.confirm(code);
    const token = await result.user.getIdToken();
    success.textContent = 'Vérification réussie !';
    success.style.display = 'block';
    loading.style.display = 'none';
    
    sendMessage({
      type: 'verified',
      success: true,
      phone: phoneNumber,
      uid: result.user.uid,
      token: token
    });
  } catch (e) {
    error.textContent = getErrorMessage(e.code);
    error.style.display = 'block';
    btn.disabled = false;
    loading.style.display = 'none';
    sendMessage({type: 'verifyError', message: getErrorMessage(e.code)});
  }
}

function getErrorMessage(code) {
  switch(code) {
    case 'auth/invalid-phone-number': return 'Numéro de téléphone invalide';
    case 'auth/too-many-requests': return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'auth/invalid-verification-code': return 'Code incorrect. Vérifiez et réessayez.';
    case 'auth/code-expired': return 'Code expiré. Renvoyez un nouveau code.';
    case 'auth/network-request-failed': return 'Erreur réseau. Vérifiez votre connexion.';
    case 'auth/quota-exceeded': return 'Quota SMS dépassé.';
    default: return 'Erreur: ' + code;
  }
}

// Auto-send code on page load
setTimeout(sendCode, 1000);
</script>
</body>
</html>"""

@router.get("/auth/firebase-verify", response_class=HTMLResponse)
async def firebase_verify_page():
    return FIREBASE_AUTH_HTML
