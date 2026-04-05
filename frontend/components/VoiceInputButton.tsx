import React, { useEffect } from 'react';
import {
  TouchableOpacity, Text, StyleSheet, View, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  lang?: string;
  size?: 'small' | 'medium';
  color?: string;
  label?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  lang = 'fr-FR',
  size = 'small',
  color = '#2563eb',
  label,
}) => {
  const { isListening, transcript, startListening, stopListening, error, isAvailable } = useVoiceInput();

  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
    }
  }, [transcript, isListening]);

  if (!isAvailable) return null;

  const handlePress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(lang);
    }
  };

  const isSmall = size === 'small';
  const btnSize = isSmall ? 36 : 48;
  const iconSize = isSmall ? 18 : 24;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[
          styles.button,
          { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
          isListening ? styles.buttonListening : { backgroundColor: color + '15' },
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {isListening ? (
          <View style={styles.listeningInner}>
            <Ionicons name="radio" size={iconSize} color="#dc2626" />
          </View>
        ) : (
          <Ionicons name="mic" size={iconSize} color={color} />
        )}
      </TouchableOpacity>
      {isListening && (
        <View style={styles.listeningBadge}>
          <View style={styles.pulseDot} />
          <Text style={styles.listeningText}>Parlez...</Text>
        </View>
      )}
      {transcript && isListening ? (
        <Text style={styles.previewText} numberOfLines={1}>{transcript}</Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 4,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonListening: {
    backgroundColor: '#fef2f2',
    borderWidth: 2,
    borderColor: '#dc2626',
  },
  listeningInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
  },
  listeningText: {
    fontSize: 10,
    color: '#dc2626',
    fontWeight: '600',
  },
  previewText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '500',
    maxWidth: 120,
  },
  errorText: {
    fontSize: 10,
    color: '#dc2626',
    maxWidth: 120,
  },
});
