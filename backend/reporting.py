from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

router = APIRouter()

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "tekateka")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Email configuration
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@tekateka.app")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

class UserAnalytics(BaseModel):
    user_id: str
    phone_number: str
    country: Optional[str] = "Unknown"
    total_sales: float
    total_transactions: int
    created_at: str
    last_active: str

class ReportResponse(BaseModel):
    total_users: int
    new_users_this_week: int
    countries: dict
    total_revenue: float
    revenue_growth: float
    active_users: int

async def get_country_from_phone(phone_number: str) -> str:
    """Extract country from phone number prefix"""
    country_codes = {
        "243": "RDC (Congo)",
        "225": "Côte d'Ivoire",
        "237": "Cameroun",
        "242": "Congo-Brazzaville",
        "221": "Sénégal",
        "223": "Mali",
        "226": "Burkina Faso",
        "227": "Niger",
        "228": "Togo",
        "229": "Bénin",
        "230": "Maurice",
        "231": "Liberia",
        "232": "Sierra Leone",
        "233": "Ghana",
        "234": "Nigeria",
        "235": "Tchad",
        "236": "République Centrafricaine",
        "238": "Cap-Vert",
        "239": "São Tomé-et-Príncipe",
        "240": "Guinée Équatoriale",
        "241": "Gabon",
        "244": "Angola",
        "245": "Guinée-Bissau",
        "246": "Diego Garcia",
        "248": "Seychelles",
        "249": "Soudan",
        "250": "Rwanda",
        "251": "Éthiopie",
        "252": "Somalie",
        "253": "Djibouti",
        "254": "Kenya",
        "255": "Tanzanie",
        "256": "Ouganda",
        "257": "Burundi",
        "258": "Mozambique",
        "260": "Zambie",
        "261": "Madagascar",
        "262": "Réunion",
        "263": "Zimbabwe",
        "264": "Namibie",
        "265": "Malawi",
        "266": "Lesotho",
        "267": "Botswana",
        "268": "Eswatini",
        "269": "Comores",
        "27": "Afrique du Sud",
    }
    
    # Remove + if present
    phone = phone_number.replace("+", "").replace(" ", "")
    
    # Try 3-digit codes first
    for code, country in country_codes.items():
        if phone.startswith(code):
            return country
    
    # Try 2-digit codes
    prefix_2 = phone[:2]
    if prefix_2 in country_codes:
        return country_codes[prefix_2]
    
    return "Autre"

