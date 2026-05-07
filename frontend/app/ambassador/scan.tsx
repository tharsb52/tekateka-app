import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BG = '#0f172a';
const ACCENT = '#f59e0b';
const CARD = '#1e293b';

let CameraModule: any = null;
try {
  CameraModule = require('expo-camera');
} catch (e) {
  // expo-camera not available
}

export default function AmbassadorScanScreen() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [manualId, setManualId] = useState('');
  const [clientInfo, setClientInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);

  useEffect(() => {
    checkCameraAvailability();
  }, []);

  const checkCameraAvailability = async () => {
    if (Platform.OS === 'web' || !CameraModule) {
      setCameraPermission(false);
      return;
    }
    try {
      const { status } = await CameraModule.Camera.requestCameraPermissionsAsync();
      setCameraPermission(status === 'granted');
    } catch (e) {
      console.log('Camera permission error:', e);
      setCameraPermission(false);
    }
  };

  const startScanning = async () => {
    if (!cameraPermission) {
      if (Platform.OS === 'web') {
        setErrorMsg("La caméra n'est pas disponible sur la version web. Utilisez l'ID du client.");
        return;
      }
      // Try to request permission again
      try {
        const { status } = await CameraModule.Camera.requestCameraPermissionsAsync();
        if (status === 'granted') {
          setCameraPermission(true);
          setScanning(true);
        } else {
          setErrorMsg("Permission caméra refusée. Allez dans les paramètres de votre téléphone pour l'activer.");
        }
      } catch (e) {
        setErrorMsg("Caméra non disponible. Utilisez la saisie manuelle de l'ID.");
      }
    } else {
      setScanning(true);
    }
  };

  const handleBarCodeScanned = (result: any) => {
    const data = result?.data || '';
    if (data) {
      setScanning(false);
      setManualId(data);
      lookupClient(data);
    }
  };

  const lookupClient = async (userId: string) => {
    if (!userId.trim()) {
      setErrorMsg("Veuillez entrer l'ID du client");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setClientInfo(null);
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://low-data-shop.preview.emergentagent.com';
      const res = await fetch(`${backendUrl}/api/ambassador/scan-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientUserId: userId.trim() }),
      });
      const responseText = await res.text();
      let data;
      try { data = JSON.parse(responseText); } catch {
        setErrorMsg('Serveur inaccessible');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.detail || 'Client introuvable');
      } else {
        setClientInfo(data.client);
      }
    } catch (e: any) {
      setErrorMsg('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#34d399';
      case 'expired': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Actif';
      case 'expired': return 'Expiré';
      default: return 'Inactif';
    }
  };

  // Camera view
  if (scanning && CameraModule) {
    const { CameraView } = CameraModule;
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          {/* Overlay */}
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.scanCorner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
              <View style={[styles.scanCorner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
              <View style={[styles.scanCorner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
              <View style={[styles.scanCorner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />
            </View>
            <Text style={styles.scanHint}>Placez le QR code du client dans le cadre</Text>
          </View>
          <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setScanning(false)}>
            <Ionicons name="close" size={22} color="#fff" />
            <Text style={styles.cancelScanText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scanner Client</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        {/* Error */}
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#fca5a5" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Scan Button */}
        <TouchableOpacity style={styles.scanBtn} onPress={startScanning}>
          <View style={styles.scanBtnIcon}>
            <Ionicons name="scan" size={48} color="#fff" />
          </View>
          <Text style={styles.scanBtnText}>Scanner le QR Code</Text>
          <Text style={styles.scanBtnSub}>
            {Platform.OS === 'web' 
              ? 'Non disponible sur web — utilisez l\'ID ci-dessous'
              : 'Pointez la caméra vers le QR code du client'}
          </Text>
        </TouchableOpacity>

        {/* Manual Entry */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ou entrer l'ID manuellement</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            placeholder="Coller l'ID du client ici"
            placeholderTextColor="#64748b"
            value={manualId}
            onChangeText={(t) => { setManualId(t); setErrorMsg(''); }}
            autoCapitalize="none"
          />
          <TouchableOpacity 
            style={[styles.searchBtn, !manualId.trim() && { opacity: 0.5 }]} 
            onPress={() => lookupClient(manualId)} 
            disabled={!manualId.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="search" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Client Info */}
        {clientInfo && (
          <View style={styles.clientCard}>
            <View style={styles.clientHeader}>
              <Ionicons name="person-circle" size={48} color={ACCENT} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.clientName}>{clientInfo.name}</Text>
                <Text style={styles.clientPhone}>{clientInfo.phone}</Text>
              </View>
            </View>
            <View style={styles.subInfo}>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Statut abonnement:</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(clientInfo.subscription.status) + '22' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(clientInfo.subscription.status) }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(clientInfo.subscription.status) }]}>
                    {getStatusLabel(clientInfo.subscription.status)}
                  </Text>
                </View>
              </View>
              {clientInfo.subscription.plan && (
                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>Plan:</Text>
                  <Text style={styles.subValue}>{clientInfo.subscription.plan}</Text>
                </View>
              )}
              {clientInfo.subscription.expiryDate && (
                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>Expire le:</Text>
                  <Text style={styles.subValue}>{new Date(clientInfo.subscription.expiryDate).toLocaleDateString('fr-FR')}</Text>
                </View>
              )}
            </View>
            {/* Activate Button */}
            <TouchableOpacity
              style={styles.activateBtn}
              onPress={() => router.push({ pathname: '/ambassador/activate', params: { clientId: clientInfo.id, clientName: clientInfo.name } })}
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.activateBtnText}>Activer un abonnement</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: 20 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 14, color: '#fca5a5', flex: 1 },
  scanBtn: { backgroundColor: '#1e3a5f', borderRadius: 20, padding: 30, alignItems: 'center', gap: 12, borderWidth: 2, borderColor: '#2563eb', borderStyle: 'dashed' },
  scanBtnIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  scanBtnText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  scanBtnSub: { fontSize: 13, color: '#93c5fd', textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#334155' },
  dividerText: { paddingHorizontal: 12, fontSize: 12, color: '#64748b' },
  manualRow: { flexDirection: 'row', gap: 10 },
  manualInput: { flex: 1, backgroundColor: CARD, borderRadius: 14, paddingHorizontal: 16, height: 56, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#334155' },
  searchBtn: { width: 56, height: 56, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  clientCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, marginTop: 20 },
  clientHeader: { flexDirection: 'row', alignItems: 'center' },
  clientName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  clientPhone: { fontSize: 14, color: '#94a3b8', marginTop: 2 },
  subInfo: { marginTop: 16, gap: 10 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subLabel: { fontSize: 14, color: '#94a3b8' },
  subValue: { fontSize: 14, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  activateBtn: { backgroundColor: '#059669', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  activateBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  // Camera overlay
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 260, position: 'relative' },
  scanCorner: { position: 'absolute', width: 40, height: 40, borderColor: ACCENT },
  scanHint: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 20, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  cancelScanBtn: { position: 'absolute', bottom: 50, left: 20, right: 20, backgroundColor: '#ef4444', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cancelScanText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
