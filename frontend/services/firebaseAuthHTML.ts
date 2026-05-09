/**
 * Firebase Phone Auth HTML page — served inline via WebView.
 *
 * Why inline (not from backend):
 *  - Loading from a custom backend domain (e.g. *.preview.emergentagent.com) returns 403
 *    because Firebase Auth blocks requests originating from non-authorized domains.
 *  - By using `source={{ html, baseUrl: 'https://<project>.firebaseapp.com' }}`,
 *    the WebView treats the page origin as the Firebase domain, which is automatically
 *    authorized and avoids reCAPTCHA / Cloudflare blocking.
 *
 * The page handles:
 *  1. Initialize Firebase, render visible reCAPTCHA
 *  2. After user solves reCAPTCHA → send SMS via signInWithPhoneNumber
 *  3. Receive OTP via injectJavaScript() and verify
 *  4. Communicate with React Native via window.ReactNativeWebView.postMessage
 */

export const FIREBASE_PROJECT_ID = 'tekateka-f8aac';
export const FIREBASE_AUTH_BASE_URL = `https://${FIREBASE_PROJECT_ID}.firebaseapp.com`;

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDfVtCcpe0c5ZJnVIfyKvHkN-o1sVlmPxk',
  authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: '696848531104',
  appId: '1:696848531104:web:4e4fe2d6ebdeb76a89d3c5',
};

export function buildFirebaseAuthHTML(phoneNumber: string): string {
  const safePhone = (phoneNumber || '').replace(/[^+0-9]/g, '');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>TekaTeka - Vérification</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px}