@router.get("/analytics", response_model=ReportResponse)
async def get_analytics():
    """Get current analytics for the admin - optimized with MongoDB aggregation pipelines"""
    
    now = datetime.now()
    one_week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks_ago = (now - timedelta(days=14)).isoformat()

    # 1. Total users count (no need to fetch docs)
    total_users = await db.users.count_documents({})
    
    # 2. New users this week (count only)
    new_users_this_week = await db.users.count_documents({
        "createdAt": {"$gte": one_week_ago}
    })

    # 3. Country distribution - fetch only phoneNumber field
    users_phones = await db.users.find(
        {}, {"phoneNumber": 1, "_id": 0}
    ).to_list(10000)
    
    countries = {}
    for user in users_phones:
        country = await get_country_from_phone(user.get("phoneNumber", ""))
        countries[country] = countries.get(country, 0) + 1

    # 4. Total revenue - use aggregation pipeline (server-side sum)
    revenue_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$totalAmount"}}}
    ]
    revenue_result = await db.sales.aggregate(revenue_pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0

    # 5. This week revenue - aggregation with date filter
    this_week_pipeline = [
        {"$match": {"createdAt": {"$gte": one_week_ago}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": "$totalAmount"},
            "user_ids": {"$addToSet": "$userId"}
        }}
    ]
    this_week_result = await db.sales.aggregate(this_week_pipeline).to_list(1)
    this_week_revenue = this_week_result[0]["total"] if this_week_result else 0
    active_user_ids = this_week_result[0].get("user_ids", []) if this_week_result else []
    active_users = len(active_user_ids)

    # 6. Previous week revenue - aggregation with date range filter
    prev_week_pipeline = [
        {"$match": {"createdAt": {"$gte": two_weeks_ago, "$lt": one_week_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$totalAmount"}}}
    ]
    prev_week_result = await db.sales.aggregate(prev_week_pipeline).to_list(1)
    prev_week_revenue = prev_week_result[0]["total"] if prev_week_result else 0

    # 7. Calculate growth percentage
    revenue_growth = 0
    if prev_week_revenue > 0:
        revenue_growth = ((this_week_revenue - prev_week_revenue) / prev_week_revenue) * 100

    return {
        "total_users": total_users,
        "new_users_this_week": new_users_this_week,
        "countries": countries,
        "total_revenue": total_revenue,
        "revenue_growth": revenue_growth,
        "active_users": active_users,
    }

async def send_weekly_report():
    """Generate and send weekly report email"""
    
    try:
        analytics = await get_analytics()
        
        # Generate HTML email
        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f8fafc; padding: 30px; }}
                .metric {{ background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #2563eb; }}
                .metric-title {{ font-size: 14px; color: #64748b; margin-bottom: 5px; }}
                .metric-value {{ font-size: 32px; font-weight: bold; color: #1e293b; }}
                .metric-change {{ font-size: 14px; color: #10b981; margin-top: 5px; }}
                .negative {{ color: #dc2626; }}
                .countries-table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
                .countries-table th, .countries-table td {{ padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }}
                .countries-table th {{ background: #f1f5f9; font-weight: 600; }}
                .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📊 TekaTeka - Rapport Hebdomadaire</h1>
                    <p>Semaine du {(datetime.now() - timedelta(days=7)).strftime('%d/%m/%Y')} au {datetime.now().strftime('%d/%m/%Y')}</p>
                </div>
                
                <div class="content">
                    <div class="metric">
                        <div class="metric-title">👥 Total Utilisateurs</div>
                        <div class="metric-value">{analytics['total_users']}</div>
                        <div class="metric-change">+{analytics['new_users_this_week']} nouveaux cette semaine</div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-title">💰 Chiffre d'Affaires Total</div>
                        <div class="metric-value">${analytics['total_revenue']:,.2f}</div>
                        <div class="metric-change {'negative' if analytics['revenue_growth'] < 0 else ''}">
                            {'+' if analytics['revenue_growth'] >= 0 else ''}{analytics['revenue_growth']:.1f}% vs semaine précédente
                        </div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-title">🔥 Utilisateurs Actifs (7 jours)</div>
                        <div class="metric-value">{analytics['active_users']}</div>
                        <div class="metric-change">{(analytics['active_users'] / analytics['total_users'] * 100) if analytics['total_users'] > 0 else 0:.1f}% du total</div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-title">🌍 Répartition Géographique</div>
                        <table class="countries-table">
                            <tr>
                                <th>Pays</th>
                                <th>Utilisateurs</th>
                                <th>%</th>
                            </tr>
        """
        
        # Add countries
        sorted_countries = sorted(analytics['countries'].items(), key=lambda x: x[1], reverse=True)
        for country, count in sorted_countries[:10]:  # Top 10 countries
            percentage = (count / analytics['total_users'] * 100) if analytics['total_users'] > 0 else 0
            html_content += f"""
                            <tr>
                                <td>{country}</td>
                                <td>{count}</td>
                                <td>{percentage:.1f}%</td>
                            </tr>
            """
        
        html_content += """
                        </table>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Ce rapport a été généré automatiquement par TekaTeka</p>
                    <p>© 2025 TekaTeka - Gestion de Business pour l'Afrique</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Send email
        if SMTP_EMAIL and SMTP_PASSWORD:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"📊 Rapport Hebdomadaire TekaTeka - {datetime.now().strftime('%d/%m/%Y')}"
            msg['From'] = SMTP_EMAIL
            msg['To'] = ADMIN_EMAIL
            
            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)
            
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.send_message(msg)
            
            print(f"✅ Weekly report sent to {ADMIN_EMAIL}")
        else:
            print("⚠️ Email credentials not configured. Report generated but not sent.")
            print(html_content)
            
    except Exception as e:
        print(f"❌ Error sending weekly report: {e}")

@router.post("/send-report")
async def trigger_weekly_report(background_tasks: BackgroundTasks):
    """Manually trigger weekly report (for testing)"""
    background_tasks.add_task(send_weekly_report)
    return {"message": "Weekly report generation triggered"}

@router.get("/test-email")
async def test_email():
    """Test email configuration"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        return {"status": "error", "message": "Email credentials not configured"}
    
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
        return {"status": "success", "message": "Email configuration is valid"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
