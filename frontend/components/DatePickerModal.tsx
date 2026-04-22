import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

interface DatePickerModalProps {
  visible: boolean;
  date: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
}

export default function DatePickerModal({ visible, date, onConfirm, onCancel, title }: DatePickerModalProps) {
  const [day, setDay] = useState(date.getDate());
  const [month, setMonth] = useState(date.getMonth());
  const [year, setYear] = useState(date.getFullYear());

  useEffect(() => {
    if (visible) {
      setDay(date.getDate());
      setMonth(date.getMonth());
      setYear(date.getFullYear());
    }
  }, [visible, date]);

  const maxDay = getDaysInMonth(month, year);

  useEffect(() => {
    if (day > maxDay) setDay(maxDay);
  }, [month, year, maxDay, day]);

  const changeDay = (delta: number) => {
    let newDay = day + delta;
    if (newDay < 1) newDay = maxDay;
    if (newDay > maxDay) newDay = 1;
    setDay(newDay);
  };

  const changeMonth = (delta: number) => {
    let newMonth = month + delta;
    if (newMonth < 0) { newMonth = 11; setYear(y => y - 1); }
    if (newMonth > 11) { newMonth = 0; setYear(y => y + 1); }
    setMonth(newMonth);
  };

  const changeYear = (delta: number) => {
    setYear(y => y + delta);
  };

  const handleConfirm = () => {
    const clampedDay = Math.min(day, getDaysInMonth(month, year));
    const selected = new Date(year, month, clampedDay, 12, 0, 0);
    onConfirm(selected);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title || "Choisir la date"}</Text>

          <View style={styles.pickersRow}>
            {/* Day */}
            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Jour</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => changeDay(1)}>
                <Ionicons name="chevron-up" size={28} color="#2563eb" />
              </TouchableOpacity>
              <View style={styles.valueBox}>
                <Text style={styles.valueText}>{String(day).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => changeDay(-1)}>
                <Ionicons name="chevron-down" size={28} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {/* Month */}
            <View style={[styles.pickerColumn, { flex: 2 }]}>
              <Text style={styles.pickerLabel}>Mois</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => changeMonth(1)}>
                <Ionicons name="chevron-up" size={28} color="#2563eb" />
              </TouchableOpacity>
              <View style={styles.valueBox}>
                <Text style={styles.valueText}>{MONTHS_FR[month]}</Text>
              </View>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => changeMonth(-1)}>
                <Ionicons name="chevron-down" size={28} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {/* Year */}
            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Année</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => changeYear(1)}>
                <Ionicons name="chevron-up" size={28} color="#2563eb" />
              </TouchableOpacity>
              <View style={styles.valueBox}>
                <Text style={styles.valueText}>{year}</Text>
              </View>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => changeYear(-1)}>
                <Ionicons name="chevron-down" size={28} color="#2563eb" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.preview}>
            {String(day).padStart(2, '0')}/{String(month + 1).padStart(2, '0')}/{year}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.confirmText}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 20,
  },
  pickersRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  pickerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  arrowBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  valueText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  preview: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  confirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
