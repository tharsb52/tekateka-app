import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#fef3e7';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conditions d'Utilisation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdate}>Dernière mise à jour : Juin 2025</Text>

        <Text style={styles.sectionTitle}>1. Acceptation des conditions</Text>
        <Text style={styles.paragraph}>
          En utilisant l'application TekaTeka, vous acceptez les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser l'application.
        </Text>

        <Text style={styles.sectionTitle}>2. Description du service</Text>
        <Text style={styles.paragraph}>
          TekaTeka est une application mobile de gestion commerciale destinée aux petits commerçants en Afrique. Elle permet de gérer les produits, ventes, dépenses, dettes et notes commerciales avec synchronisation en temps réel sur plusieurs appareils.
        </Text>

        <Text style={styles.sectionTitle}>3. Inscription et compte</Text>
        <Text style={styles.paragraph}>Pour utiliser TekaTeka, vous devez :</Text>
        <Text style={styles.bullet}>• Disposer d'un numéro de téléphone valide</Text>
        <Text style={styles.bullet}>• Être âgé d'au moins 18 ans ou avoir l'autorisation d'un tuteur légal</Text>
        <Text style={styles.bullet}>• Fournir des informations exactes lors de l'inscription</Text>
        <Text style={styles.bullet}>• Maintenir la confidentialité de vos identifiants de connexion</Text>

        <Text style={styles.sectionTitle}>4. Utilisation acceptable</Text>
        <Text style={styles.paragraph}>Vous vous engagez à :</Text>
        <Text style={styles.bullet}>• Utiliser l'application uniquement à des fins légales et commerciales légitimes</Text>
        <Text style={styles.bullet}>• Ne pas tenter de compromettre la sécurité de l'application</Text>
        <Text style={styles.bullet}>• Ne pas utiliser l'application pour des activités frauduleuses</Text>
        <Text style={styles.bullet}>• Respecter les lois et réglementations applicables dans votre pays</Text>

        <Text style={styles.sectionTitle}>5. Abonnement et paiement</Text>
        <Text style={styles.paragraph}>
          TekaTeka propose une période d'essai gratuite. Au-delà, un abonnement payant est requis. Les tarifs sont affichés dans l'application. Les paiements sont traités par des prestataires tiers sécurisés (Stripe pour les cartes, Flutterwave pour le Mobile Money).
        </Text>
        <Text style={styles.bullet}>• Les abonnements sont renouvelés automatiquement sauf annulation</Text>
        <Text style={styles.bullet}>• Les remboursements sont traités conformément aux politiques des stores (Apple/Google)</Text>
        <Text style={styles.bullet}>• Nous nous réservons le droit de modifier les tarifs avec préavis de 30 jours</Text>

        <Text style={styles.sectionTitle}>6. Propriété intellectuelle</Text>
        <Text style={styles.paragraph}>
          L'application TekaTeka, son design, son code source et ses contenus sont protégés par le droit d'auteur. Toute reproduction non autorisée est interdite. Vos données commerciales restent votre propriété exclusive.
        </Text>

        <Text style={styles.sectionTitle}>7. Limitation de responsabilité</Text>
        <Text style={styles.paragraph}>
          TekaTeka est fournie "en l'état". Nous ne garantissons pas que le service sera ininterrompu ou exempt d'erreurs. Nous ne sommes pas responsables des pertes commerciales résultant de l'utilisation ou de l'impossibilité d'utiliser l'application.
        </Text>

        <Text style={styles.sectionTitle}>8. Données et sauvegarde</Text>
        <Text style={styles.paragraph}>
          Bien que nous effectuions des sauvegardes régulières, nous vous recommandons de conserver vos propres copies de vos données commerciales importantes. Nous ne saurions être tenus responsables de toute perte de données.
        </Text>

        <Text style={styles.sectionTitle}>9. Résiliation</Text>
        <Text style={styles.paragraph}>
          Vous pouvez supprimer votre compte à tout moment. Nous nous réservons le droit de suspendre ou supprimer un compte en cas de violation de ces conditions, sans préavis.
        </Text>

        <Text style={styles.sectionTitle}>10. Modifications</Text>
        <Text style={styles.paragraph}>
          Nous pouvons modifier ces conditions à tout moment. Les modifications seront notifiées via l'application. L'utilisation continue après modification vaut acceptation des nouvelles conditions.
        </Text>

        <Text style={styles.sectionTitle}>11. Droit applicable</Text>
        <Text style={styles.paragraph}>
          Ces conditions sont régies par le droit applicable dans votre juridiction. Tout litige sera soumis aux tribunaux compétents.
        </Text>

        <Text style={styles.sectionTitle}>12. Contact</Text>
        <Text style={styles.paragraph}>
          Pour toute question concernant ces conditions, contactez-nous à : support@tekateka.app
        </Text>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0d9c0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  content: { flex: 1, padding: 20 },
  lastUpdate: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginBottom: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginTop: 24, marginBottom: 10 },
  paragraph: { fontSize: 15, color: '#475569', lineHeight: 24, marginBottom: 10 },
  bullet: { fontSize: 15, color: '#475569', lineHeight: 24, paddingLeft: 12, marginBottom: 4 },
});
