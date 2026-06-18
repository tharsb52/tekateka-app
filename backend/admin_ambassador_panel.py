"""
Admin Ambassador Management Web Interface
Accessible at /api/admin/ambassador-panel
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

AMBASSADOR_ADMIN_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TekaTeka - Gestion Ambassadeurs</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
.login-container{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.login-box{background:#1e293b;border-radius:20px;padding:40px;width:100%;max-width:400px;text-align:center}
.login-box h1{color:#f59e0b;margin-bottom:8px;font-size:24px}
.login-box p{color:#94a3b8;margin-bottom:24px;font-size:14px}
.login-box input{width:100%;padding:14px 16px;border-radius:12px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;margin-bottom:16px}
.login-box button{width:100%;padding:14px;border-radius:12px;border:none;background:#f59e0b;color:#0f172a;font-size:16px;font-weight:700;cursor:pointer}
.login-box button:hover{background:#d97706}
.app{display:none;padding:20px;max-width:1200px;margin:0 auto}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #334155}
.header h1{color:#f59e0b;font-size:22px}
.header .logout{background:#dc2626;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px}
.tabs{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.tab{padding:10px 20px;border-radius:10px;border:none;background:#1e293b;color:#94a3b8;cursor:pointer;font-size:14px;font-weight:600}
.tab.active{background:#f59e0b;color:#0f172a}
.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:20px}
.card h2{color:#fff;margin-bottom:16px;font-size:18px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:#1e293b;border-radius:12px;padding:20px;text-align:center}
.stat-card .value{font-size:32px;font-weight:bold;color:#f59e0b}
.stat-card .label{font-size:13px;color:#94a3b8;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;padding:10px 12px;color:#94a3b8;border-bottom:1px solid #334155;font-size:12px;text-transform:uppercase}
td{padding:10px 12px;border-bottom:1px solid #1e293b}
.badge{padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600}
.badge.active{background:rgba(16,185,129,0.2);color:#34d399}
.badge.blocked{background:rgba(239,68,68,0.2);color:#fca5a5}
.badge.unused{background:rgba(96,165,250,0.2);color:#60a5fa}
.badge.used{background:rgba(148,163,184,0.2);color:#94a3b8}
.form-row{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.form-row input,.form-row select{flex:1;min-width:150px;padding:12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:14px}
.btn{padding:12px 24px;border-radius:10px;border:none;font-weight:600;cursor:pointer;font-size:14px}
.btn-primary{background:#2563eb;color:#fff}
.btn-success{background:#059669;color:#fff}
.btn-danger{background:#dc2626;color:#fff}
.btn-warning{background:#f59e0b;color:#0f172a}
.btn:hover{opacity:0.85}
.msg{padding:12px;border-radius:10px;margin-bottom:16px;font-size:14px}
.msg.success{background:rgba(16,185,129,0.15);color:#34d399}
.msg.error{background:rgba(239,68,68,0.15);color:#fca5a5}
.code-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.code-chip{background:#0f172a;padding:6px 12px;border-radius:8px;font-family:monospace;font-size:13px;color:#60a5fa}
@media(max-width:600px){.form-row{flex-direction:column}.stats-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="login-container" id="loginSection">
  <div class="login-box">
    <div style="text-align:center;margin-bottom:12px"><div style="font-size:48px;font-weight:900;color:#f59e0b">TK</div></div>
    <h1>TekaTeka Admin</h1>
    <p>Gestion des Ambassadeurs & Codes</p>
    <div style="position:relative;margin-bottom:16px">
      <input type="password" id="adminPwd" placeholder="Mot de passe admin" onkeypress="if(event.key==='Enter')doLogin()" style="padding-right:50px;margin-bottom:0">
      <span onclick="toggleAdminPwd()" id="eyeBtn" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#94a3b8;cursor:pointer;font-size:22px;user-select:none">👁️</span>
    </div>
    <button onclick="doLogin()">Accéder</button>
    <p id="loginError" style="color:#fca5a5;margin-top:12px;display:none"></p>
  </div>
</div>

<div class="app" id="appSection">
  <div class="header">
    <h1><span style="color:#f59e0b;font-weight:900;margin-right:8px">TK</span> Gestion Ambassadeurs</h1>
    <button class="logout" onclick="doLogout()">Déconnexion</button>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="showTab('dashboard')">Dashboard</button>
    <button class="tab" onclick="showTab('ambassadors')">Ambassadeurs</button>
    <button class="tab" onclick="showTab('codes')">Générer Codes</button>
    <button class="tab" onclick="showTab('allcodes')">Tous les Codes</button>
    <button class="tab" onclick="showTab('sales')">Ventes</button>
  </div>

  <div id="content"></div>
</div>

<script>
const SESSION_KEY='tk_amb_admin_pw';
let adminPassword = sessionStorage.getItem(SESSION_KEY) || '';
let ambassadors = [];
let sales = [];
let pricingInfo = {};

async function doLogin() {
  const pwd = document.getElementById('adminPwd').value;
  if(!pwd){return}
  try {
    const res = await fetch('/api/admin/ambassadors/list', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({adminPassword: pwd})
    });
    if(!res.ok){
      document.getElementById('loginError').textContent='Mot de passe incorrect';
      document.getElementById('loginError').style.display='block';
      return;
    }
    adminPassword = pwd;
    sessionStorage.setItem(SESSION_KEY, pwd);
    ambassadors = await res.json();
    document.getElementById('loginSection').style.display='none';
    document.getElementById('appSection').style.display='block';
    showTab('dashboard');
  } catch(e) {
    document.getElementById('loginError').textContent='Erreur de connexion au serveur';
    document.getElementById('loginError').style.display='block';
  }
}

/**
 * Restore session on page load / F5 by re-validating the cached password
 * against the ambassadors list endpoint. If the validation succeeds we go
 * straight to the dashboard, otherwise we wipe the stale password and
 * show the login form.
 */
async function tryRestoreSession(){
  if(!adminPassword) return;
  try{
    const res = await fetch('/api/admin/ambassadors/list', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({adminPassword})
    });
    if(res.ok){
      ambassadors = await res.json();
      document.getElementById('loginSection').style.display='none';
      document.getElementById('appSection').style.display='block';
      showTab('dashboard');
      return;
    }
  }catch(e){}
  sessionStorage.removeItem(SESSION_KEY);
  adminPassword='';
}

function doLogout(){
  adminPassword='';
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('loginSection').style.display='flex';
  document.getElementById('appSection').style.display='none';
}

function toggleAdminPwd(){
  const inp=document.getElementById('adminPwd');
  const btn=document.getElementById('eyeBtn');
  if(inp.type==='password'){inp.type='text';btn.textContent='🙈';}
  else{inp.type='password';btn.textContent='👁️';}
}

async function showTab(tab){
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',
    ['dashboard','ambassadors','codes','allcodes','sales'][i]===tab));
  if(tab==='dashboard') await loadDashboard();
  else if(tab==='ambassadors') await loadAmbassadors();
  else if(tab==='codes') loadCodesForm();
  else if(tab==='allcodes') await loadAllCodes();
  else if(tab==='sales') await loadSales();
}

async function loadDashboard(){
  // Refresh data
  const [ambRes, priceRes, salesRes] = await Promise.all([
    fetch('/api/admin/ambassadors/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword})}),
    fetch('/api/admin/pricing-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword})}),
    fetch('/api/admin/ambassador-sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword})})
  ]);
  ambassadors = await ambRes.json();
  pricingInfo = await priceRes.json();
  sales = await salesRes.json();

  const totalSales = sales.length;
  const totalCommissions = sales.reduce((s,x)=>s+(x.commission||0),0);
  const totalRevenue = sales.reduce((s,x)=>s+(x.price||0),0);

  document.getElementById('content').innerHTML=`
    <div class="stats-grid">
      <div class="stat-card"><div class="value">${ambassadors.length}</div><div class="label">Ambassadeurs</div></div>
      <div class="stat-card"><div class="value">${totalSales}</div><div class="label">Ventes totales</div></div>
      <div class="stat-card"><div class="value">$${totalRevenue}</div><div class="label">Revenus</div></div>
      <div class="stat-card"><div class="value">$${totalCommissions}</div><div class="label">Commissions versées</div></div>
    </div>
    <div class="card">
      <h2>Tarification actuelle</h2>
      <p style="margin-bottom:12px;color:#94a3b8">Palier: <span class="badge active">${pricingInfo.currentTier==='early'?'PROMO (500 premiers)':'NORMAL'}</span> — ${pricingInfo.activeSubscriptions||0} abonnés actifs</p>
      <table>
        <thead><tr><th>Plan</th><th>Prix App</th><th>Prix Ambassadeur</th><th>Commission</th></tr></thead>
        <tbody>
          ${Object.entries(pricingInfo.pricing?.[pricingInfo.currentTier]||{}).map(([k,v])=>`
            <tr><td style="text-transform:capitalize">${k}</td><td>$${v.appPrice}</td><td>$${v.ambassadorPrice}</td><td style="color:#34d399">$${v.commission}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadAmbassadors(){
  const res = await fetch('/api/admin/ambassadors/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword})});
  ambassadors = await res.json();

  let html = `<div class="card"><h2>Créer un ambassadeur</h2>
    <div class="form-row">
      <input id="newName" placeholder="Nom complet">
      <input id="newEmail" placeholder="Email">
    </div>
    <div class="form-row">
      <input id="newCountry" placeholder="Pays">
      <input id="newCity" placeholder="Ville">
    </div>
    <div class="form-row">
      <input id="newPwd" placeholder="Mot de passe" type="text" autocomplete="off">
      <button class="btn" type="button" style="background:#475569;color:#fff" onclick="genPwd()">🎲 Générer</button>
      <button class="btn btn-success" onclick="createAmbassador()">Créer</button>
    </div>
    <div id="createMsg"></div>
  </div>`;

  html += `<div class="card"><h2>Liste des ambassadeurs (${ambassadors.length})</h2><table>
    <thead><tr><th>Nom</th><th>Email</th><th>Pays/Ville</th><th>Ventes</th><th>Codes</th><th>Statut</th><th>Actions</th></tr></thead>
    <tbody>${ambassadors.map(a=>`
      <tr>
        <td style="font-weight:600">${a.name}</td>
        <td style="color:#94a3b8">${a.email}</td>
        <td>${a.country}, ${a.city}</td>
        <td style="font-weight:700">${a.totalSales}</td>
        <td>${a.unusedCodes}/${a.totalCodes}</td>
        <td><span class="badge ${a.status}">${a.status==='active'?'Actif':'Bloqué'}</span></td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn" style="padding:6px 10px;font-size:12px;background:#2563eb;color:#fff" onclick="resetAmbassadorPwd('${a.id}','${a.name.replace(/'/g,"\\'")}')">🔑 MDP</button>
          <button class="btn ${a.status==='active'?'btn-danger':'btn-success'}" style="padding:6px 10px;font-size:12px" onclick="toggleAmbassador('${a.id}')">${a.status==='active'?'Bloquer':'Débloquer'}</button>
          <button class="btn btn-danger" style="padding:6px 10px;font-size:12px;background:#dc2626" onclick="deleteAmbassador('${a.id}','${a.name.replace(/'/g,"\\'")}')">🗑️ Suppr.</button>
        </td>
      </tr>
    `).join('')}</tbody></table></div>`;

  document.getElementById('content').innerHTML = html;
}

async function createAmbassador(){
  const name=document.getElementById('newName').value;
  const email=document.getElementById('newEmail').value;
  const country=document.getElementById('newCountry').value;
  const city=document.getElementById('newCity').value;
  const pwd=document.getElementById('newPwd').value;
  if(!name||!email||!pwd){document.getElementById('createMsg').innerHTML='<div class="msg error">Remplissez tous les champs</div>';return}
  
  const res=await fetch('/api/admin/ambassadors/create',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({adminPassword,name,email,country:country||'Congo',city:city||'Kinshasa',ambassadorPassword:pwd})});
  const data=await res.json();
  if(res.ok){
    document.getElementById('createMsg').innerHTML=`<div class="msg success">Ambassadeur "${name}" créé avec succès !<br><strong>Email: ${email}</strong><br><strong>Mot de passe: ${pwd}</strong><br><em>Notez-les maintenant, ils ne seront plus affichés.</em></div>`;
    document.getElementById('newName').value='';document.getElementById('newEmail').value='';
    document.getElementById('newPwd').value='';
    setTimeout(()=>loadAmbassadors(),3000);
  } else {
    document.getElementById('createMsg').innerHTML=`<div class="msg error">${data.detail||'Erreur'}</div>`;
  }
}

function genPwd(){
  const chars='ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out='';for(let i=0;i<10;i++) out+=chars.charAt(Math.floor(Math.random()*chars.length));
  document.getElementById('newPwd').value=out;
}

async function deleteAmbassador(id, name){
  if(!confirm('⚠️ Êtes-vous SÛR de vouloir supprimer "'+name+'" ?\\n\\nCela supprimera aussi tous ses codes NON utilisés.\\nLes codes déjà utilisés et les commissions seront conservés (historique).')){return;}
  const res=await fetch('/api/admin/ambassadors/delete',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({adminPassword,ambassadorId:id})});
  const data=await res.json();
  if(res.ok){
    alert('✅ Ambassadeur "'+name+'" supprimé.\\nCodes inutilisés supprimés : '+data.deletedCodes);
    loadAmbassadors();
  } else {
    alert('❌ Erreur : '+(data.detail||'Erreur inconnue'));
  }
}


async function resetAmbassadorPwd(id, name){
  const newPwd=prompt('Nouveau mot de passe pour '+name+' :\\n(laissez vide pour en générer un automatiquement)');
  if(newPwd===null) return;
  let finalPwd=newPwd.trim();
  if(!finalPwd){
    const chars='ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    for(let i=0;i<10;i++) finalPwd+=chars.charAt(Math.floor(Math.random()*chars.length));
  }
  if(finalPwd.length<6){alert('Le mot de passe doit faire au moins 6 caractères');return;}
  const res=await fetch('/api/admin/ambassadors/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({adminPassword,ambassadorId:id,newPassword:finalPwd})});
  const data=await res.json();
  if(res.ok){
    alert('✅ Mot de passe réinitialisé pour '+name+'\\n\\nNouveau mot de passe : '+finalPwd+'\\n\\nNotez-le immédiatement, il ne sera plus affiché.');
  } else {
    alert('❌ Erreur : '+(data.detail||'Erreur inconnue'));
  }
}

async function toggleAmbassador(id){
  await fetch('/api/admin/ambassadors/toggle-status',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({adminPassword,ambassadorId:id})});
  loadAmbassadors();
}

function loadCodesForm(){
  let options = ambassadors.map(a=>`<option value="${a.id}">${a.name} (${a.email})</option>`).join('');
  document.getElementById('content').innerHTML=`
    <div class="card">
      <h2>Générer des codes d'activation</h2>
      <div class="form-row">
        <select id="codeAmb"><option value="">-- Choisir l'ambassadeur --</option>${options}</select>
        <select id="codePlan">
          <option value="monthly">Mensuel (30j)</option>
          <option value="quarterly">Trimestriel (90j)</option>
          <option value="yearly">Annuel (365j)</option>
        </select>
      </div>
      <div class="form-row">
        <input id="codeCount" type="number" value="5" min="1" max="100" placeholder="Nombre de codes">
        <button class="btn btn-warning" onclick="generateCodes()">Générer les codes</button>
      </div>
      <div id="genMsg"></div>
      <div id="genCodes"></div>
    </div>
  `;
}

async function generateCodes(){
  const ambassadorId=document.getElementById('codeAmb').value;
  const plan=document.getElementById('codePlan').value;
  const count=parseInt(document.getElementById('codeCount').value)||5;
  if(!ambassadorId){document.getElementById('genMsg').innerHTML='<div class="msg error">Sélectionnez un ambassadeur</div>';return}

  document.getElementById('genMsg').innerHTML='<div class="msg" style="color:#94a3b8">Génération en cours...</div>';
  const res=await fetch('/api/admin/codes/generate',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({adminPassword,ambassadorId,plan,count})});
  const data=await res.json();
  if(res.ok){
    document.getElementById('genMsg').innerHTML=`<div class="msg success">${data.count} codes générés pour ${data.ambassador} (plan: ${data.plan}) — Expire: ${new Date(data.expiresAt).toLocaleDateString('fr-FR')}</div>`;
    document.getElementById('genCodes').innerHTML=`<div class="code-list">${data.codes.map(c=>`<span class="code-chip">${c}</span>`).join('')}</div>`;
  } else {
    document.getElementById('genMsg').innerHTML=`<div class="msg error">${data.detail||'Erreur'}</div>`;
  }
}

async function loadAllCodes(){
  document.getElementById('content').innerHTML='<div class="card"><h2>Tous les codes d\\'activation</h2><p style="color:#94a3b8">Chargement...</p></div>';
  const res=await fetch('/api/admin/codes/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword})});
  const codes=await res.json();
  const totalCount=codes.length;
  const usedCount=codes.filter(c=>c.status==='used').length;
  const unusedCount=codes.filter(c=>c.status==='unused').length;

  const byAmb={};
  codes.forEach(c=>{
    const key=c.ambassadorName||'?';
    if(!byAmb[key])byAmb[key]={total:0,used:0,unused:0,codes:[]};
    byAmb[key].total++;
    if(c.status==='used')byAmb[key].used++;else byAmb[key].unused++;
    byAmb[key].codes.push(c);
  });

  let groupHtml='';
  Object.entries(byAmb).forEach(([name,data])=>{
    groupHtml+=`<div style="margin-top:16px"><h3 style="color:#f59e0b;margin-bottom:8px;font-size:15px">${name} <span style="color:#94a3b8;font-weight:400;font-size:13px">(${data.total} codes • ${data.unused} libres • ${data.used} utilisés)</span></h3>
      <div class="code-list">${data.codes.map(c=>`<span class="code-chip" style="background:${c.status==='used'?'#374151':'#0f172a'};color:${c.status==='used'?'#9ca3af':'#60a5fa'}" title="${c.plan} | ${c.status} | exp: ${c.expiresAt?new Date(c.expiresAt).toLocaleDateString('fr-FR'):'?'}">${c.code}${c.status==='used'?' ✓':''}</span>`).join('')}</div></div>`;
  });

  document.getElementById('content').innerHTML=`
    <div class="stats-grid">
      <div class="stat-card"><div class="value">${totalCount}</div><div class="label">Total codes</div></div>
      <div class="stat-card"><div class="value" style="color:#60a5fa">${unusedCount}</div><div class="label">Disponibles</div></div>
      <div class="stat-card"><div class="value" style="color:#94a3b8">${usedCount}</div><div class="label">Utilisés</div></div>
    </div>
    <div class="card">
      <h2>Tous les codes d'activation (${totalCount})</h2>
      <p style="color:#94a3b8;font-size:13px;margin-bottom:12px">Cliquez sur un code pour le copier.</p>
      ${totalCount===0?'<p style="color:#64748b">Aucun code généré pour le moment</p>':`
      <table style="margin-bottom:24px">
        <thead><tr><th>Code</th><th>Ambassadeur</th><th>Plan</th><th>Statut</th><th>Généré</th><th>Expire</th></tr></thead>
        <tbody>${codes.map(c=>`
          <tr>
            <td style="font-family:monospace;font-weight:700;color:${c.status==='used'?'#94a3b8':'#60a5fa'};cursor:pointer" onclick="navigator.clipboard.writeText('${c.code}');this.style.color='#34d399';setTimeout(()=>this.style.color='${c.status==='used'?'#94a3b8':'#60a5fa'}',1500)" title="Cliquer pour copier">${c.code}</td>
            <td>${c.ambassadorName||'?'}</td>
            <td><span class="badge active" style="text-transform:capitalize">${c.plan}</span></td>
            <td><span class="badge ${c.status==='used'?'used':'unused'}">${c.status==='used'?'Utilisé':'Disponible'}</span></td>
            <td style="color:#94a3b8;font-size:12px">${c.assignedAt?new Date(c.assignedAt).toLocaleDateString('fr-FR'):'-'}</td>
            <td style="color:#94a3b8;font-size:12px">${c.expiresAt?new Date(c.expiresAt).toLocaleDateString('fr-FR'):'-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <h3 style="color:#fff;margin-bottom:8px;font-size:16px">Vue par ambassadeur</h3>
      ${groupHtml}
      `}
    </div>`;
}


async function loadSales(){
  const res=await fetch('/api/admin/ambassador-sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminPassword})});
  sales=await res.json();

  document.getElementById('content').innerHTML=`<div class="card"><h2>Historique des ventes (${sales.length})</h2>
    ${sales.length===0?'<p style="color:#64748b">Aucune vente encore</p>':`
    <table><thead><tr><th>Date</th><th>Ambassadeur</th><th>Client</th><th>Plan</th><th>Prix</th><th>Commission</th><th>Code</th></tr></thead>
    <tbody>${sales.map(s=>`
      <tr>
        <td style="color:#94a3b8;font-size:12px">${s.createdAt?new Date(s.createdAt).toLocaleDateString('fr-FR'):'-'}</td>
        <td style="font-weight:600">${s.ambassadorName||'-'}</td>
        <td>${s.clientName||s.clientPhone||'-'}</td>
        <td><span class="badge active">${s.plan}</span></td>
        <td>$${s.price||0}</td>
        <td style="color:#34d399;font-weight:700">$${s.commission||0}</td>
        <td style="font-family:monospace;font-size:12px;color:#60a5fa">${s.activationCode||'-'}</td>
      </tr>
    `).join('')}</tbody></table>`}
  </div>`;
}
// Auto-restore session on page load / F5 refresh
window.addEventListener('DOMContentLoaded',()=>{tryRestoreSession();});
</script>
</body>
</html>"""

@router.get("/admin/ambassador-panel", response_class=HTMLResponse)
async def ambassador_admin_panel():
    return AMBASSADOR_ADMIN_HTML

