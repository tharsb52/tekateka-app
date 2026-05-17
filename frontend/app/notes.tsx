import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { notesAPI } from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import { formatLocal } from '../utils/dateUtils';

const BG = '#fef3e7';

const NOTE_COLORS = [
  { color: '#fff9c4', label: 'Jaune' },
  { color: '#c8e6c9', label: 'Vert' },
  { color: '#bbdefb', label: 'Bleu' },
  { color: '#f8bbd0', label: 'Rose' },
  { color: '#d1c4e9', label: 'Violet' },
  { color: '#ffe0b2', label: 'Orange' },
];

interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedColor, setSelectedColor] = useState('#fff9c4');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadNotes();
  }, [user?.id]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const data = await notesAPI.getAll();
      setNotes(data || []);
    } catch (err) {
      console.error('Load notes error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openNewNote = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setSelectedColor('#fff9c4');
    setModalVisible(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setSelectedColor(note.color || '#fff9c4');
    setModalVisible(true);
  };

  const saveNote = async () => {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try {
      if (editingNote) {
        const updated = await notesAPI.update(editingNote.id, { title, content, color: selectedColor });
        setNotes(prev => prev.map(n => n.id === editingNote.id ? updated : n));
      } else {
        const created = await notesAPI.add({ title, content, color: selectedColor });
        setNotes(prev => [created, ...prev]);
      }
      setModalVisible(false);
    } catch (err) {
      console.error('Save note error:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await notesAPI.delete(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete note error:', err);
    }
  };

  const formatDate = (d: string) => formatLocal(d, 'dd/MM/yyyy HH:mm');

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Mes Notes</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openNewNote}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>Aucune note</Text>
            <Text style={styles.emptySubtext}>Appuyez sur + pour créer votre première note</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollContent} contentContainerStyle={styles.notesGrid}>
            {notes.map((note) => (
              <TouchableOpacity
                key={note.id}
                style={[styles.noteCard, { backgroundColor: note.color || '#fff9c4' }]}
                onPress={() => openEditNote(note)}
                onLongPress={() => setDeleteConfirm(note.id)}
              >
                {note.title ? <Text style={styles.noteTitle} numberOfLines={2}>{note.title}</Text> : null}
                <Text style={styles.noteContent} numberOfLines={6}>{note.content}</Text>
                <Text style={styles.noteDate}>{formatDate(note.updatedAt || note.createdAt)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Note Editor Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={28} color="#64748b" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{editingNote ? 'Modifier la note' : 'Nouvelle note'}</Text>
                <TouchableOpacity onPress={saveNote} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#2563eb" /> : (
                    <Ionicons name="checkmark" size={28} color="#2563eb" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Color picker */}
              <View style={styles.colorPicker}>
                {NOTE_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c.color}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c.color },
                      selectedColor === c.color && styles.colorDotSelected,
                    ]}
                    onPress={() => setSelectedColor(c.color)}
                  >
                    {selectedColor === c.color && <Ionicons name="checkmark" size={16} color="#334155" />}
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.titleInput}
                placeholder="Titre (optionnel)"
                placeholderTextColor="#94a3b8"
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
              <TextInput
                style={styles.contentInput}
                placeholder="Écrivez votre note ici..."
                placeholderTextColor="#94a3b8"
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                autoFocus
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation */}
      <Modal visible={!!deleteConfirm} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 24, maxHeight: 200 }]}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', textAlign: 'center', marginBottom: 8 }}>
              Supprimer cette note ?
            </Text>
            <Text style={{ color: '#64748b', textAlign: 'center', marginBottom: 20 }}>
              Cette action est irréversible.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }}
                onPress={() => setDeleteConfirm(null)}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#64748b' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' }}
                onPress={() => deleteConfirm && deleteNote(deleteConfirm)}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: BG },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#94a3b8', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  scrollContent: { flex: 1 },
  notesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  noteCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    minHeight: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  noteTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 6 },
  noteContent: { fontSize: 14, color: '#475569', lineHeight: 20, flex: 1 },
  noteDate: { fontSize: 11, color: '#94a3b8', marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  colorPicker: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#334155',
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  contentInput: {
    fontSize: 16,
    color: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 8,
    flex: 1,
    lineHeight: 24,
  },
});
