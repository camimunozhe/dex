import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ALL_GAMES, GAME_DISPLAY_NAMES, resolveEnabledGames } from '@/lib/enabledGames';
import type { TCGGame } from '@/types/database';

export default function GamesScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const enabled = resolveEnabledGames(profile?.enabled_games);

  async function toggle(game: TCGGame) {
    if (saving) return;
    const next = enabled.includes(game) ? enabled.filter(g => g !== game) : [...enabled, game];
    if (next.length === 0) {
      Alert.alert('Selecciona al menos uno', 'Necesitas tener al menos un juego habilitado.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ enabled_games: next }).eq('id', user!.id);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#6366F1" />
          <Text style={styles.back}>Perfil</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Juegos</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Elegí los juegos que coleccionás. Solo se muestran en tu colección, en explorar y al agregar cartas. Podés cambiarlo cuando quieras — no se borra ningún dato.
        </Text>

        {ALL_GAMES.filter(g => g !== 'other').map(g => {
          const isOn = enabled.includes(g);
          return (
            <TouchableOpacity
              key={g}
              style={[styles.row, isOn && styles.rowActive]}
              onPress={() => toggle(g)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>
                {GAME_DISPLAY_NAMES[g]}
              </Text>
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
  title: { color: '#F1F5F9', fontSize: 17, fontWeight: '700' },
  scroll: { padding: 16, gap: 8 },
  intro: { color: '#64748B', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowActive: { borderColor: '#6366F1' },
  rowLabel: { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
  rowLabelActive: { color: '#F1F5F9' },
});
