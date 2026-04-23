import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#fef3e7';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Politique de Confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdate}>Dernière mise à jour : Juin 2025</Text>

        <Text style={styles.sectionTitle}>1. Introduction</Text>
        <Text style={styles.paragraph}>
          TekaTeka ("nous", "notre", "l'application") s'engage à protéger la vie privée de ses utilisateurs. Cette politique de confidentialité décrit comment nous collectons, utilisons et protégeons vos informations personnelles lorsque vous utilisez notre application mobile de gestion commerciale.
        </Text>

        <Text style={styles.sectionTitle}>2. Données collectées</Text>
        <Text style={styles.paragraph}>Nous collectons les données suivantes :</Text>
        <Text style={styles.bullet}>• Numéro de téléphone (pour l'authentification OTP)</Text>
        <Text style={styles.bullet}>• Email et nom d'utilisateur (optionnel, pour l'accès collègue)</Text>
        <Text style={styles.bullet}>• Photo de profil (optionnel)</Text>
        <Text style={styles.bullet}>• Données commerciales : produits, ventes, dépenses, dettes, notes</Text>
        <Text style={styles.bullet}>• Devise et langue préférées</Text>

        <Text style={styles.sectionTitle}>3. Utilisation des données</Text>
        <Text style={styles.paragraph}>Vos données sont utilisées exclusivement pour :</Text>
        <Text style={styles.bullet}>• Fournir les services de gestion commerciale de l'application</Text>
        <Text style={styles.bullet}>• Synchroniser vos données entre plusieurs appareils</Text>
        <Text style={styles.bullet}>• Authentifier votre identité de manière sécurisée</Text>
        <Text style={styles.bullet}>• Générer des rapports et statistiques pour votre usage personnel</Text>

        <Text style={styles.sectionTitle}>4. Stockage et sécurité</Text>
        <Text style={styles.paragraph}>
          Vos données sont stockées de manière sécurisée dans notre base de données MongoDB avec chiffrement. Les mots de passe sont hashés avec bcrypt. Les communications sont protégées par HTTPS et l'authentification utilise des tokens JWT.
        </Text>

        <Text style={styles.sectionTitle}>5. Partage des données</Text>
        <Text style={styles.paragraph}>
          Nous ne vendons, ne louons et ne partageons pas vos données personnelles avec des tiers, sauf dans les cas suivants :
        </Text>
        <Text style={styles.bullet}>• Fournisseurs de services de paiement (Stripe, Flutterwave) pour le traitement des transactions</Text>
        <Text style={styles.bullet}>• Fournisseur SMS (Africa's Talking) pour l'envoi des codes OTP</Text>
        <Text style={styles.bullet}>• Obligation légale ou judiciaire</Text>

        <Text style={styles.sectionTitle}>6. Vos droits</Text>
        <Text style={styles.paragraph}>Vous avez le droit de :</Text>
        <Text style={styles.bullet}>• Accéder à toutes vos données via l'application</Text>
        <Text style={styles.bullet}>• Modifier vos informations personnelles</Text>
        <Text style={styles.bullet}>• Supprimer votre compte et toutes les données associées</Text>
        <Text style={styles.bullet}>• Exporter vos données commerciales</Text>

        <Text style={styles.sectionTitle}>7. Données de paiement</Text>
        <Text style={styles.paragraph}>
          Les informations de carte bancaire sont traitées directement par Stripe et ne sont jamais stockées sur nos serveurs. Les transactions Mobile Money sont traitées par Flutterwave de manière sécurisée.
        </Text>

        <Text style={styles.sectionTitle}>8. Conservation des données</Text>
        <Text style={styles.paragraph}>
          Vos données sont conservées tant que votre compte est actif. En cas de suppression de compte, toutes vos données sont effacées définitivement dans un délai de 30 jours.
        </Text>

        <Text style={styles.sectionTitle}>9. Modifications</Text>
        <Text style={styles.paragraph}>
          Nous nous réservons le droit de modifier cette politique. Toute modification sera notifiée via l'application. L'utilisation continue de l'application après modification vaut acceptation.
        </Text>

        <Text style={styles.sectionTitle}>10. Contact</Text>
        <Text style={styles.paragraph}>
          Pour toute question relative à cette politique, contactez-nous à : mtharcisse@thenoly.com
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
