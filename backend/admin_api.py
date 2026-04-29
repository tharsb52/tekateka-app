"""
Admin Backoffice API for TekaTeka
Provides dashboard analytics, user management, and troubleshooting tools
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "TekaTeka@Admin2025!")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()


@router.post("/admin/change-password")
async def change_admin_password(request: Request):
    """Change admin password."""
    global ADMIN_PASSWORD
    body = await request.json()
    current = body.get("currentPassword", "")
    new_pw = body.get("newPassword", "")
    if current != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect")
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 6 caractères")
    ADMIN_PASSWORD = new_pw
    # Persist to .env
    try:
        env_path = ROOT_DIR / '.env'
        lines = env_path.read_text().splitlines()
        new_lines = []
        found = False
        for line in lines:
            if line.startswith("ADMIN_PASSWORD"):
                new_lines.append(f"ADMIN_PASSWORD={new_pw}")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"ADMIN_PASSWORD={new_pw}")
        env_path.write_text("\n".join(new_lines) + "\n")
    except Exception as e:
        logger.warning(f"Could not persist password to .env: {e}")
    return {"success": True}


def verify_admin(password: str = Header(None, alias="X-Admin-Password"),
                 admin_pass: str = Header(None, alias="admin-password")):
    """Verify admin password from header or query."""
    pw = password or admin_pass
    if not pw or pw != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Accès refusé")
    return True


@router.get("/admin", response_class=HTMLResponse)
async def admin_dashboard():
    """Serve the admin backoffice HTML page."""
    return ADMIN_HTML


@router.post("/admin/login")
async def admin_login(request: Request):
    """Validate admin password and return success."""
    body = await request.json()
    pw = body.get("password", "")
    if pw != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return {"success": True}


@router.post("/admin/stats")
async def admin_stats(request: Request):
    """Global stats for the admin dashboard."""
    body = await request.json()
    if body.get("password") != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Accès refusé")
    users = await db.users.find().to_list(10000)
    all_sales = await db.sales.find().to_list(50000)
    all_expenses = await db.expenses.find().to_list(50000)
    all_debts = await db.debts.find().to_list(50000)
    all_products = await db.products.find().to_list(50000)

    total_revenue = sum(s.get("total", 0) for s in all_sales)
    total_expenses = sum(e.get("amount", 0) for e in all_expenses)
    unpaid_debts = [d for d in all_debts if not d.get("isPaid")]
    total_debt = sum(d.get("amount", 0) for d in unpaid_debts)
    total_stock_value = sum(p.get("purchasePrice", 0) * p.get("stock", 0) for p in all_products)
    low_stock = [p for p in all_products if 0 < p.get("stock", 0) < 5]

    # Per-user breakdown
    user_stats = []
    for u in users:
        uid = str(u["_id"])
        u_sales = [s for s in all_sales if s.get("userId") == uid]
        u_expenses = [e for e in all_expenses if e.get("userId") == uid]
        u_debts = [d for d in unpaid_debts if d.get("userId") == uid]
        u_products = [p for p in all_products if p.get("userId") == uid]
        u_revenue = sum(s.get("total", 0) for s in u_sales)
        u_expense = sum(e.get("amount", 0) for e in u_expenses)
        u_stock_val = sum(p.get("purchasePrice", 0) * p.get("stock", 0) for p in u_products)

        user_stats.append({
            "id": uid,
            "phone": u.get("phoneNumber", ""),
            "email": u.get("email", ""),
            "username": u.get("username", ""),
            "currency": u.get("currency", "USD"),
            "subscription": u.get("subscription", {}),
            "createdAt": u.get("createdAt", ""),
            "revenue": u_revenue,
            "expenses": u_expense,
            "profit": u_revenue - u_expense,
            "unpaidDebts": sum(d.get("amount", 0) for d in u_debts),
            "debtors": [{"name": d.get("debtorName", ""), "amount": d.get("amount", 0), "currency": d.get("currency", "USD")} for d in u_debts],
            "productsCount": len(u_products),
            "salesCount": len(u_sales),
            "stockValue": u_stock_val,
        })

    user_stats.sort(key=lambda x: x["revenue"], reverse=True)

    # 7-day trend
    trends = []
    for i in range(6, -1, -1):
        day = datetime.utcnow() - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        day_sales = sum(
            s.get("total", 0) for s in all_sales
            if (s.get("createdAt") or "").startswith(day_str) or (s.get("date") or "").startswith(day_str)
        )
        trends.append({"date": day_str, "label": day.strftime("%a %d"), "revenue": day_sales})

    return {
        "totalUsers": len(users),
        "totalRevenue": total_revenue,
        "totalExpenses": total_expenses,
        "netProfit": total_revenue - total_expenses,
        "totalUnpaidDebt": total_debt,
        "unpaidDebtors": len(unpaid_debts),
        "totalStockValue": total_stock_value,
        "lowStockProducts": len(low_stock),
        "totalProducts": len(all_products),
        "totalSales": len(all_sales),
        "users": user_stats,
        "trends": trends,
    }


@router.post("/admin/users")
async def admin_users(request: Request):
    """List all users with details."""
    body = await request.json()
    if body.get("password") != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Accès refusé")
    users = await db.users.find().to_list(10000)
    result = []
    for u in users:
        result.append({
            "id": str(u["_id"]),
            "phone": u.get("phoneNumber", ""),
            "email": u.get("email"),
            "username": u.get("username"),
            "currency": u.get("currency", "USD"),
            "language": u.get("language", "fr"),
            "subscription": u.get("subscription", {}),
            "hasPassword": bool(u.get("passwordHash")),
            "createdAt": u.get("createdAt", ""),
        })
    return result


@router.post("/admin/user/{user_id}")
async def admin_user_detail(user_id: str, request: Request):
    """Get detailed data for a specific user."""
    body = await request.json()
    if body.get("password") != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Accès refusé")
    products = await db.products.find({"userId": user_id}).to_list(5000)
    sales = await db.sales.find({"userId": user_id}).sort("createdAt", -1).to_list(5000)
    expenses = await db.expenses.find({"userId": user_id}).to_list(5000)
    debts = await db.debts.find({"userId": user_id}).to_list(5000)

    def ser(doc):
        d = {}
        for k, v in doc.items():
            if k == "_id":
                d["id"] = str(v)
            elif isinstance(v, ObjectId):
                d[k] = str(v)
            else:
                d[k] = v
        return d

    return {
        "products": [ser(p) for p in products],
        "sales": [ser(s) for s in sales],
        "expenses": [ser(e) for e in expenses],
        "debts": [ser(d) for d in debts],
    }


ADMIN_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TekaTeka - Backoffice Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
.login-page{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f172a,#1e293b)}
.login-box{background:#1e293b;border-radius:20px;padding:40px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid #334155}
.login-box h1{text-align:center;font-size:28px;margin-bottom:8px;color:#60a5fa}
.login-box p{text-align:center;color:#94a3b8;margin-bottom:24px;font-size:14px}
.login-box input{width:100%;padding:14px 16px;border-radius:12px;border:2px solid #334155;background:#0f172a;color:#e2e8f0;font-size:16px;margin-bottom:16px;outline:none}
.login-box input:focus{border-color:#3b82f6}
.login-box button{width:100%;padding:14px;border-radius:12px;border:none;background:#3b82f6;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
.login-box button:hover{background:#2563eb}
.login-error{color:#f87171;text-align:center;font-size:14px;margin-bottom:12px;display:none}
.dashboard{display:none;padding:20px;max-width:1200px;margin:0 auto}
.dash-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.dash-header h1{font-size:24px;color:#60a5fa}
.dash-header .logout{background:#334155;border:none;color:#94a3b8;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px}
.dash-header .chg-pw{background:#1e3a5f;border:none;color:#60a5fa;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;margin-right:8px}
.pw-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center}
.pw-modal.show{display:flex}
.pw-box{background:#1e293b;border-radius:16px;padding:28px;width:360px;border:1px solid #334155}
.pw-box h3{color:#f1f5f9;font-size:18px;margin-bottom:16px}
.pw-box input{width:100%;padding:12px;border-radius:10px;border:2px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;margin-bottom:10px;outline:none;box-sizing:border-box}
.pw-box .pw-btns{display:flex;gap:10px;margin-top:8px}
.pw-box .pw-btns button{flex:1;padding:10px;border-radius:10px;border:none;font-size:14px;font-weight:600;cursor:pointer}
.pw-msg{font-size:13px;margin-bottom:8px;display:none;padding:8px;border-radius:8px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.stat-card{background:#1e293b;border-radius:16px;padding:20px;border-left:4px solid #3b82f6}
.stat-card.green{border-left-color:#10b981}
.stat-card.red{border-left-color:#ef4444}
.stat-card.yellow{border-left-color:#f59e0b}
.stat-card.purple{border-left-color:#8b5cf6}
.stat-card .label{font-size:13px;color:#94a3b8;margin-bottom:4px}
.stat-card .value{font-size:28px;font-weight:800;color:#f1f5f9}
.stat-card .sub{font-size:12px;color:#64748b;margin-top:4px}
.section{background:#1e293b;border-radius:16px;padding:20px;margin-bottom:20px}
.section h2{font-size:18px;color:#f1f5f9;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.section h2 span{font-size:22px}
.chart-bars{display:flex;align-items:flex-end;gap:8px;height:160px;padding:8px 0}
.chart-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
.chart-bar{width:100%;border-radius:6px 6px 0 0;background:#3b82f6;min-height:3px;transition:height .3s}
.chart-label{font-size:11px;color:#94a3b8}
.chart-val{font-size:10px;color:#64748b}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:10px;color:#94a3b8;font-size:13px;border-bottom:1px solid #334155;font-weight:600}
td{padding:10px;font-size:14px;border-bottom:1px solid #1e293b}
tr:hover td{background:#1e293b}
.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
.badge.active{background:#064e3b;color:#34d399}
.badge.trial{background:#78350f;color:#fbbf24}
.badge.expired{background:#7f1d1d;color:#fca5a5}
.user-row{cursor:pointer}
.user-row:hover td{background:#334155}
.debtor-item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155}
.debtor-name{color:#f1f5f9;font-weight:500}
.debtor-amount{color:#f59e0b;font-weight:700}
.loading{text-align:center;padding:40px;color:#94a3b8}
@media(max-width:768px){.stats-grid{grid-template-columns:1fr 1fr}.dashboard{padding:12px}}
</style>
</head>
<body>
<div class="login-page" id="loginPage">
<div class="login-box">
<div style="text-align:center;margin-bottom:16px"><div style="font-size:48px;font-weight:900;color:#f59e0b">TK</div></div>
<h1>TekaTeka Admin</h1>
<p>Backoffice de gestion</p>
<div class="login-error" id="loginError">Mot de passe incorrect</div>
<input type="password" id="adminPass" placeholder="Mot de passe admin" onkeydown="if(event.key==='Enter')doLogin()">
<button onclick="doLogin()">Connexion</button>
</div>
</div>
<div class="dashboard" id="dashboard">
<div class="dash-header">
<h1><span style="color:#f59e0b;font-weight:900;margin-right:8px">TK</span> TekaTeka - Backoffice</h1>
<div><a href="/api/admin/ambassador-panel" style="background:#f59e0b;color:#0f172a;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;margin-right:8px">Ambassadeurs</a><button class="chg-pw" onclick="showPwModal()">Changer le mot de passe</button><button class="logout" onclick="doLogout()">Déconnexion</button></div>
</div>
<div class="pw-modal" id="pwModal">
<div class="pw-box">
<h3>Changer le mot de passe</h3>
<div class="pw-msg" id="pwMsg"></div>
<input type="password" id="pwCurrent" placeholder="Mot de passe actuel">
<input type="password" id="pwNew" placeholder="Nouveau mot de passe (min 6 car.)">
<input type="password" id="pwConfirm" placeholder="Confirmer le nouveau mot de passe">
<div class="pw-btns">
<button style="background:#334155;color:#94a3b8" onclick="hidePwModal()">Annuler</button>
<button style="background:#3b82f6;color:#fff" onclick="changePw()">Enregistrer</button>
</div>
</div>
</div>
<div id="content"><div class="loading">Chargement des données...</div></div>
</div>
<script>
let adminPass='';
const API=window.location.origin+'/api';
const post=(url,extra={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:adminPass,...extra})});
async function doLogin(){
  const p=document.getElementById('adminPass').value;
  if(!p){document.getElementById('loginError').style.display='block';return}
  try{
    const r=await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});
    if(!r.ok)throw new Error();
    adminPass=p;
    document.getElementById('loginPage').style.display='none';
    document.getElementById('dashboard').style.display='block';
    loadDashboard();
  }catch(e){document.getElementById('loginError').style.display='block'}
}
function doLogout(){adminPass='';document.getElementById('loginPage').style.display='flex';document.getElementById('dashboard').style.display='none';document.getElementById('adminPass').value=''}
function showPwModal(){document.getElementById('pwModal').classList.add('show');document.getElementById('pwCurrent').value='';document.getElementById('pwNew').value='';document.getElementById('pwConfirm').value='';document.getElementById('pwMsg').style.display='none'}
function hidePwModal(){document.getElementById('pwModal').classList.remove('show')}
async function changePw(){
  const cur=document.getElementById('pwCurrent').value;
  const nw=document.getElementById('pwNew').value;
  const cf=document.getElementById('pwConfirm').value;
  const msg=document.getElementById('pwMsg');
  if(!cur||!nw){msg.textContent='Remplissez tous les champs';msg.style.display='block';msg.style.background='#7f1d1d';msg.style.color='#fca5a5';return}
  if(nw.length<6){msg.textContent='Min. 6 caractères';msg.style.display='block';msg.style.background='#7f1d1d';msg.style.color='#fca5a5';return}
  if(nw!==cf){msg.textContent='Les mots de passe ne correspondent pas';msg.style.display='block';msg.style.background='#7f1d1d';msg.style.color='#fca5a5';return}
  try{
    const r=await fetch(API+'/admin/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:cur,newPassword:nw})});
    if(!r.ok){const e=await r.json();throw new Error(e.detail||'Erreur')}
    adminPass=nw;
    msg.textContent='Mot de passe modifié avec succès !';msg.style.display='block';msg.style.background='#064e3b';msg.style.color='#34d399';
    setTimeout(hidePwModal,1500);
  }catch(e){msg.textContent=e.message;msg.style.display='block';msg.style.background='#7f1d1d';msg.style.color='#fca5a5'}
}
async function loadDashboard(){
  const r=await post(API+'/admin/stats');
  const d=await r.json();
  const maxRev=Math.max(...d.trends.map(t=>t.revenue),1);
  let html=`
  <div class="stats-grid">
    <div class="stat-card green"><div class="label">💰 Revenus Totaux</div><div class="value">${fmt(d.totalRevenue)}</div><div class="sub">${d.totalSales} ventes</div></div>
    <div class="stat-card red"><div class="label">📉 Dépenses Totales</div><div class="value">${fmt(d.totalExpenses)}</div></div>
    <div class="stat-card ${d.netProfit>=0?'green':'red'}"><div class="label">${d.netProfit>=0?'📈 Bénéfice Net':'📉 Perte Nette'}</div><div class="value">${fmt(Math.abs(d.netProfit))}</div></div>
    <div class="stat-card yellow"><div class="label">👥 Dettes Impayées</div><div class="value">${fmt(d.totalUnpaidDebt)}</div><div class="sub">${d.unpaidDebtors} débiteurs</div></div>
    <div class="stat-card purple"><div class="label">📦 Valeur du Stock</div><div class="value">${fmt(d.totalStockValue)}</div><div class="sub">${d.totalProducts} produits</div></div>
    <div class="stat-card"><div class="label">👤 Utilisateurs</div><div class="value">${d.totalUsers}</div></div>
  </div>

  <div class="section">
    <h2><span>📈</span> Tendance des Revenus (7 jours)</h2>
    <div class="chart-bars">
      ${d.trends.map(t=>`<div class="chart-col"><div class="chart-val">${t.revenue>0?fmt(t.revenue):''}</div><div class="chart-bar" style="height:${Math.max(t.revenue/maxRev*140,3)}px"></div><div class="chart-label">${t.label}</div></div>`).join('')}
    </div>
  </div>

  <div class="section">
    <h2><span>👥</span> Qui me doit de l'argent ?</h2>
    ${d.users.flatMap(u=>u.debtors.map(dd=>({...dd,userPhone:u.phone}))).length===0?'<p style="color:#64748b">Aucune dette impayée</p>':''}
    ${d.users.flatMap(u=>u.debtors.map(dd=>({...dd,userPhone:u.phone}))).map(dd=>`<div class="debtor-item"><span class="debtor-name">${dd.name} <span style="color:#64748b;font-size:12px">(${dd.userPhone})</span></span><span class="debtor-amount">${fmt(dd.amount)} ${dd.currency}</span></div>`).join('')}
  </div>

  <div class="section">
    <h2><span>🏪</span> Performance par Magasin/Utilisateur</h2>
    <table>
      <thead><tr><th>Téléphone</th><th>Revenus</th><th>Dépenses</th><th>Bénéfice</th><th>Produits</th><th>Abonnement</th></tr></thead>
      <tbody>
        ${d.users.map(u=>{
          const sub=u.subscription||{};
          const status=sub.plan?'active':sub.status||'trial';
          return`<tr class="user-row" onclick="showUser('${u.id}')"><td>${u.phone}</td><td style="color:#10b981;font-weight:700">${fmt(u.revenue)}</td><td style="color:#ef4444">${fmt(u.expenses)}</td><td style="color:${u.profit>=0?'#10b981':'#ef4444'};font-weight:700">${fmt(Math.abs(u.profit))}</td><td>${u.productsCount}</td><td><span class="badge ${status}">${status}</span></td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
  document.getElementById('content').innerHTML=html;
}
async function showUser(id){
  const r=await post(API+'/admin/user/'+id);
  const d=await r.json();
  let html='<button onclick="loadDashboard()" style="background:#334155;border:none;color:#60a5fa;padding:10px 20px;border-radius:10px;cursor:pointer;margin-bottom:16px;font-size:14px">← Retour</button>';
  html+=`<div class="section"><h2><span>📦</span> Produits (${d.products.length})</h2><table><thead><tr><th>Nom</th><th>Prix Achat</th><th>Prix Vente</th><th>Stock</th></tr></thead><tbody>${d.products.map(p=>`<tr><td>${p.name}</td><td>${p.purchasePrice}</td><td>${p.salePrice}</td><td style="color:${p.stock<5?'#ef4444':'#10b981'};font-weight:700">${p.stock}</td></tr>`).join('')}</tbody></table></div>`;
  html+=`<div class="section"><h2><span>💰</span> Dernières Ventes (${d.sales.length})</h2><table><thead><tr><th>Produit</th><th>Qté</th><th>Total</th><th>Date</th></tr></thead><tbody>${d.sales.slice(0,20).map(s=>`<tr><td>${s.productName}</td><td>${s.quantity}</td><td style="color:#10b981;font-weight:700">${s.total} ${s.currency||''}</td><td style="color:#64748b;font-size:12px">${(s.createdAt||'').slice(0,16)}</td></tr>`).join('')}</tbody></table></div>`;
  html+=`<div class="section"><h2><span>👥</span> Dettes (${d.debts.filter(dd=>!dd.isPaid).length} impayées)</h2><table><thead><tr><th>Débiteur</th><th>Montant</th><th>Statut</th></tr></thead><tbody>${d.debts.map(dd=>`<tr><td>${dd.debtorName}</td><td style="font-weight:700">${dd.amount} ${dd.currency||''}</td><td><span class="badge ${dd.isPaid?'active':'expired'}">${dd.isPaid?'Payée':'Impayée'}</span></td></tr>`).join('')}</tbody></table></div>`;
  document.getElementById('content').innerHTML=html;
}
function fmt(n){return new Intl.NumberFormat('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n||0)}
</script>
</body>
</html>"""
