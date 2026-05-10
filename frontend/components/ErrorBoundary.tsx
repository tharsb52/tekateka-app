import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches any runtime error in its children and displays a fallback UI
 * instead of crashing the entire app.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Erreur inconnue';
      const stack = this.state.error?.stack || '';
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Oups ! Une erreur s'est produite</Text>
          <Text style={styles.subtitle}>
            {this.props.fallbackLabel || 'Cette page a rencontré un problème.'}
          </Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorLabel}>Détails :</Text>
            <Text style={styles.errorText}>{msg}</Text>
          </View>
          {stack ? (
            <View style={styles.stackBox}>
              <Text style={styles.errorLabel}>Stack :</Text>
              <Text style={styles.stackText} numberOfLines={10}>{stack}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>Réessayer</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fef3e7' },
  content: { padding: 24, alignItems: 'center' },
  icon: { fontSize: 64, marginTop: 40, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  errorBox: {
    width: '100%',
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginBottom: 12,
  },
  stackBox: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  errorLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  errorText: { fontSize: 14, color: '#dc2626' },
  stackText: { fontSize: 11, color: '#475569', fontFamily: 'monospace' },
  button: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
