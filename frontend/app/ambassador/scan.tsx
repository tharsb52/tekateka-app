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

export default function AmbassadorScanScreen() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [manualId, setManualId] = useState('');
  const [clientInfo, setClientInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [CameraComponent, setCameraComponent] = useState<any>(null);

  useEffect(() => {
    // Try to load camera only on native
    if (Platform.OS !== 'web') {
      try {
        const { CameraView } = require('expo-camera');
        setCameraComponent(() => CameraView);
        setHasCamera(true);
      } catch {
        setHasCamera(false);
      }
    }
  }, []);

  const handleBarCodeScanned = (result: any) => {
    const data = result.data || result.nativeEvent?.data || '';
    if (data) {
      setScanning(false);
      lookupClient(data);
    }
  };

  const lookupClient = async (userId: string) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${backendUrl}/api/ambassador/scan-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientUserId: userId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Erreur', data.detail || 'Client introuvable');
        setClientInfo(null);
      } else {
        setClientInfo(data.client);
      }
    } catch (e: any) {
      Alert.alert('Erreur', 'Impossible de scanner le client');
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

      {/* Camera Scanner */}
      {scanning && hasCamera && CameraComponent ? (
        <View style={styles.cameraContainer}>
          <CameraComponent
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <TouchableOpacity style={styles.cancelScan} onPress={() => setScanning(false)}>
            <Text style={styles.cancelScanText}>Annuler le scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Scan Button */}
          {hasCamera && (
            <TouchableOpacity style={styles.scanBtn} onPress={() => setScanning(true)}>
              <Ionicons name="qr-code" size={40} color="#fff" />
              <Text style={styles.scanBtnText}>Scanner le QR Code</Text>
              <Text style={styles.scanBtnSub}>Pointez la caméra vers le QR code du client</Text>
            </TouchableOpacity>
          )}

          {/* Manual Entry */}
          <View style={styles.manualSection}>
            <Text style={styles.orText}>{hasCamera ? '— ou saisir manuellement —' : 'Entrez l\'ID du client'}</Text>
            <View style={styles.manualRow}>
              <TextInput
                style={styles.manualInput}
                placeholder="ID du client"
                placeholderTextColor="#64748b"
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={() => lookupClient(manualId)} disabled={!manualId}>
                <Ionicons name="search" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Loading */}
          {loading && <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 20 }} />}

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
                  <Text style={styles.subLabel}>Statut:</Text>
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  cancelScan: { position: 'absolute', bottom: 50, left: 20, right: 20, backgroundColor: '#ef4444', borderRadius: 14, padding: 16, alignItems: 'center' },
  cancelScanText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  content: { flex: 1, padding: 20 },
  scanBtn: { backgroundColor: '#2563eb', borderRadius: 20, padding: 30, alignItems: 'center', gap: 10 },
  scanBtnText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  scanBtnSub: { fontSize: 13, color: '#93c5fd' },
  manualSection: { marginTop: 24 },
  orText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 12 },
  manualRow: { flexDirection: 'row', gap: 10 },
  manualInput: { flex: 1, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 16, height: 50, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  searchBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
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
});
