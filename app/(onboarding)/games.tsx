import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { GAME_DISPLAY_NAMES } from '@/lib/enabledGames';
import type { TCGGame } from '@/types/database';

const SELECTABLE: TCGGame[] = ['pokemon', 'magic'];

export default function OnboardingGamesScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<TCGGame>>(
    new Set((profile?.enabled_games ?? []).filter(g => SELECTABLE.includes(g))),
  );
  const [saving, setSaving] = useState(false);

  function toggle(g: TCGGame) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  async function next() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ enabled_games: Array.from(selected) })
      .eq('id', user!.id);
    if (error) {
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
    router.push('/(onboarding)/regions');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.progress}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressDot} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.step}>Paso 1 de 2</Text>
        <Text style={styles.title}>¿Qué cartas coleccionás?</Text>
        <Text style={styles.subtitle}>
          Elegí los juegos que te interesan. Solo se mostrarán esos en tu colección, al agregar cartas y al explorar.
        </Text>

        <View style={styles.list}>
          {SELECTABLE.map(g => {
            const isOn = selected.has(g);
            return (
              <TouchableOpacity
                key={g}
                style={[styles.row, isOn && styles.rowActive]}
                onPress={() => toggle(g)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>
                  {GAME_DISPLAY_NAMES[g]}
                </Text>
                {isOn && <Ionicons name="checkmark-circle" size={22} color="#6366F1" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, (selected.size === 0 || saving) && styles.nextBtnDisabled]}
          onPress={next}
          disabled={selected.size === 0 || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.nextBtnText}>Continuar</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 12 },
  progressDot: { width: 22, height: 4, borderRadius: 2, backgroundColor: '#334155' },
  progressDotActive: { backgroundColor: '#6366F1' },
  scroll: { padding: 24, gap: 8, paddingBottom: 24 },
  step: { color: '#64748B', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: '#F1F5F9', fontSize: 24, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginTop: 8 },
  list: { gap: 10, marginTop: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B',
  },
  rowActive: { borderColor: '#6366F1', backgroundColor: '#6366F122' },
  rowLabel: { color: '#F1F5F9', fontSize: 16, fontWeight: '600' },
  rowLabelActive: { color: '#A5B4FC' },
  footer: { padding: 24, paddingBottom: 36 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
