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
      try {
        const mod = await import('expo-speech-recognition');
        moduleRef.current = mod.ExpoSpeechRecognitionModule;
        setIsAvailable(true);
      } catch {
        setIsAvailable(false);
      }
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
  const startNativeListening = async (lang: string) => {
    try {
      const mod = moduleRef.current;
      if (!mod) {
        setError('Module de reconnaissance vocale non disponible');
        setState('idle');
        return;
      }

      // Request permission
      const permResult = await mod.requestPermissionsAsync();
      if (!permResult.granted) {
        setError('Permission micro refusee');
        setState('idle');
        return;
      }

      // Clean old listeners
      cleanupListeners();

      // Setup event listeners
      const { addSpeechRecognitionListener } = await import('expo-speech-recognition');

      const resultSub = addSpeechRecognitionListener('result', (event: any) => {
        if (event.results && event.results.length > 0) {
          const text = event.results[0]?.transcript || '';
          setTranscript(text);
        }
      });

      const errorSub = addSpeechRecognitionListener('error', (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setError(event.error || 'Erreur de reconnaissance');
        setState('idle');
      });

      const endSub = addSpeechRecognitionListener('end', () => {
        setState('idle');
      });

      listenersRef.current = [resultSub, errorSub, endSub];

      // Start listening
      mod.start({
        lang: lang,
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });
    } catch (e: any) {
      console.error('Native speech error:', e);
      setError(e.message || 'Erreur');
      setState('idle');
    }
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
