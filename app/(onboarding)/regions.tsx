import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CHILE_REGIONS } from '@/lib/regions';

export default function OnboardingRegionsScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(profile?.regions ?? []));
  const [saving, setSaving] = useState(false);

  function toggle(code: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function finish() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ regions: Array.from(selected), onboarding_completed: true })
      .eq('id', user!.id);
    if (error) {
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
    router.replace('/(tabs)/collection');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#6366F1" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDotActive]} />
          <View style={[styles.progressDot, styles.progressDotActive]} />
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.step}>Paso 2 de 2</Text>
        <Text style={styles.title}>¿Dónde harías intercambios?</Text>
        <Text style={styles.subtitle}>
          Elegí una o más regiones para conectar con coleccionistas cerca tuyo. Podés cambiarlo cuando quieras desde Configuración.
        </Text>

        <View style={styles.list}>
          {CHILE_REGIONS.map(r => {
            const isOn = selected.has(r.code);
            return (
              <TouchableOpacity
                key={r.code}
                style={[styles.row, isOn && styles.rowActive]}
                onPress={() => toggle(r.code)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>{r.label}</Text>
                {isOn && <Ionicons name="checkmark-circle" size={20} color="#6366F1" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, (selected.size === 0 || saving) && styles.nextBtnDisabled]}
          onPress={finish}
          disabled={selected.size === 0 || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.nextBtnText}>Listo</Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  backBtn: { width: 28, alignItems: 'flex-start' },
  progress: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 22, height: 4, borderRadius: 2, backgroundColor: '#334155' },
  progressDotActive: { backgroundColor: '#6366F1' },
  scroll: { padding: 24, gap: 8, paddingBottom: 24 },
  step: { color: '#64748B', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: '#F1F5F9', fontSize: 24, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginTop: 8 },
  list: { gap: 8, marginTop: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B',
  },
  rowActive: { borderColor: '#6366F1', backgroundColor: '#6366F122' },
  rowLabel: { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },
  rowLabelActive: { color: '#A5B4FC' },
  footer: { padding: 24, paddingBottom: 36 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
