import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { resolveEnabledGames } from '@/lib/enabledGames';
import type { CardCollection } from '@/types/database';

const CARD_THUMB_WIDTH = (Dimensions.get('window').width - 32 - 16) / 3;

export default function NuevaPropuestaScreen() {
  const { receiver_id, card_id } = useLocalSearchParams<{ receiver_id: string; card_id: string }>();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [receiverProfile, setReceiverProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [theirCards, setTheirCards] = useState<CardCollection[]>([]);
  const [selectedTheir, setSelectedTheir] = useState<Set<string>>(new Set(card_id ? [card_id] : []));


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const enabled = resolveEnabledGames(profile?.enabled_games);
    const [profileRes, theirRes] = await Promise.all([
      supabase.from('profiles').select('username, avatar_url').eq('id', receiver_id).single(),
      supabase.from('cards_collection')
        .select('*')
        .eq('user_id', receiver_id)
        .eq('is_published', true)
        .in('game', enabled)
        .order('created_at', { ascending: false }),
    ]);
    setReceiverProfile(profileRes.data as any);
    setTheirCards((theirRes.data ?? []) as CardCollection[]);
  }, [receiver_id, profile?.enabled_games]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  async function submit() {
    if (selectedTheir.size === 0) { Alert.alert('Selecciona al menos una carta'); return; }

    setSaving(true);
    const { data: meetupData, error } = await supabase.from('meetups').insert({
      proposer_id: user!.id,
      receiver_id,
      type: 'trade',
      status: 'pending',
      scheduled_at: null,
      notes: null,
      last_modified_by: user!.id,
    }).select().single();

    if (error || !meetupData) {
      console.error('[meetups.insert]', error);
      Alert.alert('Error al crear el intercambio', error?.message ?? 'Error desconocido');
      setSaving(false);
      return;
    }

    const meetupId = (meetupData as any).id;
    const cardInserts = Array.from(selectedTheir).map(cid => ({
      meetup_id: meetupId, card_id: cid, side: 'receiver' as const,
    }));
    const { error: cardsError } = await supabase.from('meetup_cards').insert(cardInserts);
    if (cardsError) {
      console.error('[meetup_cards.insert]', cardsError);
      Alert.alert('Intercambio creado pero falló agregar cartas', cardsError.message);
      setSaving(false);
      return;
    }

    const added = Array.from(selectedTheir)
      .map(cid => theirCards.find(c => c.id === cid))
      .filter((c): c is CardCollection => !!c)
      .map(c => ({ id: c.id, name: c.card_name, img: c.image_url, side: 'receiver' as const }));
    const snapshotBody = `__TRADE_SNAPSHOT__:${JSON.stringify({ event: 'proposed', added, removed: [] })}`;
    await supabase.from('messages').insert({
      meetup_id: meetupId,
      sender_id: user!.id,
      body: snapshotBody,
    });

    setSaving(false);
    router.replace('/(tabs)/encuentros');
    router.push({ pathname: '/(tabs)/encuentros/[id]', params: { id: meetupId } });
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#94A3B8" />;

  const initialCard = card_id ? theirCards.find(c => c.id === card_id) : null;
  const otherCards = initialCard
    ? theirCards.filter(c => c.id !== card_id && c.game === initialCard.game)
    : theirCards.filter(c => c.id !== card_id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo intercambio</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">

          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              {receiverProfile?.avatar_url
                ? <Image source={{ uri: receiverProfile.avatar_url }} style={styles.avatar} />
                : <Ionicons name="person-outline" size={20} color="#64748B" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileLabel}>Intercambio con</Text>
              <Text style={styles.profileName}>@{receiverProfile?.username ?? '—'}</Text>
            </View>
          </View>

          {initialCard && (
            <View>
              <Text style={styles.sectionLabel}>Carta inicial</Text>
              <View style={styles.featuredCard}>
                {initialCard.image_url
                  ? <Image source={{ uri: initialCard.image_url }} style={styles.featuredImg} contentFit="contain" />
                  : <View style={styles.featuredPlaceholder}><Ionicons name="albums-outline" size={32} color="#64748B" /></View>}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.featuredName}>{initialCard.card_name}</Text>
                  {initialCard.set_name && <Text style={styles.featuredSub}>{initialCard.set_name}</Text>}
                </View>
              </View>
            </View>
          )}

          {otherCards.length > 0 && (
            <View>
              <Text style={styles.sectionLabel}>Otras cartas disponibles de @{receiverProfile?.username ?? '—'}</Text>
              <Text style={styles.sectionSub}>Toca para agregar al intercambio</Text>
              <CardGrid
                cards={otherCards}
                selected={selectedTheir}
                onToggle={id => setSelectedTheir(prev => toggle(prev, id))}
              />
            </View>
          )}

          <View style={styles.hintBox}>
            <Ionicons name="chatbubbles-outline" size={16} color="#94A3B8" />
            <Text style={styles.hintText}>
              Al enviar, se abre un chat con @{receiverProfile?.username ?? 'el otro'} para acordar qué das a cambio, el precio, o ambos.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, (saving || selectedTheir.size === 0) && styles.sendBtnDisabled]}
            onPress={submit}
            disabled={saving || selectedTheir.size === 0}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.sendBtnText}>Enviar intercambio</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CardGrid({ cards, selected, onToggle }: {
  cards: CardCollection[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.cardGrid}>
      {cards.map(card => {
        const isSelected = selected.has(card.id);
        return (
          <TouchableOpacity
            key={card.id}
            style={[styles.cardThumb, isSelected && styles.cardThumbSelected]}
            onPress={() => onToggle(card.id)}
            activeOpacity={0.7}
          >
            {card.image_url
              ? <Image source={{ uri: card.image_url }} style={styles.cardThumbImg} contentFit="contain" />
              : <View style={styles.cardThumbPlaceholder}><Ionicons name="albums-outline" size={24} color="#64748B" /></View>}
            <Text style={styles.cardThumbName} numberOfLines={1}>{card.card_name}</Text>
            {isSelected && (
              <View style={styles.cardCheck}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  back: { color: '#6366F1', fontSize: 15, width: 60 },
  headerTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },

  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1E293B', borderRadius: 14, borderWidth: 1, borderColor: '#334155', padding: 14,
  },
  avatarWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: 44, height: 44 },
  profileLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  profileName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },

  sectionLabel: {
    color: '#94A3B8', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  sectionSub: { color: '#64748B', fontSize: 12, marginTop: -4, marginBottom: 10 },

  featuredCard: {
    flexDirection: 'row', gap: 12, backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#6366F1', padding: 10,
  },
  featuredImg: { width: 70, height: 98, borderRadius: 6 },
  featuredPlaceholder: {
    width: 70, height: 98, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  featuredName: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  featuredSub: { color: '#94A3B8', fontSize: 12 },

  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardThumb: {
    width: CARD_THUMB_WIDTH, backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1, borderColor: '#334155', padding: 6, alignItems: 'center', gap: 4,
  },
  cardThumbSelected: { borderColor: '#6366F1', borderWidth: 2 },
  cardThumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  cardThumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  cardThumbName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  cardCheck: {
    position: 'absolute', top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
  },

  hintBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155',
    borderLeftWidth: 3, borderLeftColor: '#6366F1',
    padding: 12,
  },
  hintText: { flex: 1, color: '#94A3B8', fontSize: 13, lineHeight: 18 },

  sendBtn: {
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
