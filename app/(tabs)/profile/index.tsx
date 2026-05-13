import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ProBadge } from '@/lib/ProBadge';

type Reputation = { positive_count: number; negative_count: number; total_ratings: number } | null;
type GameBreakdown = { pokemon: number; magic: number; published: number };
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const VERIFICATION_BADGE: Record<string, { icon: IoniconName; color: string; label: string }> = {
  none: { icon: 'ellipse-outline', color: '#94A3B8', label: 'Sin verificar' },
  basic: { icon: 'checkmark-circle', color: '#3B82F6', label: 'Básico' },
  intermediate: { icon: 'shield-checkmark', color: '#22C55E', label: 'Intermedio' },
  advanced: { icon: 'star', color: '#A855F7', label: 'Avanzado' },
};

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
  return `${month} ${d.getFullYear()}`;
}

export default function ProfileScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [reputation, setReputation] = useState<Reputation>(null);
  const [collectionCount, setCollectionCount] = useState(0);
  const [meetupCount, setMeetupCount] = useState(0);
  const [breakdown, setBreakdown] = useState<GameBreakdown>({ pokemon: 0, magic: 0, published: 0 });
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('user_reputation').select('*').eq('user_id', user.id).single(),
      supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('meetups').select('id', { count: 'exact' })
        .or(`proposer_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq('status', 'completed'),
      supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', user.id).eq('game', 'pokemon'),
      supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', user.id).eq('game', 'magic'),
      supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', user.id).eq('is_published', true),
    ]).then(([rep, col, meet, pkm, mtg, pub]) => {
      setReputation(rep.data as Reputation);
      setCollectionCount(col.count ?? 0);
      setMeetupCount(meet.count ?? 0);
      setBreakdown({ pokemon: pkm.count ?? 0, magic: mtg.count ?? 0, published: pub.count ?? 0 });
      setLoading(false);
    });
  }, [user]);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar la foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user!.id}/avatar.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: bustedUrl })
        .eq('id', user!.id);

      if (updateError) throw updateError;

      await refreshProfile();
    } catch (e) {
      Alert.alert('Error', 'No se pudo subir la imagen. Intenta de nuevo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  const verLevel = profile?.verification_level ?? 'none';
  const verBadge = VERIFICATION_BADGE[verLevel] ?? VERIFICATION_BADGE.none;
  const since = memberSince(profile?.created_at);
  const positiveRate = reputation && reputation.total_ratings > 0
    ? Math.round((reputation.positive_count / reputation.total_ratings) * 100)
    : null;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#94A3B8" />;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={{ width: 36 }} />
        <Text style={styles.topBarTitle}>Perfil</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile/settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.settingsBtn}
        >
          <Ionicons name="settings-outline" size={22} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <ScrollView>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{profile?.username?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>

          <View style={styles.usernameRow}>
            <Text style={styles.username}>@{profile?.username}</Text>
            <ProBadge status={profile?.premium_status} size="md" />
          </View>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          <View style={styles.badgesRow}>
            <TouchableOpacity style={styles.badgeChip} onPress={() => router.push('/(tabs)/profile/verify')}>
              <Ionicons name={verBadge.icon} size={13} color={verBadge.color} />
              <Text style={styles.badgeText}>{verBadge.label}</Text>
              {verLevel !== 'advanced' && <Ionicons name="chevron-forward" size={12} color="#64748B" />}
            </TouchableOpacity>
            {since && (
              <View style={styles.badgeChip}>
                <Ionicons name="calendar-outline" size={13} color="#94A3B8" />
                <Text style={styles.badgeText}>Desde {since}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.stats}>
          <StatBox label="Cartas" value={String(collectionCount)} />
          <View style={styles.statDivider} />
          <StatBox label="Intercambios" value={String(meetupCount)} />
          <View style={styles.statDivider} />
          <StatBox
            label="Reputación"
            value={positiveRate !== null ? `${positiveRate}%` : '—'}
            sub={reputation && reputation.total_ratings > 0 ? `${reputation.total_ratings} ratings` : undefined}
          />
        </View>

        {collectionCount > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Colección</Text>
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
                  <Text style={styles.metricLabelText}>Publicadas</Text>
                </View>
                <Text style={[styles.metricValue, { color: '#4ADE80' }]}>{breakdown.published}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.statsLink} onPress={() => router.push('/(tabs)/profile/stats')} activeOpacity={0.7}>
              <Ionicons name="stats-chart" size={16} color="#FB923C" />
              <Text style={styles.statsLinkText}>Ver stats completas</Text>
              <Ionicons name="chevron-forward" size={14} color="#64748B" />
            </TouchableOpacity>
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

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  topBarTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  settingsBtn: { width: 36, alignItems: 'flex-end' },

  hero: { alignItems: 'center', padding: 24, paddingTop: 8, paddingBottom: 16 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#6366F1' },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#334155', borderWidth: 2, borderColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
  },

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
  statsLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    padding: 12,
  },
  statsLinkText: { color: '#F1F5F9', fontSize: 14, fontWeight: '600', flex: 1 },

  repBar: { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#334155' },
  repPositive: { backgroundColor: '#4ADE80' },
  repNegative: { backgroundColor: '#EF4444' },
  repLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  repLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repPositiveText: { color: '#4ADE80', fontSize: 12 },
  repNegativeText: { color: '#EF4444', fontSize: 12 },
});
