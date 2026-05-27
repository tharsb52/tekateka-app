import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../services/constants';

const BG = '#0f172a';
const ACCENT = '#f59e0b';
const CARD = '#1e293b';

export default function AmbassadorChangePassword() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Champs manquants', 'Veuillez remplir tous les champs.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Mot de passe trop court', 'Au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erreur', 'Le nouveau mot de passe et sa confirmation ne correspondent pas.');
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert('Erreur', 'Le nouveau mot de passe doit être différent de l\'actuel.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      if (!token) {
        Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
        router.replace('/ambassador');
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/ambassador/profile/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Erreur', data.detail || 'Impossible de changer le mot de passe');
        return;
      }
      Alert.alert(
        'Mot de passe modifié',
        'Votre mot de passe a été mis à jour avec succès.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert('Erreur réseau', 'Vérifiez votre connexion et réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mot de passe</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.card}>
            <View style={styles.iconBubble}>
              <Ionicons name="lock-closed" size={28} color={ACCENT} />
            </View>
            <Text style={styles.cardTitle}>Changer mon mot de passe</Text>
            <Text style={styles.cardSub}>Saisissez votre mot de passe actuel puis le nouveau.</Text>
          </View>

          <Text style={styles.label}>Mot de passe actuel</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowCurrent(s => !s)} style={styles.eye}>
              <Ionicons name={showCurrent ? 'eye-off' : 'eye'} size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Nouveau mot de passe</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Au moins 6 caractères"
              placeholderTextColor="#64748b"
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowNew(s => !s)} style={styles.eye}>
              <Ionicons name={showNew ? 'eye-off' : 'eye'} size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Retapez le nouveau mot de passe"
              placeholderTextColor="#64748b"
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#0f172a" /> : (
              <>
                <Ionicons name="checkmark" size={20} color="#0f172a" />
                <Text style={styles.submitText}>Enregistrer</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  card: { backgroundColor: CARD, borderRadius: 16, padding: 20, marginBottom: 24, alignItems: 'center' },
  iconBubble: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  cardSub: { fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#cbd5e1', marginBottom: 6, marginTop: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, marginBottom: 4 },
  input: { flex: 1, height: 48, color: '#fff', fontSize: 15 },
  eye: { paddingLeft: 10 },
  submitBtn: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 12 },
  submitText: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
});
