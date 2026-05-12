import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/lib/AppDialog';
import { CHILE_REGIONS } from '@/lib/regions';

export default function RegionsScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const dialog = useDialog();
  const [selected, setSelected] = useState<Set<string>>(new Set(profile?.regions ?? []));
  const [saving, setSaving] = useState(false);

  async function toggle(code: string) {
    if (saving) return;
    const next = new Set(selected);
    next.has(code) ? next.delete(code) : next.add(code);
    if (next.size === 0) {
      dialog.alert({
        title: 'Selecciona al menos una',
        message: 'Necesitas mantener al menos una región para poder hacer intercambios.',
      });
      return;
    }
    setSelected(next);
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ regions: Array.from(next) })
      .eq('id', user!.id);
    if (error) {
      dialog.alert({ title: 'No se pudo guardar', message: error.message });
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#6366F1" />
          <Text style={styles.back}>Perfil</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Regiones</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Regiones donde puedes hacer intercambios. Esto ayuda a conectar con coleccionistas cercanos.
        </Text>

        {CHILE_REGIONS.map(r => {
          const isOn = selected.has(r.code);
          return (
            <TouchableOpacity
              key={r.code}
              style={[styles.row, isOn && styles.rowActive]}
              onPress={() => toggle(r.code)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>{r.label}</Text>
              {isOn && <Ionicons name="checkmark-circle" size={22} color="#6366F1" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  back: { color: '#6366F1', fontSize: 15 },
  title: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  scroll: { padding: 20, gap: 8 },
  intro: { color: '#94A3B8', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B',
  },
  rowActive: { borderColor: '#6366F1', backgroundColor: '#6366F122' },
  rowLabel: { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },
  rowLabelActive: { color: '#A5B4FC' },
});
