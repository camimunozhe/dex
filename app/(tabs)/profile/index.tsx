import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { GAME_DISPLAY_NAMES, resolveEnabledGames } from '@/lib/enabledGames';

type Reputation = { positive_count: number; negative_count: number; total_ratings: number } | null;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const VERIFICATION_BADGE: Record<string, { icon: IoniconName; color: string; label: string }> = {
  none: { icon: 'ellipse-outline', color: '#94A3B8', label: 'Sin verificar' },
  basic: { icon: 'checkmark-circle', color: '#3B82F6', label: 'Básico' },
  intermediate: { icon: 'shield-checkmark', color: '#22C55E', label: 'Intermedio' },
  advanced: { icon: 'star', color: '#A855F7', label: 'Avanzado' },
};

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [reputation, setReputation] = useState<Reputation>(null);
  const [collectionCount, setCollectionCount] = useState(0);
  const [meetupCount, setMeetupCount] = useState(0);
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
    ]).then(([rep, col, meet]) => {
      setReputation(rep.data as Reputation);
      setCollectionCount(col.count ?? 0);
      setMeetupCount(meet.count ?? 0);
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

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user!.id);

      if (updateError) throw updateError;

      await refreshProfile();
    } catch (e) {
      Alert.alert('Error', 'No se pudo subir la imagen. Intenta de nuevo.');
    } finally {
      setUploadingAvatar(false);
    }
  }


  async function handleSignOut() {
    Alert.alert('Cerrar sesión', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  }

  const verLevel = profile?.verification_level ?? 'none';
  const verBadge = VERIFICATION_BADGE[verLevel] ?? VERIFICATION_BADGE.none;
  const positiveRate = reputation && reputation.total_ratings > 0
    ? Math.round((reputation.positive_count / reputation.total_ratings) * 100)
    : null;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#94A3B8" />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.hero}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {profile?.username?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>

          <Text style={styles.username}>@{profile?.username}</Text>
          {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={() => router.push('/(tabs)/profile/verify')}
          >
            <Ionicons name={verBadge.icon} size={14} color={verBadge.color} style={styles.verifyBtnIcon} />
            <Text style={styles.verifyBtnText}>{verBadge.label}</Text>
            {verLevel !== 'advanced' && (
              <Ionicons name="chevron-forward" size={14} color="#6366F1" style={styles.verifyArrow} />
            )}
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <StatBox label="Cartas" value={String(collectionCount)} />
          <StatBox label="Encuentros" value={String(meetupCount)} />
          <StatBox
            label="Reputación"
            value={positiveRate !== null ? `${positiveRate}%` : '—'}
            sub={reputation ? `${reputation.total_ratings} ratings` : undefined}
          />
        </View>

        {/* Reputación detalle */}
        {reputation && reputation.total_ratings > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reputación de la comunidad</Text>
            <View style={styles.repBar}>
              <View style={[styles.repPositive, { flex: reputation.positive_count }]} />
              <View style={[styles.repNegative, { flex: reputation.negative_count || 0.01 }]} />
            </View>
            <View style={styles.repLabels}>
              <View style={styles.repLabelItem}>
                <Ionicons name="thumbs-up" size={14} color="#4ADE80" />
                <Text style={styles.repPositiveText}>{reputation.positive_count} positivos</Text>
              </View>
              <View style={styles.repLabelItem}>
                <Ionicons name="thumbs-down" size={14} color="#EF4444" />
                <Text style={styles.repNegativeText}>{reputation.negative_count} negativos</Text>
              </View>
            </View>
          </View>
        )}

        {/* Configuración */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          <View style={styles.settingsList}>
        {/* Configuración */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          <View style={styles.settingsList}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/(tabs)/profile/games')}
            >
              <View style={styles.menuItemContent}>
                <Ionicons name="game-controller-outline" size={18} color="#94A3B8" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Juegos</Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {resolveEnabledGames(profile?.enabled_games).filter(g => g !== 'other').map(g => GAME_DISPLAY_NAMES[g].split(':')[0]).join(' · ')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => router.push('/(tabs)/profile/currency')}
            >
              <View style={styles.menuItemContent}>
                <Ionicons name="cash-outline" size={18} color="#94A3B8" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Divisa</Text>
                  <Text style={styles.menuItemSub}>Para mostrar precios en tu colección</Text>
                </View>
              </View>
              <View style={styles.settingRowRight}>
                <Text style={styles.settingValue}>{(profile?.currency ?? 'usd').toUpperCase()}</Text>
                <Ionicons name="chevron-forward" size={18} color="#64748B" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Verificación */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identidad</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/(tabs)/profile/verify')}
          >
            <View style={styles.menuItemContent}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#94A3B8" />
              <Text style={styles.menuItemText}>Verificación de identidad</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Cuenta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.settingsList}>
            <View style={styles.menuItem}>
              <View style={styles.menuItemContent}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" />
                <Text style={styles.menuItemText}>{user?.email}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleSignOut}>
              <Text style={styles.menuItemDangerText}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 30 }} />
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
  hero: { alignItems: 'center', padding: 24, paddingBottom: 20 },

  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImg: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#6366F1' },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#334155', borderWidth: 2, borderColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
  },

  username: { color: '#F1F5F9', fontSize: 20, fontWeight: '800' },
  bio: { color: '#64748B', fontSize: 14, marginTop: 4, textAlign: 'center' },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, backgroundColor: '#1E293B',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
    borderWidth: 1, borderColor: '#334155',
  },
  verifyBtnIcon: { marginRight: 6 },
  verifyBtnText: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
  verifyArrow: { marginLeft: 4 },
  stats: {
    flexDirection: 'row',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  statBox: { flex: 1, alignItems: 'center', padding: 16, borderRightWidth: 1, borderRightColor: '#334155' },
  statValue: { color: '#F1F5F9', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#64748B', fontSize: 12, marginTop: 2 },
  statSub: { color: '#475569', fontSize: 10 },
  section: { marginHorizontal: 16, marginTop: 16 },
  sectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  settingsList: {
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155', overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155',
    backgroundColor: '#1E293B', borderRadius: 0,
  },
  menuItemContent: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { color: '#F1F5F9', fontSize: 14 },
  menuItemDanger: { borderBottomWidth: 0 },
  menuItemDangerText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  repBar: {
    height: 10, borderRadius: 5, flexDirection: 'row',
    overflow: 'hidden', backgroundColor: '#334155',
  },
  repPositive: { backgroundColor: '#4ADE80' },
  repNegative: { backgroundColor: '#EF4444' },
  repLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  repLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repPositiveText: { color: '#4ADE80', fontSize: 12 },
  repNegativeText: { color: '#EF4444', fontSize: 12 },
  settingRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingValue: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  menuItemSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
});
