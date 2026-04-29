import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';

type VoiceState = 'idle' | 'listening' | 'processing';

interface UseVoiceInputReturn {
  isListening: boolean;
  state: VoiceState;
  transcript: string;
  startListening: (lang?: string) => void;
  stopListening: () => void;
  error: string | null;
  isAvailable: boolean;
}

/**
 * Custom hook for voice-to-text input.
 * Uses expo-speech-recognition on native and Web Speech API on web.
 * Falls back gracefully when speech recognition is not available.
 */
export const useVoiceInput = (): UseVoiceInputReturn => {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const recognitionRef = useRef<any>(null);
  const moduleRef = useRef<any>(null);
  const listenersRef = useRef<any[]>([]);

  useEffect(() => {
    checkAvailability();
    return () => {
      // Cleanup listeners on unmount
      cleanupListeners();
    };
  }, []);

  const cleanupListeners = () => {
    listenersRef.current.forEach(sub => {
      if (sub && typeof sub.remove === 'function') sub.remove();
    });
    listenersRef.current = [];
  };

  const checkAvailability = async () => {
    if (Platform.OS === 'web') {
      const available = typeof window !== 'undefined' && 
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
      setIsAvailable(available);
    } else {
      // expo-speech-recognition requires a development build (not Expo Go)
      // We disable it by default on native to avoid crashes in Expo Go
      setIsAvailable(false);
    }
  };

  const startListening = useCallback((lang: string = 'fr-FR') => {
    setError(null);
    setTranscript('');
    setState('listening');

    if (Platform.OS === 'web') {
      startWebListening(lang);
    } else {
      startNativeListening(lang);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      if (moduleRef.current) {
        try { moduleRef.current.stop(); } catch {}
      }
    }
    setState('idle');
  }, []);

  // ============ Web Speech API ============
  const startWebListening = (lang: string) => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Speech recognition non disponible');
        setState('idle');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          finalTranscript += event.results[i][0].transcript;
        }
        setTranscript(finalTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech error:', event.error);
        if (event.error !== 'aborted') {
          setError(event.error === 'not-allowed' ? 'Microphone non autorise' : `Erreur: ${event.error}`);
        }
        setState('idle');
      };

      recognition.onend = () => {
        setState('idle');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      setError(e.message || 'Erreur de reconnaissance vocale');
      setState('idle');
    }
  };

  // ============ Native (expo-speech-recognition) ============
  // Disabled in Expo Go - requires development build
  const startNativeListening = async (lang: string) => {
    setError('Reconnaissance vocale non disponible dans Expo Go. Utilisez un development build.');
    setState('idle');
  };

  return {
    isListening: state === 'listening',
    state,
    transcript,
    startListening,
    stopListening,
    error,
    isAvailable,
  };
};
