import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ProBadge } from '@/lib/ProBadge';
import type { Profile } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const VERIFICATION_BADGE: Record<string, { icon: IoniconName; color: string; label: string }> = {
  none: { icon: 'ellipse-outline', color: '#94A3B8', label: 'Sin verificar' },
  basic: { icon: 'checkmark-circle', color: '#3B82F6', label: 'Básico' },
  intermediate: { icon: 'shield-checkmark', color: '#22C55E', label: 'Intermedio' },
  advanced: { icon: 'star', color: '#A855F7', label: 'Avanzado' },
};

type Reputation = { positive_count: number; negative_count: number; total_ratings: number } | null;
type GameBreakdown = { pokemon: number; magic: number; published: number };

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
  return `${month} ${d.getFullYear()}`;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reputation, setReputation] = useState<Reputation>(null);
  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  const [meetupCount, setMeetupCount] = useState(0);
  const [breakdown, setBreakdown] = useState<GameBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    if (user && id === user.id) {
      router.replace('/(tabs)/profile');
      return;
    }
    (async () => {
      const [pRes, repRes, colRes, meetRes, pkmRes, mtgRes, pubRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('user_reputation').select('*').eq('user_id', id).single(),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id),
        supabase.from('meetups').select('id', { count: 'exact' })
          .or(`proposer_id.eq.${id},receiver_id.eq.${id}`)
          .eq('status', 'completed'),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id).eq('game', 'pokemon').eq('is_published', true),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id).eq('game', 'magic').eq('is_published', true),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id).eq('is_published', true),
      ]);
      const prof = pRes.data as Profile | null;
      setProfile(prof);
      setReputation(repRes.data as Reputation);
      setCollectionCount(prof?.collection_public ? (colRes.count ?? 0) : null);
      setMeetupCount(meetRes.count ?? 0);
      setBreakdown({
        pokemon: pkmRes.count ?? 0,
        magic: mtgRes.count ?? 0,
        published: pubRes.count ?? 0,
      });
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#94A3B8" />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color="#6366F1" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="person-outline" size={48} color="#334155" />
          <Text style={styles.notFoundText}>No se encontró este usuario.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const verBadge = VERIFICATION_BADGE[profile.verification_level ?? 'none'] ?? VERIFICATION_BADGE.none;
  const since = memberSince(profile.created_at);
  const positiveRate = reputation && reputation.total_ratings > 0
    ? Math.round((reputation.positive_count / reputation.total_ratings) * 100)
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="#6366F1" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>@{profile.username}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{profile.username[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
          </View>

          <View style={styles.usernameRow}>
            <Text style={styles.username}>@{profile.username}</Text>
            <ProBadge status={profile.premium_status} size="md" />
          </View>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          <View style={styles.badgesRow}>
            <View style={styles.badgeChip}>
              <Ionicons name={verBadge.icon} size={13} color={verBadge.color} />
              <Text style={styles.badgeText}>{verBadge.label}</Text>
            </View>
            {since && (
              <View style={styles.badgeChip}>
                <Ionicons name="calendar-outline" size={13} color="#94A3B8" />
                <Text style={styles.badgeText}>Desde {since}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.stats}>
          {collectionCount !== null && (
            <>
              <StatBox label="Cartas" value={String(collectionCount)} />
              <View style={styles.statDivider} />
            </>
          )}
          <StatBox label="Intercambios" value={String(meetupCount)} />
          <View style={styles.statDivider} />
          <StatBox
            label="Reputación"
            value={positiveRate !== null ? `${positiveRate}%` : '—'}
            sub={reputation && reputation.total_ratings > 0 ? `${reputation.total_ratings} ratings` : undefined}
          />
        </View>

        {breakdown && breakdown.published > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Publicaciones</Text>
            <View style={styles.metricsList}>
              {breakdown.pokemon > 0 && (
                <View style={styles.metricRow}>
                  <View style={styles.metricLabel}>
                    <View style={[styles.metricDot, { backgroundColor: '#FACC15' }]} />
                    <Text style={styles.metricLabelText}>Pokémon</Text>
                  </View>
                  <Text style={styles.metricValue}>{breakdown.pokemon}</Text>
                </View>
              )}
              {breakdown.magic > 0 && (
                <View style={styles.metricRow}>
                  <View style={styles.metricLabel}>
                    <View style={[styles.metricDot, { backgroundColor: '#A78BFA' }]} />
                    <Text style={styles.metricLabelText}>Magic</Text>
                  </View>
                  <Text style={styles.metricValue}>{breakdown.magic}</Text>
                </View>
              )}
              <View style={[styles.metricRow, styles.metricRowLast]}>
                <View style={styles.metricLabel}>
                  <Ionicons name="pricetag-outline" size={14} color="#4ADE80" />
                  <Text style={styles.metricLabelText}>Total publicadas</Text>
                </View>
                <Text style={[styles.metricValue, { color: '#4ADE80' }]}>{breakdown.published}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
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
  headerTitle: { color: '#F1F5F9', fontSize: 17, fontWeight: '700', maxWidth: '70%' },
  notFoundText: { color: '#64748B', fontSize: 14, marginTop: 12, textAlign: 'center' },

  hero: { alignItems: 'center', padding: 24, paddingBottom: 16 },
  avatarWrap: { marginBottom: 12 },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#6366F1' },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },

  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  username: { color: '#F1F5F9', fontSize: 22, fontWeight: '800' },
  bio: { color: '#94A3B8', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 320 },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 },
  badgeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1E293B', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#334155',
  },
  badgeText: { color: '#F1F5F9', fontSize: 12, fontWeight: '600' },

  stats: {
    flexDirection: 'row',
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  statBox: { flex: 1, alignItems: 'center', padding: 16 },
  statDivider: { width: 1, backgroundColor: '#334155' },
  statValue: { color: '#F1F5F9', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#64748B', fontSize: 12, marginTop: 2 },
  statSub: { color: '#475569', fontSize: 10 },

  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },

  repBar: { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#334155' },
  repPositive: { backgroundColor: '#4ADE80' },
  repNegative: { backgroundColor: '#EF4444' },
  repLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  repLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repPositiveText: { color: '#4ADE80', fontSize: 12 },
  repNegativeText: { color: '#EF4444', fontSize: 12 },

  metricsList: {
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155', overflow: 'hidden',
  },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  metricRowLast: { borderBottomWidth: 0 },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricDot: { width: 10, height: 10, borderRadius: 5 },
  metricLabelText: { color: '#F1F5F9', fontSize: 14 },
  metricValue: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
});
