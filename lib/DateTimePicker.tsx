import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePickerModal({
  visible, value, minDate, onClose, onPick,
}: {
  visible: boolean;
  value: Date | null;
  minDate?: Date;
  onClose: () => void;
  onPick: (d: Date) => void;
}) {
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const min = minDate ? startOfDay(minDate) : null;

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  function changeMonth(delta: number) {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  function pickDay(d: Date) {
    if (min && d < min) return;
    onPick(d);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.monthHeader}>
              <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color="#94A3B8" />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={styles.weekDay}>{w}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {grid.map((cell, i) => {
                if (!cell) return <View key={i} style={styles.dayCell} />;
                const disabled = min ? cell < min : false;
                const selected = value && isSameDay(cell, value);
                const isToday = isSameDay(cell, today);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.dayCell,
                      selected && styles.dayCellSelected,
                      isToday && !selected && styles.dayCellToday,
                      disabled && styles.dayCellDisabled,
                    ]}
                    onPress={() => pickDay(cell)}
                    disabled={disabled}
                  >
                    <Text style={[
                      styles.dayText,
                      selected && styles.dayTextSelected,
                      disabled && styles.dayTextDisabled,
                    ]}>
                      {cell.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function buildMonthGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // JS getDay: 0=Sunday..6=Saturday. We use Mon-first: shift so Mon=0..Sun=6.
  const firstWeekIdx = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekIdx; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function TimePickerModal({
  visible, hour, minute, onClose, onPick,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onClose: () => void;
  onPick: (h: number, m: number) => void;
}) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []); // 0, 5, 10... 55

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.timeTitle}>Hora del encuentro</Text>
            <View style={styles.timeRow}>
              <TimeColumn label="Hora" values={hours} selected={h} onSelect={setH} pad />
              <Text style={styles.timeSeparator}>:</Text>
              <TimeColumn label="Min" values={minutes} selected={m} onSelect={setM} pad />
            </View>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => { onPick(h, m); onClose(); }}>
              <Text style={styles.confirmBtnText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function TimeColumn({ label, values, selected, onSelect, pad }: {
  label: string;
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
  pad?: boolean;
}) {
  return (
    <View style={styles.timeColumn}>
      <Text style={styles.timeColumnLabel}>{label}</Text>
      <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
        {values.map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.timeOption, v === selected && styles.timeOptionSelected]}
            onPress={() => onSelect(v)}
          >
            <Text style={[styles.timeOptionText, v === selected && styles.timeOptionTextSelected]}>
              {pad ? String(v).padStart(2, '0') : String(v)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36, paddingHorizontal: 16, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginBottom: 16 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 12 },
  monthLabel: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { flex: 1, textAlign: 'center', color: '#64748B', fontSize: 11, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  dayCell: {
    width: `${100 / 7}%`, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    padding: 2,
  },
  dayCellSelected: {},
  dayCellToday: {},
  dayCellDisabled: {},
  dayText: { color: '#F1F5F9', fontSize: 14, fontWeight: '500', width: 34, height: 34, lineHeight: 34, textAlign: 'center', borderRadius: 17 },
  dayTextSelected: { backgroundColor: '#6366F1', color: '#fff', fontWeight: '700', overflow: 'hidden' },
  dayTextDisabled: { color: '#475569' },

  timeTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  timeColumn: { width: 92 },
  timeColumnLabel: { color: '#64748B', fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 6, textTransform: 'uppercase' },
  timeScroll: { maxHeight: 220, backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  timeOption: { paddingVertical: 10, alignItems: 'center' },
  timeOptionSelected: { backgroundColor: '#6366F1' },
  timeOptionText: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
  timeOptionTextSelected: { color: '#fff', fontWeight: '700' },
  timeSeparator: { color: '#F1F5F9', fontSize: 24, fontWeight: '700' },

  confirmBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// Helpers para day cell que aplican estilos activos al texto, no al wrapper (lo dejé arriba como vacío)
// — el `dayTextSelected` ya tiene el background; los `dayCell*` solo existen para placeholder en caso de quererlos usar más adelante.