.container{width:100%;max-width:420px;text-align:center}
.logo{font-size:28px;font-weight:800;color:#f59e0b;margin-bottom:6px;letter-spacing:0.5px}
.tagline{color:#94a3b8;font-size:13px;margin-bottom:24px}
h2{font-size:17px;color:#fff;margin-bottom:8px;font-weight:600}
.phone{color:#f59e0b;font-size:18px;font-weight:700;margin-bottom:18px;letter-spacing:0.5px}
.captcha-wrap{display:flex;justify-content:center;margin:18px 0;min-height:78px}
.spinner{display:inline-block;width:36px;height:36px;border:4px solid #1e293b;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.error{background:rgba(220,38,38,0.15);color:#fca5a5;padding:12px;border-radius:10px;margin-bottom:14px;font-size:14px;display:none;text-align:left}
.success{background:rgba(16,185,129,0.15);color:#34d399;padding:12px;border-radius:10px;margin-bottom:14px;font-size:14px;display:none}
.info{color:#64748b;font-size:12px;margin-top:14px;line-height:1.5}
.loading-text{color:#94a3b8;font-size:14px;margin-top:14px}
</style>
</head>
<body>
<div class="container">
  <div class="logo">TekaTeka</div>
  <div class="tagline">Vérification de sécurité</div>
  <h2 id="status">Préparation...</h2>
  <div class="phone" id="phoneDisplay">${safePhone}</div>
  <div id="error1" class="error"></div>
  <div id="success1" class="success"></div>

  <div id="initLoading">
    <div class="spinner"></div>
    <div class="loading-text">Initialisation Firebase...</div>
  </div>

  <div id="captchaSection" style="display:none">
    <div class="captcha-wrap">
      <div id="recaptcha-container"></div>
    </div>
    <div class="info">Cochez "Je ne suis pas un robot". Le SMS sera envoyé immédiatement après.</div>
  </div>

  <div id="sendingLoading" style="display:none">
    <div class="spinner"></div>
    <div class="loading-text">Envoi du SMS en cours...</div>
  </div>

  <div id="sentInfo" style="display:none">
    <div class="success" style="display:block">SMS envoyé ! Retournez à l'application pour entrer le code.</div>
  </div>

  <input type="hidden" id="otpInput">
</div>

<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script>
const firebaseConfig = ${JSON.stringify(FIREBASE_CONFIG)};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
auth.languageCode = 'fr';

const phoneNumber = ${JSON.stringify(safePhone)};
let confirmationResult = null;

function postMsg(data) {
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
  } catch (e) {}
}

function showError(msg) {
  document.getElementById('initLoading').style.display = 'none';
  document.getElementById('captchaSection').style.display = 'none';
  document.getElementById('sendingLoading').style.display = 'none';
  document.getElementById('sentInfo').style.display = 'none';
  const error = document.getElementById('error1');
  error.textContent = msg;
  error.style.display = 'block';
  document.getElementById('status').textContent = 'Erreur';
}

function getErrorMessage(code, fallback) {
  if (!code) return fallback || 'Erreur inconnue';
  switch(code) {
    case 'auth/invalid-phone-number': return 'Numéro de téléphone invalide';
    case 'auth/missing-phone-number': return 'Numéro de téléphone manquant';
    case 'auth/too-many-requests': return 'Trop de tentatives. Réessayez dans 10 minutes.';
    case 'auth/invalid-verification-code': return 'Code incorrect. Vérifiez et réessayez.';
    case 'auth/code-expired': return 'Code expiré. Renvoyez un nouveau code.';
    case 'auth/network-request-failed': return 'Erreur réseau. Vérifiez votre connexion.';
    case 'auth/quota-exceeded': return 'Quota SMS dépassé. Réessayez plus tard.';
    case 'auth/captcha-check-failed': return 'reCAPTCHA invalide. Réessayez.';
    case 'auth/invalid-app-credential': return 'reCAPTCHA expiré. Réessayez.';
    case 'auth/app-not-authorized': return 'App non autorisée. Vérifiez la config Firebase.';
    case 'auth/missing-app-credential': return 'reCAPTCHA manquant.';
    case 'auth/operation-not-allowed': return 'Phone Auth non activé dans Firebase.';
    default: return (fallback || 'Erreur') + ' (' + code + ')';
  }
}

async function startFlow() {
  if (!phoneNumber || phoneNumber.length < 5) {
    showError('Numéro de téléphone manquant');
    postMsg({type: 'error', message: 'Numéro manquant'});
    return;
  }
  document.getElementById('status').textContent = 'Vérification de sécurité';
  try {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'normal',
      callback: function() { actualSendCode(); },
      'expired-callback': function() {
        showError('reCAPTCHA expiré. Rechargez l\\'écran et réessayez.');
        postMsg({type: 'error', message: 'reCAPTCHA expiré'});
      }
    });
    document.getElementById('initLoading').style.display = 'none';
    document.getElementById('captchaSection').style.display = 'block';
    await window.recaptchaVerifier.render();
    postMsg({type: 'ready'});
  } catch (e) {
    const msg = getErrorMessage(e.code, e.message);
    showError(msg);
    postMsg({type: 'error', message: msg});
  }
}

async function actualSendCode() {
  document.getElementById('captchaSection').style.display = 'none';
  document.getElementById('sendingLoading').style.display = 'block';
  document.getElementById('error1').style.display = 'none';
  document.getElementById('status').textContent = 'Envoi du SMS';
  try {
    confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier);
    document.getElementById('sendingLoading').style.display = 'none';
    document.getElementById('sentInfo').style.display = 'block';
    document.getElementById('status').textContent = 'SMS envoyé !';
    postMsg({type: 'codeSent', success: true});
  } catch (e) {
    const msg = getErrorMessage(e.code, e.message);
    showError(msg);
    postMsg({type: 'error', message: msg});
    try {
      window.recaptchaVerifier.render().then(function(widgetId) {
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset(widgetId);
      });
      document.getElementById('captchaSection').style.display = 'block';
      document.getElementById('error1').style.display = 'block';
    } catch(ex) {}
  }
}

async function verifyCode() {
  const code = (document.getElementById('otpInput').value || '').trim();
  if (!code || code.length < 4) {
    postMsg({type: 'verifyError', message: 'Code trop court'});
    return;
  }
  if (!confirmationResult) {
    postMsg({type: 'verifyError', message: 'Session expirée. Renvoyez un nouveau code.'});
    return;
  }
  try {
    const result = await confirmationResult.confirm(code);
    const token = await result.user.getIdToken();
    postMsg({
      type: 'verified',
      success: true,
      phone: phoneNumber,
      uid: result.user.uid,
      token: token
    });
  } catch (e) {
    postMsg({type: 'verifyError', message: getErrorMessage(e.code, e.message)});
  }
}

window.verifyCode = verifyCode;

window.addEventListener('load', function() { setTimeout(startFlow, 200); });
</script>
</body>
</html>`;
}
