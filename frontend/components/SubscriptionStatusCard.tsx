/**
 * SubscriptionStatusCard
 *
 * Carte qui affiche en permanence le statut d'abonnement de l'utilisateur :
 *   - Type de plan en cours (Essai / Mensuel / Trimestriel / Annuel)
 *   - Date d'expiration
 *   - Nombre de jours restants (avec couleur d'urgence)
 *   - CTA "Renouveler" / "S'abonner" lorsque pertinent
 *
 * Utilisée à la fois sur le Dashboard et l'écran "Plus" (Settings).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PLAN_LABELS: Record<string, string> = {
  trial: 'Essai gratuit',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
};

function urgencyStyles(daysLeft: number, isTrial: boolean) {
  if (daysLeft <= 0) return { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '#dc2626', tag: 'Expiré' };
  if (daysLeft <= 2) return { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '#dc2626', tag: 'Urgent' };
  if (daysLeft <= 7) return { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '#f59e0b', tag: 'Bientôt' };
  if (isTrial) return { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '#2563eb', tag: 'Essai' };
  return { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '#10b981', tag: 'Actif' };
}

export default function SubscriptionStatusCard({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { user, isSubscriptionActive, getSubscriptionDaysRemaining, getDaysRemaining } = useAuth();

  if (!user) return null;

  const isActive = isSubscriptionActive();
  const isTrial = !isActive && !!user.trialStartDate;
  const daysLeft = isActive ? getSubscriptionDaysRemaining() : getDaysRemaining();
  const planKey = isActive ? (user.subscriptionPlan || 'monthly') : 'trial';
  const planLabel = PLAN_LABELS[planKey] || PLAN_LABELS.monthly;
  const endDateIso = isActive ? user.subscriptionEndDate : null;
  const colors = urgencyStyles(daysLeft, isTrial);

  let endDateLabel = '';
  if (endDateIso) {
    try { endDateLabel = format(new Date(endDateIso), 'dd MMM yyyy', { locale: fr }); } catch {}
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }, compact && { padding: 12 }] }>
      <View style={styles.row}>
        <View style={[styles.iconBubble, { backgroundColor: colors.icon }]}>
          <Ionicons name={isActive ? 'shield-checkmark' : 'time'} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.headerRow}>
            <Text style={[styles.planLabel, { color: colors.text }]}>{planLabel}</Text>
            <View style={[styles.tag, { backgroundColor: colors.icon }]}>
              <Text style={styles.tagText}>{colors.tag}</Text>
            </View>
          </View>
          <Text style={[styles.subLabel, { color: colors.text }]}>
            {daysLeft > 0
              ? `${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`
              : "Aucun jour restant"}
            {endDateLabel ? `  ·  Expire le ${endDateLabel}` : ''}
          </Text>
        </View>
      </View>

      {(daysLeft <= 7 || !isActive) && (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.icon }]}
          onPress={() => router.push('/subscription')}
          activeOpacity={0.85}
        >
          <Ionicons name={isActive ? 'refresh' : 'rocket'} size={16} color="#fff" />
          <Text style={styles.ctaText}>{isActive ? 'Renouveler' : "S'abonner"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planLabel: { fontSize: 16, fontWeight: '800' },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  subLabel: { fontSize: 12, marginTop: 2, opacity: 0.9 },
  cta: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  ctaText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
