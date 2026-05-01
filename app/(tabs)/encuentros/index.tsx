import { useCallback, useState, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Meetup } from '@/types/database';

type MeetupWithProfiles = Meetup & {
  proposer: { username: string; avatar_url: string | null } | null;
  receiver: { username: string; avatar_url: string | null } | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',  color: '#FACC15' },
  countered: { label: 'Contra-propuesta', color: '#FB923C' },
  confirmed: { label: 'Confirmado', color: '#4ADE80' },
  completed: { label: 'Completado', color: '#64748B' },
  cancelled: { label: 'Cancelado',  color: '#EF4444' },
};

const TYPE_LABEL: Record<string, string> = {
  trade: 'Intercambio',
  purchase: 'Compra',
  casual: 'Casual',
};

export default function EncuentrosScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [meetups, setMeetups] = useState<MeetupWithProfiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const isFirstMount = useRef(true);

  const fetchMeetups = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('meetups')
      .select('*, proposer:proposer_id(username, avatar_url), receiver:receiver_id(username, avatar_url)')
      .or(`proposer_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    setMeetups((data as MeetupWithProfiles[]) ?? []);
  }, [user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMeetups();
    setRefreshing(false);
  }, [fetchMeetups]);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setLoading(true);
      fetchMeetups().finally(() => setLoading(false));
    } else {
      fetchMeetups();
    }
  }, [fetchMeetups]));

  const filtered = meetups.filter(m =>
    tab === 'received' ? m.receiver_id === user?.id : m.proposer_id === user?.id
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Encuentros</Text>
      </View>

      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segBtn, tab === 'received' && styles.segBtnActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.segText, tab === 'received' && styles.segTextActive]}>Recibidas</Text>
          {meetups.filter(m => m.receiver_id === user?.id && m.status === 'pending').length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {meetups.filter(m => m.receiver_id === user?.id && m.status === 'pending').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, tab === 'sent' && styles.segBtnActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.segText, tab === 'sent' && styles.segTextActive]}>Enviadas</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#6366F1" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <MeetupRow
              meetup={item}
              isReceived={item.receiver_id === user?.id}
              onPress={() => router.push({ pathname: '/(tabs)/encuentros/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={<EmptyState tab={tab} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366F1" />
          }
        />
      )}
    </SafeAreaView>
  );
}

function MeetupRow({ meetup, isReceived, onPress }: {
  meetup: MeetupWithProfiles;
  isReceived: boolean;
  onPress: () => void;
}) {
  const other = isReceived ? meetup.proposer : meetup.receiver;
  const status = STATUS_LABEL[meetup.status] ?? { label: meetup.status, color: '#94A3B8' };
  const date = new Date(meetup.scheduled_at);
  const dateStr = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowAvatar}>
        {other?.avatar_url ? (
          <Image source={{ uri: other.avatar_url }} style={styles.avatar} />
        ) : (
          <Ionicons name="person-outline" size={20} color="#64748B" />
        )}
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowTop}>
          <Text style={styles.rowUsername}>@{other?.username ?? '—'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowType}>{TYPE_LABEL[meetup.type] ?? meetup.type}</Text>
          <Text style={styles.rowDate}>{dateStr}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward-outline" size={16} color="#475569" />
    </TouchableOpacity>
  );
}

function EmptyState({ tab }: { tab: 'received' | 'sent' }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={56} color="#334155" style={{ marginBottom: 12 }} />
      <Text style={styles.emptyTitle}>
        {tab === 'received' ? 'Sin propuestas recibidas' : 'No has enviado propuestas'}
      </Text>
      <Text style={styles.emptyText}>
        {tab === 'received'
          ? 'Cuando alguien quiera intercambiar o comprarte una carta, aparecerá aquí'
          : 'Explora cartas de otros coleccionistas y propón un encuentro'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 20, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9' },

  segmented: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 4,
  },
  segBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
  },
  segBtnActive: { backgroundColor: '#6366F1' },
  segText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  segTextActive: { color: '#fff' },
  badge: {
    backgroundColor: '#EF4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1E293B', borderRadius: 14, borderWidth: 1, borderColor: '#334155', padding: 14,
  },
  rowAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: 44, height: 44 },
  rowInfo: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowUsername: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowType: { color: '#94A3B8', fontSize: 12 },
  rowDate: { color: '#475569', fontSize: 12 },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9', textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});
