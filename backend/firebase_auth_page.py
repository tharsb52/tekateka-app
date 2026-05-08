"""
Firebase Phone Auth WebView Page
Serves an HTML page that handles Firebase Phone Auth with reCAPTCHA.
The WebView in the React Native app loads this page (visible briefly while sending the SMS).
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

FIREBASE_AUTH_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>TekaTeka - Vérification</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.container{width:100%;max-width:420px;text-align:center}
.logo{font-size:28px;font-weight:800;color:#f59e0b;margin-bottom:6px;letter-spacing:0.5px}
.tagline{color:#94a3b8;font-size:13px;margin-bottom:28px}
h2{font-size:17px;color:#fff;margin-bottom:8px;font-weight:600}
.phone{color:#f59e0b;font-size:18px;font-weight:700;margin-bottom:24px;letter-spacing:0.5px}
.step{display:none}
.step.active{display:block}
.captcha-wrap{display:flex;justify-content:center;margin:18px 0;min-height:78px}
.spinner{display:inline-block;width:36px;height:36px;border:4px solid #1e293b;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
input{width:100%;padding:16px;border-radius:12px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:22px;text-align:center;margin-bottom:14px;letter-spacing:6px;font-weight:700}
input::placeholder{color:#475569;letter-spacing:normal;font-weight:400;font-size:16px}
button{width:100%;padding:16px;border-radius:12px;border:none;background:#f59e0b;color:#0f172a;font-size:16px;font-weight:700;cursor:pointer;transition:opacity 0.2s}
button:disabled{opacity:0.5;cursor:not-allowed}
.error{background:rgba(220,38,38,0.15);color:#fca5a5;padding:12px;border-radius:10px;margin-bottom:14px;font-size:14px;display:none;text-align:left}
.success{background:rgba(16,185,129,0.15);color:#34d399;padding:12px;border-radius:10px;margin-bottom:14px;font-size:14px;display:none}
.info{color:#64748b;font-size:12px;margin-top:14px;line-height:1.5}
.loading-text{color:#94a3b8;font-size:14px;margin-top:14px}
</style>
</head>
<body>
<div class="container">
  <div class="logo">TekaTeka</div>
  <div class="tagline">Vérification de sécurité Firebase</div>

  <!-- Step 1: Sending SMS / reCAPTCHA -->
  <div id="step1" class="step active">
    <h2>Envoi du SMS</h2>
    <div class="phone" id="phoneDisplay"></div>
    <div id="error1" class="error"></div>

    <div id="initLoading">
      <div class="spinner"></div>
      <div class="loading-text">Initialisation...</div>
    </div>

    <div id="captchaSection" style="display:none">
      <div class="captcha-wrap">
        <div id="recaptcha-container"></div>
      </div>
      <div class="info">Cochez la case "Je ne suis pas un robot" si elle apparaît, puis le SMS sera envoyé automatiquement.</div>
    </div>

    <div id="sendingLoading" style="display:none">
      <div class="spinner"></div>
      <div class="loading-text">Envoi du SMS en cours...</div>
    </div>
  </div>

  <!-- Step 2: Enter OTP (only used as fallback if RN app doesn't handle it) -->
  <div id="step2" class="step">
    <h2>SMS envoyé !</h2>
    <div class="phone" id="phoneDisplay2"></div>
    <div class="success" style="display:block">Retournez à l'application TekaTeka pour entrer le code reçu.</div>
    <div id="error2" class="error"></div>
    <input type="tel" id="otpInput" maxlength="6" placeholder="Code SMS (6 chiffres)" inputmode="numeric" autocomplete="one-time-code">
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
auth.languageCode = 'fr';
let confirmationResult = null;

const params = new URLSearchParams(window.location.search);
const phoneNumber = params.get('phone') || '';
document.getElementById('phoneDisplay').textContent = phoneNumber;
document.getElementById('phoneDisplay2').textContent = phoneNumber;

function sendMessage(data) {
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
  } catch (e) { console.error('postMessage failed', e); }
}

function showError(msg) {
  const error = document.getElementById('error1');
  error.textContent = msg;
  error.style.display = 'block';
  document.getElementById('initLoading').style.display = 'none';
  document.getElementById('captchaSection').style.display = 'none';
  document.getElementById('sendingLoading').style.display = 'none';
}

async function startFlow() {
  if (!phoneNumber || phoneNumber.length < 5) {
    showError('Numéro de téléphone manquant');
    sendMessage({type: 'error', message: 'Numéro manquant'});
    return;
  }

  try {
    // Use a NORMAL (visible) reCAPTCHA — more reliable than invisible.
    // If Firebase trusts the session it will auto-resolve; otherwise user clicks.
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'normal',
      callback: function(token) {
        // Auto-send as soon as reCAPTCHA is solved
        actualSendCode();
      },
      'expired-callback': function() {
        showError('Vérification reCAPTCHA expirée. Rechargez la page.');
        sendMessage({type: 'error', message: 'reCAPTCHA expiré'});
      }
    });

    document.getElementById('initLoading').style.display = 'none';
    document.getElementById('captchaSection').style.display = 'block';

    await window.recaptchaVerifier.render();
  } catch (e) {
    console.error('Init error', e);
    showError('Erreur d\\'initialisation: ' + (e.message || e.code || 'inconnue'));
    sendMessage({type: 'error', message: 'Init: ' + (e.message || e.code || 'erreur')});
  }
}

async function actualSendCode() {
  document.getElementById('captchaSection').style.display = 'none';
  document.getElementById('sendingLoading').style.display = 'block';
  document.getElementById('error1').style.display = 'none';

  try {
    confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier);
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
    sendMessage({type: 'codeSent', success: true});
  } catch (e) {
    console.error('Send error', e);
    showError(getErrorMessage(e.code || e.message));
    sendMessage({type: 'error', message: getErrorMessage(e.code || e.message)});

    // Reset reCAPTCHA so user can try again
    try {
      window.recaptchaVerifier.render().then(function(widgetId) {
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset(widgetId);
      });
      document.getElementById('captchaSection').style.display = 'block';
    } catch(ex) {}
  }
}

async function verifyCode() {
  const code = (document.getElementById('otpInput').value || '').trim();
  if (!code || code.length < 4) {
    sendMessage({type: 'verifyError', message: 'Code trop court'});
    return;
  }

  if (!confirmationResult) {
    sendMessage({type: 'verifyError', message: 'Session expirée. Renvoyez un nouveau code.'});
    return;
  }

  try {
    const result = await confirmationResult.confirm(code);
    const token = await result.user.getIdToken();
    sendMessage({
      type: 'verified',
      success: true,
      phone: phoneNumber,
      uid: result.user.uid,
      token: token
    });
  } catch (e) {
    console.error('Verify error', e);
    sendMessage({type: 'verifyError', message: getErrorMessage(e.code || e.message)});
  }
}

function getErrorMessage(code) {
  if (!code) return 'Erreur inconnue';
  switch(code) {
    case 'auth/invalid-phone-number': return 'Numéro de téléphone invalide';
    case 'auth/missing-phone-number': return 'Numéro de téléphone manquant';
    case 'auth/too-many-requests': return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'auth/invalid-verification-code': return 'Code incorrect. Vérifiez et réessayez.';
    case 'auth/code-expired': return 'Code expiré. Renvoyez un nouveau code.';
    case 'auth/network-request-failed': return 'Erreur réseau. Vérifiez votre connexion.';
    case 'auth/quota-exceeded': return 'Quota SMS dépassé. Réessayez plus tard.';
    case 'auth/captcha-check-failed': return 'Vérification reCAPTCHA échouée. Réessayez.';
    case 'auth/invalid-app-credential': return 'reCAPTCHA expiré. Réessayez.';
    case 'auth/app-not-authorized': return 'Domaine non autorisé. Vérifiez la configuration Firebase.';
    case 'auth/missing-app-credential': return 'reCAPTCHA manquant.';
    default: return 'Erreur Firebase: ' + code;
  }
}

// Start the flow as soon as scripts are loaded
window.addEventListener('load', function() {
  setTimeout(startFlow, 200);
});
</script>
</body>
</html>"""

@router.get("/auth/firebase-verify", response_class=HTMLResponse)
async def firebase_verify_page():
    return FIREBASE_AUTH_HTML
