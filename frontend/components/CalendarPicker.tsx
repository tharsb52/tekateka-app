import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(month: number, year: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday=0, Sunday=6
}

interface CalendarPickerProps {
  visible: boolean;
  date: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
}

export default function CalendarPicker({ visible, date, onConfirm, onCancel, title }: CalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState(date.getMonth());
  const [viewYear, setViewYear] = useState(date.getFullYear());
  const [selectedDay, setSelectedDay] = useState(date.getDate());
  const [selectedMonth, setSelectedMonth] = useState(date.getMonth());
  const [selectedYear, setSelectedYear] = useState(date.getFullYear());

  useEffect(() => {
    if (visible) {
      setViewMonth(date.getMonth());
      setViewYear(date.getFullYear());
      setSelectedDay(date.getDate());
      setSelectedMonth(date.getMonth());
      setSelectedYear(date.getFullYear());
    }
  }, [visible, date]);

  const daysInMonth = getDaysInMonth(viewMonth, viewYear);
  const firstDay = getFirstDayOfMonth(viewMonth, viewYear);

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewMonth, viewYear, daysInMonth, firstDay]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const selectDay = (day: number) => {
    setSelectedDay(day);
    setSelectedMonth(viewMonth);
    setSelectedYear(viewYear);
  };

  const isSelected = (day: number) => {
    return day === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;
  };

  const isToday = (day: number) => {
    const now = new Date();
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
  };

  const handleConfirm = () => {
    const selected = new Date(selectedYear, selectedMonth, selectedDay, 12, 0, 0);
    onConfirm(selected);
  };

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title || "Choisir la date"}</Text>

          {/* Month/Year Navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.navBtn} onPress={goToPrevMonth}>
              <Ionicons name="chevron-back" size={24} color="#2563eb" />
            </TouchableOpacity>
            <Text style={styles.monthText}>
              {MONTHS_FR[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity style={styles.navBtn} onPress={goToNextMonth}>
              <Ionicons name="chevron-forward" size={24} color="#2563eb" />
            </TouchableOpacity>
          </View>

          {/* Day Headers */}
          <View style={styles.dayHeaderRow}>
            {DAYS_FR.map((d) => (
              <Text key={d} style={styles.dayHeader}>{d}</Text>
            ))}
          </View>

          {/* Calendar Grid */}
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((day, di) => (
                <TouchableOpacity
                  key={di}
                  style={[
                    styles.dayCell,
                    day && isSelected(day) && styles.dayCellSelected,
                    day && isToday(day) && !isSelected(day) && styles.dayCellToday,
                  ]}
                  onPress={() => day && selectDay(day)}
                  disabled={!day}
                  activeOpacity={0.6}
                >
                  {day ? (
                    <Text style={[
                      styles.dayText,
                      isSelected(day) && styles.dayTextSelected,
                      isToday(day) && !isSelected(day) && styles.dayTextToday,
                    ]}>
                      {day}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* Selected date preview */}
          <View style={styles.previewRow}>
            <Ionicons name="calendar" size={18} color="#2563eb" />
            <Text style={styles.previewText}>
              {String(selectedDay).padStart(2, '0')}/{String(selectedMonth + 1).padStart(2, '0')}/{selectedYear}
            </Text>
          </View>

          {/* Actions */}
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
    padding: 16,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    paddingVertical: 6,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    margin: 2,
  },
  dayCellSelected: {
    backgroundColor: '#2563eb',
  },
  dayCellToday: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  dayText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#2563eb',
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 16,
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    borderRadius: 10,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
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
