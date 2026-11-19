import { API_BASE_URL } from '../../services/constants';
import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Text, TextInput } from '../../components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#0f172a';
const ACCENT = '#f59e0b';

// Ambassador self-service: create an account (pending admin validation) or
// reset a forgotten password with a code sent by email.
type Mode = 'register' | 'forgot' | 'reset';

async function post(path: string, body: object) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Erreur de connexion au serveur');
  return data;
}

function Field({ icon, ...props }: { icon: any } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputGroup}>
      <Ionicons name={icon} size={20} color="#94a3b8" style={styles.inputIcon} />
      <TextInput style={styles.input} placeholderTextColor="#64748b" {...props} />
    </View>
  );
}

export default function AmbassadorAccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'forgot' ? 'forgot' : 'register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [done, setDone] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await fn();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = () => run(async () => {
    if (mode === 'register') {
      if (!name || !email || !country || !city || !password) throw new Error('Veuillez remplir tous les champs');
      if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères');
      const d = await post('/ambassador/register', { name, email, phone, country, city, password });
      setSuccessMsg(d.message);
      setDone(true);
    } else if (mode === 'forgot') {
      if (!email) throw new Error('Entrez votre email');
      const d = await post('/ambassador/forgot-password', { email });
      setSuccessMsg(d.message);
      setMode('reset');
    } else {
      if (code.length < 6) throw new Error('Entrez le code à 6 chiffres reçu par email');
      if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères');
      await post('/ambassador/reset-password', { email, code, newPassword: password });
      setSuccessMsg('Mot de passe modifié. Vous pouvez vous connecter.');
      setDone(true);
    }
  });

  const title = mode === 'register' ? 'Devenir ambassadeur' : 'Mot de passe oublié';
  const subtitle = mode === 'register'
    ? "Votre demande sera validée par l'administrateur. Ensuite, vous aurez 7 jours pour acheter vos premiers codes."
    : mode === 'forgot'
      ? 'Entrez votre email : vous recevrez un code de réinitialisation.'
      : 'Entrez le code reçu par email et votre nouveau mot de passe.';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="amb-access-back">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Ionicons name={mode === 'register' ? 'person-add' : 'key'} size={48} color={ACCENT} />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}
          {successMsg ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {done ? (
            <TouchableOpacity style={styles.mainBtn} onPress={() => router.replace('/ambassador')} testID="amb-access-to-login">
              <Ionicons name="log-in" size={22} color="#0f172a" />
              <Text style={styles.mainBtnText}>Aller à la connexion</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              {mode === 'register' && (
                <>
                  <Field icon="person" placeholder="Nom complet" value={name} onChangeText={setName} testID="amb-reg-name" />
                  <Field icon="call" placeholder="Téléphone / WhatsApp (optionnel)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="amb-reg-phone" />
                  <Field icon="flag" placeholder="Pays" value={country} onChangeText={setCountry} testID="amb-reg-country" />
                  <Field icon="business" placeholder="Ville" value={city} onChangeText={setCity} testID="amb-reg-city" />
                </>
              )}
              {mode !== 'reset' && (
                <Field icon="mail" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="amb-access-email" />
              )}
              {mode === 'reset' && (
                <Field icon="keypad" placeholder="Code à 6 chiffres" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" testID="amb-reset-code" />
              )}
              {mode !== 'forgot' && (
                <Field icon="lock-closed" placeholder={mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe (min. 6 caractères)'} value={password} onChangeText={setPassword} secureTextEntry testID="amb-access-password" />
              )}
              <TouchableOpacity style={styles.mainBtn} onPress={submit} disabled={loading} testID="amb-access-submit">
                {loading ? <ActivityIndicator color="#0f172a" /> : (
                  <Text style={styles.mainBtnText}>
                    {mode === 'register' ? 'Envoyer ma demande' : mode === 'forgot' ? 'Recevoir le code' : 'Changer le mot de passe'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 64, justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 0, left: 0, width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  form: { gap: 14 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#334155' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#fff', fontSize: 16 },
  mainBtn: { backgroundColor: ACCENT, borderRadius: 14, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  mainBtnText: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 14, color: '#fca5a5', flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 10, padding: 12, marginBottom: 16 },
  successText: { fontSize: 14, color: '#6ee7b7', flex: 1 },
});
