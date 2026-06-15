"""
Public legal pages for Google Play / App Store compliance.

These routes are PUBLIC (no auth) and must remain HTML-only so they can
be opened in any browser, including the in-app browser used by reviewers.

Routes:
  GET /api/privacy   → French privacy policy (GDPR-compliant)
  GET /api/terms     → Terms of service
"""
from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["legal"])

LAST_UPDATED = "14 juin 2026"
CONTACT_EMAIL = "support@tekateka.app"
COMPANY = "TekaTeka"

PRIVACY_HTML = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Politique de confidentialité — {COMPANY}</title>
<meta name="description" content="Politique de confidentialité de l'application {COMPANY} — conforme RGPD" />
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    max-width: 820px; margin: 0 auto; padding: 32px 20px 80px;
    color: #1e293b; line-height: 1.6; background: #fff;
  }}
  header {{ border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 28px; }}
  h1 {{ font-size: 28px; margin: 0 0 4px; color: #0f172a; }}
  h2 {{ font-size: 19px; margin-top: 32px; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }}
  h3 {{ font-size: 16px; margin-top: 18px; color: #334155; }}
  p, li {{ font-size: 15px; }}
  .meta {{ color: #64748b; font-size: 13px; }}
  ul {{ padding-left: 22px; }}
  a {{ color: #2563eb; }}
  .box {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 6px; }}
  footer {{ margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 13px; }}
</style>
</head>
<body>
<header>
  <h1>Politique de confidentialité</h1>
  <p class="meta">Application <strong>{COMPANY}</strong> — Dernière mise à jour : {LAST_UPDATED}</p>
</header>

<p>
La présente politique décrit comment <strong>{COMPANY}</strong> (« nous », « notre »)
collecte, utilise et protège les informations personnelles des utilisateurs
de l'application mobile {COMPANY} (l'« Application ») disponible sur Google
Play et l'App Store.
</p>

<p>
Cette politique est conforme au <strong>Règlement Général sur la Protection
des Données (RGPD — UE 2016/679)</strong>, aux exigences de
<strong>Google Play Data Safety</strong>, et aux lois nationales applicables
en matière de protection des données dans les pays africains où l'Application
est distribuée.
</p>

<h2>1. Responsable du traitement</h2>
<p>
Le responsable du traitement des données est <strong>{COMPANY}</strong>.<br/>
Email de contact : <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>
</p>

<h2>2. Données personnelles que nous collectons</h2>

<h3>2.1 Données fournies par vous lors de l'inscription</h3>
<ul>
  <li><strong>Numéro de téléphone</strong> — obligatoire pour l'authentification (envoi du code SMS via Firebase Authentication).</li>
  <li><strong>Nom et prénom</strong> — facultatif, utilisés uniquement pour personnaliser l'interface.</li>
  <li><strong>Adresse email</strong> — facultative, utilisée uniquement si vous l'enregistrez vous-même dans votre profil.</li>
  <li><strong>Photo de profil</strong> — facultative, stockée localement et sur nos serveurs sous forme d'image encodée.</li>
</ul>

<h3>2.2 Données commerciales saisies par vous-même</h3>
<p>
Les données suivantes sont saisies par vous dans le cadre de la gestion de
votre commerce. Elles sont stockées dans votre espace personnel et ne sont
jamais partagées avec d'autres utilisateurs :
</p>
<ul>
  <li>Liste de produits, prix d'achat, prix de vente, quantités en stock.</li>
  <li>Ventes effectuées (date, montant, articles vendus, mode de paiement).</li>
  <li>Dépenses (catégorie, montant, date).</li>
  <li>Dettes clients (nom du débiteur, montant).</li>
  <li>Notes et rapports comptables générés.</li>
</ul>

<h3>2.3 Données de paiement (abonnement)</h3>
<p>
Si vous souscrivez à un abonnement payant, les données de paiement (numéro de
carte, CVC, etc.) sont collectées et traitées <strong>exclusivement</strong>
par notre prestataire de paiement <strong>Stripe</strong> via un environnement
de paiement sécurisé conforme à la norme PCI-DSS. <strong>{COMPANY} ne stocke
jamais vos coordonnées bancaires.</strong>
</p>

<h3>2.4 Données techniques collectées automatiquement</h3>
<ul>
  <li>Identifiant unique de l'appareil (anonymisé).</li>
  <li>Système d'exploitation et version (Android / iOS).</li>
  <li>Modèle de l'appareil et résolution d'écran.</li>
  <li>Adresse IP, pays et opérateur télécom (pour la sécurité et la facturation SMS).</li>
  <li>Rapports de plantage et journaux de diagnostic.</li>
</ul>

<h2>3. Finalités du traitement et base légale</h2>
<table style="border-collapse: collapse; width: 100%; margin-top: 8px;">
  <thead>
    <tr style="background: #f1f5f9;">
      <th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Finalité</th>
      <th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Base légale (RGPD)</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Authentification et sécurité du compte</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Exécution du contrat (art. 6.1.b)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Fourniture des fonctionnalités de gestion (ventes, stock, dépenses)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Exécution du contrat (art. 6.1.b)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Traitement des paiements d'abonnement</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Exécution du contrat (art. 6.1.b)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Analytics anonymes et amélioration du service</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Intérêt légitime (art. 6.1.f)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Communications opérationnelles (rapports mensuels)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Exécution du contrat (art. 6.1.b)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Conformité légale (lutte contre la fraude)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Obligation légale (art. 6.1.c)</td></tr>
  </tbody>
</table>

<h2>4. Partage des données — Prestataires tiers</h2>
<p>
{COMPANY} ne vend <strong>jamais</strong> vos données personnelles à des tiers.
Nous faisons appel à un nombre limité de prestataires qui agissent en
qualité de <strong>sous-traitants</strong> et sont contractuellement tenus
au respect du RGPD :
</p>
<ul>
  <li><strong>Firebase Authentication (Google LLC, États-Unis)</strong> —
      Envoi des codes SMS, vérification du numéro de téléphone, gestion des sessions.
      Politique : <a href="https://firebase.google.com/support/privacy" target="_blank">firebase.google.com/support/privacy</a></li>
  <li><strong>Stripe Inc. (États-Unis)</strong> —
      Traitement des paiements d'abonnement. Politique :
      <a href="https://stripe.com/privacy" target="_blank">stripe.com/privacy</a></li>
  <li><strong>MongoDB Atlas (États-Unis / UE)</strong> —
      Hébergement de la base de données. Politique :
      <a href="https://www.mongodb.com/legal/privacy-policy" target="_blank">mongodb.com/legal/privacy-policy</a></li>
  <li><strong>Africa's Talking (Kenya)</strong> —
      Envoi de notifications SMS aux clients/débiteurs si vous activez cette
      fonctionnalité. Politique :
      <a href="https://africastalking.com/privacy" target="_blank">africastalking.com/privacy</a></li>
  <li><strong>Emergent Cloud Hosting</strong> —
      Hébergement de l'API backend.</li>
</ul>

<div class="box">
  <strong>Transferts internationaux :</strong> certains de nos prestataires
  sont situés hors de l'Union européenne. Ces transferts sont encadrés par
  les <strong>Clauses Contractuelles Types</strong> approuvées par la
  Commission européenne (art. 46 RGPD).
</div>

<h2>5. Durée de conservation</h2>
<ul>
  <li><strong>Données du compte actif</strong> : tant que votre compte est actif.</li>
  <li><strong>Données après suppression du compte</strong> : effacées dans les
      <strong>30 jours</strong> sur l'ensemble de nos systèmes (incluant les
      sauvegardes), à l'exception des journaux d'audit anonymisés conservés 6 mois
      pour des raisons de sécurité (sans identifiant personnel).</li>
  <li><strong>Données comptables</strong> (factures d'abonnement, commissions
      ambassadeur) : <strong>10 ans</strong> conformément aux obligations
      légales en matière de comptabilité.</li>
</ul>

<h2>6. Vos droits</h2>
<p>Conformément au RGPD, vous disposez des droits suivants :</p>
<ul>
  <li><strong>Droit d'accès</strong> — Obtenir une copie de toutes vos données.</li>
  <li><strong>Droit de rectification</strong> — Corriger toute donnée inexacte
      (modifiable directement dans l'app, section Réglages).</li>
  <li><strong>Droit à l'effacement (« droit à l'oubli »)</strong> — Supprimer
      définitivement votre compte et toutes vos données via la fonction
      <strong>« Supprimer mon compte »</strong> dans Réglages &gt; Zone de danger,
      ou en nous écrivant à <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</li>
  <li><strong>Droit à la portabilité</strong> — Recevoir vos données dans un
      format structuré et couramment utilisé (CSV / JSON).</li>
  <li><strong>Droit à la limitation</strong> — Limiter temporairement le
      traitement de vos données.</li>
  <li><strong>Droit d'opposition</strong> — Vous opposer au traitement basé sur
      un intérêt légitime.</li>
  <li><strong>Droit de retirer votre consentement</strong> à tout moment.</li>
  <li><strong>Droit d'introduire une réclamation</strong> auprès d'une autorité
      de contrôle compétente.</li>
</ul>

<p>
Pour exercer ces droits, contactez-nous à
<a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>. Nous répondrons dans un
délai maximal d'<strong>un mois</strong>.
</p>

<h2>7. Sécurité des données</h2>
<ul>
  <li>Chiffrement <strong>TLS 1.3</strong> de toutes les communications réseau.</li>
  <li>Authentification forte par OTP SMS (Firebase Authentication).</li>
  <li>Stockage chiffré au repos sur MongoDB Atlas.</li>
  <li>Accès restreint à la base de données via réseau privé.</li>
  <li>Aucune donnée bancaire stockée sur nos serveurs (déléguée à Stripe PCI-DSS).</li>
  <li>Surveillance continue et audits réguliers.</li>
</ul>

<h2>8. Cookies et traceurs</h2>
<p>
L'Application mobile n'utilise <strong>aucun cookie publicitaire</strong>.
Seuls des identifiants techniques anonymes sont utilisés pour maintenir
votre session active (tokens JWT) — ils ne contiennent aucune donnée
personnelle exploitable.
</p>

<h2>9. Protection des mineurs</h2>
<p>
L'Application est destinée à un public adulte (commerçants et entrepreneurs).
Elle <strong>n'est pas conçue pour les enfants de moins de 13 ans</strong>.
Si vous découvrez qu'un mineur a créé un compte sans le consentement de ses
parents, contactez-nous à <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>
pour que nous procédions immédiatement à la suppression.
</p>

<h2>10. Modifications de la politique</h2>
<p>
Nous pouvons mettre à jour cette politique pour refléter des évolutions
légales ou des changements dans nos pratiques. La date de dernière mise à
jour figure en haut de cette page. Pour les modifications substantielles,
nous vous informerons via l'Application au moins 30 jours avant l'entrée en
vigueur.
</p>

<h2>11. Contact</h2>
<p>
Pour toute question relative à cette politique de confidentialité ou au
traitement de vos données personnelles, vous pouvez nous écrire à :<br/>
<strong>Email :</strong> <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>
</p>

<footer>
  <p>
    © {datetime.now().year} {COMPANY}. Tous droits réservés. — Politique de
    confidentialité conforme RGPD (UE 2016/679) et exigences Google Play
    Data Safety.
  </p>
</footer>
</body>
</html>
"""


@router.get("/privacy", response_class=HTMLResponse)
async def privacy_page() -> HTMLResponse:
    """Public GDPR-compliant privacy policy in French."""
    return HTMLResponse(content=PRIVACY_HTML, status_code=200)


@router.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_alias() -> HTMLResponse:
    """Alias for older deep links / store submissions."""
    return HTMLResponse(content=PRIVACY_HTML, status_code=200)
