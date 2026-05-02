import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Currency } from '@/types/database';

const OPTIONS: { value: Currency; label: string; desc: string }[] = [
  { value: 'usd', label: 'USD', desc: 'Dólar estadounidense' },
  { value: 'clp', label: 'CLP', desc: 'Peso chileno' },
];

export default function CurrencyScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const current: Currency = profile?.currency ?? 'usd';

  async function setCurrency(value: Currency) {
    if (saving || current === value) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ currency: value }).eq('id', user!.id);
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
        <Text style={styles.title}>Divisa</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Elegí la moneda en la que querés ver y registrar los precios de tus cartas.
        </Text>

        {OPTIONS.map(opt => {
          const isOn = current === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.row, isOn && styles.rowActive]}
              onPress={() => setCurrency(opt.value)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>{opt.label}</Text>
                <Text style={styles.rowDesc}>{opt.desc}</Text>
              </View>
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
  rowLabel: { color: '#94A3B8', fontSize: 15, fontWeight: '700' },
  rowLabelActive: { color: '#F1F5F9' },
  rowDesc: { color: '#64748B', fontSize: 12, marginTop: 2 },
});
