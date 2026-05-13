import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { usePremium } from '@/lib/usePremium';
import { useDialog } from '@/lib/AppDialog';
import { supabase } from '@/lib/supabase';
import type { WatchlistEntry } from '@/lib/watchlist';
import { removeFromWatchlist } from '@/lib/watchlist';
import type { CardCondition } from '@/types/database';

const CONDITION_LABELS: Record<CardCondition, string> = {
  mint: 'Nueva', near_mint: 'Casi nueva', excellent: 'Excelente',
  good: 'Buena', played: 'Jugada', poor: 'Dañada',
};

export default function WatchlistScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const dialog = useDialog();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from('card_watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setEntries((data as WatchlistEntry[]) ?? []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [user?.id]));

  async function updateEntry(id: string, patch: Partial<WatchlistEntry>) {
    const { error } = await supabase.from('card_watchlist').update(patch).eq('id', id);
    if (error) { dialog.alert({ title: 'Error', message: error.message }); return; }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function confirmRemove(entry: WatchlistEntry) {
    dialog.confirm({
      title: 'Quitar de watchlist',
      message: `¿Sacar "${entry.card_name}" de tu watchlist?`,
      confirmText: 'Quitar',
      cancelText: 'Cancelar',
      destructive: true,
      onConfirm: async () => {
        await removeFromWatchlist(entry.id);
        setEntries(prev => prev.filter(e => e.id !== entry.id));
      },
    });
  }

  function toggleCondition(entry: WatchlistEntry, c: CardCondition) {
    const set = new Set(entry.conditions);
    set.has(c) ? set.delete(c) : set.add(c);
    updateEntry(entry.id, { conditions: Array.from(set) as CardCondition[] });
  }

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Header onBack={() => router.back()} />
        <View style={styles.proGate}>
          <View style={styles.proGateIcon}>
            <Ionicons name="notifications" size={42} color="#FACC15" />
          </View>
          <Text style={styles.proGateTitle}>Watchlist con alertas</Text>
          <Text style={styles.proGateDesc}>
            Marcá cartas que querés conseguir y te avisamos por push cuando alguien las publica.
          </Text>
          <TouchableOpacity style={styles.proGateBtn} onPress={() => router.push('/paywall')}>
            <Ionicons name="star" size={14} color="#0F172A" />
            <Text style={styles.proGateBtnText}>Probar Trocora Pro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header onBack={() => router.back()} onAdd={() => router.push('/(tabs)/profile/watchlist-add')} />
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={48} color="#334155" />
          <Text style={styles.emptyText}>Aún no agregaste cartas a tu watchlist.</Text>
          <Text style={styles.emptyHint}>
            Buscá una carta en Explorar y tocá el corazón para empezar a recibir alertas.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {entries.map(e => (
            <View key={e.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.thumb}>
                  {e.image_url
                    ? <Image source={{ uri: e.image_url }} style={{ width: 50, height: 70, borderRadius: 6 }} contentFit="contain" />
                    : <Ionicons name="card-outline" size={24} color="#64748B" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>{e.card_name}</Text>
                  {e.set_name && <Text style={styles.cardSet} numberOfLines={1}>{e.set_name}</Text>}
                </View>
                <TouchableOpacity onPress={() => confirmRemove(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Filtros</Text>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => updateEntry(e.id, { foil_only: !e.foil_only })}
                >
                  <Ionicons name={e.foil_only ? 'checkbox' : 'square-outline'} size={20} color={e.foil_only ? '#6366F1' : '#64748B'} />
                  <Text style={styles.toggleText}>Solo Foil / Holo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => updateEntry(e.id, { match_only_my_regions: !e.match_only_my_regions })}
                >
                  <Ionicons name={e.match_only_my_regions ? 'checkbox' : 'square-outline'} size={20} color={e.match_only_my_regions ? '#6366F1' : '#64748B'} />
                  <Text style={styles.toggleText}>Solo en mis regiones</Text>
                </TouchableOpacity>

                <Text style={styles.subLabel}>Condiciones</Text>
                <View style={styles.condChips}>
                  {(Object.keys(CONDITION_LABELS) as CardCondition[]).map(c => {
                    const on = e.conditions.includes(c);
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.condChip, on && styles.condChipActive]}
                        onPress={() => toggleCondition(e, c)}
                      >
                        <Text style={[styles.condChipText, on && styles.condChipTextActive]}>{CONDITION_LABELS[c]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {e.conditions.length === 0 && (
                  <Text style={styles.allHint}>Sin condiciones marcadas = cualquier condición</Text>
                )}
              </View>
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, onAdd }: { onBack: () => void; onAdd?: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={24} color="#6366F1" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Watchlist</Text>
      {onAdd ? (
        <TouchableOpacity onPress={onAdd} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="add" size={26} color="#6366F1" />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 24 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  headerTitle: { color: '#F1F5F9', fontSize: 17, fontWeight: '700' },

  scroll: { padding: 16, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyText: { color: '#94A3B8', fontSize: 15, fontWeight: '600', marginTop: 8 },
  emptyHint: { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  thumb: {
    width: 50, height: 70, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  cardName: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  cardSet: { color: '#64748B', fontSize: 12, marginTop: 1 },

  filterSection: { padding: 12, gap: 8 },
  filterLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  toggleText: { color: '#F1F5F9', fontSize: 14 },
  subLabel: { color: '#94A3B8', fontSize: 12, marginTop: 8 },
  condChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  condChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#334155',
    backgroundColor: '#0F172A',
  },
  condChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  condChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  condChipTextActive: { color: '#fff' },
  allHint: { color: '#64748B', fontSize: 11, fontStyle: 'italic', marginTop: 4 },

  proGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  proGateIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(250,204,21,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  proGateTitle: { color: '#F1F5F9', fontSize: 22, fontWeight: '800' },
  proGateDesc: { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  proGateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FACC15', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    marginTop: 12,
  },
  proGateBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
});
