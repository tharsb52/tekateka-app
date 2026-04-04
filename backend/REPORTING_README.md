# TekaTeka - Système de Reporting Automatique

## 📊 Vue d'ensemble

Le système de reporting automatique envoie chaque **vendredi soir à 20h** un rapport détaillé au propriétaire de l'application par email.

## 🎯 Contenu du Rapport Hebdomadaire

### 1. **Statistiques Utilisateurs**
- Nombre total d'utilisateurs inscrits
- Nouveaux utilisateurs de la semaine
- Utilisateurs actifs (ayant effectué des transactions dans les 7 derniers jours)
- Taux d'activité (% utilisateurs actifs)

### 2. **Répartition Géographique**
- Liste des pays d'origine des utilisateurs
- Nombre d'utilisateurs par pays
- Pourcentage par pays
- Détection automatique du pays depuis le préfixe téléphonique

### 3. **Chiffre d'Affaires**
- Chiffre d'affaires total cumulé
- Évolution vs semaine précédente (%)
- Indicateur de croissance positif/négatif

## 🔧 Configuration

### Variables d'Environnement

Ajoutez ces variables dans `/app/backend/.env`:

```bash
# Email du propriétaire (destinataire du rapport)
ADMIN_EMAIL=votre-email@example.com

# Configuration SMTP (Gmail, SendGrid, etc.)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=votre-email-smtp@gmail.com
SMTP_PASSWORD=votre-mot-de-passe-app

# Optionnel: Base de données
MONGO_URL=mongodb://localhost:27017
DB_NAME=tekateka
```

### Configuration Gmail (Recommandé)

1. Activer l'authentification à 2 facteurs
2. Générer un "Mot de passe d'application"
3. Utiliser ce mot de passe dans `SMTP_PASSWORD`

### Configuration SendGrid (Alternative)

```bash
SMTP_SERVER=smtp.sendgrid.net
SMTP_PORT=587
SMTP_EMAIL=apikey
SMTP_PASSWORD=votre-clé-api-sendgrid
```

## 🚀 Endpoints API

### 1. Obtenir les Analytics en Temps Réel

```bash
GET /api/reports/analytics
```

**Réponse:**
```json
{
  "total_users": 150,
  "new_users_this_week": 23,
  "countries": {
    "RDC (Congo)": 45,
    "Côte d'Ivoire": 30,
    "Cameroun": 25,
    ...
  },
  "total_revenue": 15240.50,
  "revenue_growth": 12.5,
  "active_users": 89
}
```

### 2. Déclencher Manuellement le Rapport

```bash
POST /api/reports/send-report
```

**Usage:**
```bash
curl -X POST http://localhost:8001/api/reports/send-report
```

### 3. Tester la Configuration Email

```bash
GET /api/reports/test-email
```

**Réponse:**
```json
{
  "status": "success",
  "message": "Email configuration is valid"
}
```

## ⏰ Automatisation (Cron Job)

### Configuration du Cron

Le script `/app/backend/weekly_report.sh` peut être programmé avec crontab:

```bash
# Éditer crontab
crontab -e

# Ajouter cette ligne pour exécution chaque vendredi à 20h
0 20 * * 5 /app/backend/weekly_report.sh >> /var/log/tekateka_reports.log 2>&1
```

**Format Cron:**
- `0` = Minute (0)
- `20` = Heure (20h = 8 PM)
- `*` = Jour du mois (tous)
- `*` = Mois (tous)
- `5` = Jour de la semaine (5 = Vendredi)

### Rendre le script exécutable

```bash
chmod +x /app/backend/weekly_report.sh
```

## 📧 Format du Rapport Email

Le rapport est envoyé au format HTML avec:

- **En-tête** : Logo et période du rapport
- **Métriques clés** : Cards visuelles pour chaque statistique
- **Tableau pays** : Top 10 des pays avec pourcentages
- **Couleurs** : 
  - Vert pour croissance positive
  - Rouge pour croissance négative
- **Footer** : Informations TekaTeka

## 🌍 Détection Automatique des Pays

Le système détecte automatiquement le pays d'origine à partir du préfixe téléphonique:

| Préfixe | Pays |
|---------|------|
| +243 | RDC (Congo) |
| +225 | Côte d'Ivoire |
| +237 | Cameroun |
| +242 | Congo-Brazzaville |
| +221 | Sénégal |
| ... | 50+ pays africains supportés |

## 🧪 Tests

### Tester la Génération du Rapport

```bash
# Test manuel
curl -X POST http://localhost:8001/api/reports/send-report

# Vérifier les logs
tail -f /var/log/tekateka_reports.log
```

### Tester la Configuration Email

```bash
curl http://localhost:8001/api/reports/test-email
```

## 📊 Exemples de Métriques

### Exemple de Rapport Type

```
📊 TekaTeka - Rapport Hebdomadaire
Semaine du 20/12/2024 au 27/12/2024

👥 Total Utilisateurs: 156
    +18 nouveaux cette semaine

💰 Chiffre d'Affaires Total: $18,450.75
    +15.3% vs semaine précédente

🔥 Utilisateurs Actifs: 94
    60.3% du total

🌍 Répartition Géographique:
    RDC (Congo): 48 utilisateurs (30.8%)
    Côte d'Ivoire: 35 utilisateurs (22.4%)
    Cameroun: 28 utilisateurs (17.9%)
    ...
```

## 🔒 Sécurité

- Les mots de passe SMTP ne sont jamais affichés dans les logs
- Utiliser des "mots de passe d'application" plutôt que le mot de passe principal
- Les emails sont envoyés via connexion TLS sécurisée
- Les données sont agrégées, pas de PII (Personally Identifiable Information) dans le rapport

## ⚠️ Troubleshooting

### Problème: Email non reçu

1. Vérifier la configuration SMTP:
   ```bash
   curl http://localhost:8001/api/reports/test-email
   ```

2. Vérifier les logs backend:
   ```bash
   tail -f /var/log/supervisor/backend.err.log
   ```

3. Vérifier le dossier spam

### Problème: Cron ne s'exécute pas

1. Vérifier que le cron est actif:
   ```bash
   crontab -l
   ```

2. Vérifier les logs cron:
   ```bash
   tail -f /var/log/cron
   ```

3. Tester le script manuellement:
   ```bash
   /app/backend/weekly_report.sh
   ```

## 📝 Personnalisation

Le template HTML du rapport peut être personnalisé dans `/app/backend/reporting.py` à la fonction `send_weekly_report()`.

---

**© 2025 TekaTeka - Gestion de Business pour l'Afrique**
