import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Switch, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Reputation = { positive_count: number; negative_count: number; total_ratings: number } | null;

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [reputation, setReputation] = useState<Reputation>(null);
  const [collectionCount, setCollectionCount] = useState(0);
  const [meetupCount, setMeetupCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingPublic, setSavingPublic] = useState(false);

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

  async function toggleCollectionPublic(value: boolean) {
    setSavingPublic(true);
    await supabase.from('profiles').update({ collection_public: value }).eq('id', user!.id);
    await refreshProfile();
    setSavingPublic(false);
  }

  async function handleSignOut() {
    Alert.alert('Cerrar sesión', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  }

  const verLevel = profile?.verification_level ?? 'none';
  const verLabel: Record<string, string> = {
    none: '⚪ Sin verificar',
    basic: '🔵 Básico',
    intermediate: '🟢 Intermedio',
    advanced: '🟣 Avanzado',
  };
  const positiveRate = reputation && reputation.total_ratings > 0
    ? Math.round((reputation.positive_count / reputation.total_ratings) * 100)
    : null;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#6366F1" />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.username?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.username}>@{profile?.username}</Text>
          {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={() => router.push('/(tabs)/profile/verify')}
          >
            <Text style={styles.verifyBtnText}>{verLabel[verLevel]}</Text>
            {verLevel !== 'advanced' && <Text style={styles.verifyArrow}> →</Text>}
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
              <Text style={styles.repPositiveText}>👍 {reputation.positive_count} positivos</Text>
              <Text style={styles.repNegativeText}>👎 {reputation.negative_count} negativos</Text>
            </View>
          </View>
        )}

        {/* Configuración */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          <View style={styles.settingsList}>
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Colección pública</Text>
                <Text style={styles.settingDesc}>Otros usuarios pueden ver tus cartas</Text>
              </View>
              <Switch
                value={profile?.collection_public ?? false}
                onValueChange={toggleCollectionPublic}
                disabled={savingPublic}
                trackColor={{ true: '#6366F1' }}
              />
            </View>
          </View>
        </View>

        {/* Verificación */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identidad</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/(tabs)/profile/verify')}
          >
            <Text style={styles.menuItemText}>🛡️ Verificación de identidad</Text>
            <Text style={styles.menuItemArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Cuenta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.settingsList}>
            <View style={styles.menuItem}>
              <Text style={styles.menuItemText}>📧 {user?.email}</Text>
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
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  username: { color: '#F1F5F9', fontSize: 20, fontWeight: '800' },
  bio: { color: '#64748B', fontSize: 14, marginTop: 4, textAlign: 'center' },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, backgroundColor: '#1E293B',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
    borderWidth: 1, borderColor: '#334155',
  },
  verifyBtnText: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
  verifyArrow: { color: '#6366F1', fontSize: 14, fontWeight: '700' },
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
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  settingLabel: { color: '#F1F5F9', fontSize: 14, fontWeight: '500' },
  settingDesc: { color: '#64748B', fontSize: 12, marginTop: 2 },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155',
    backgroundColor: '#1E293B', borderRadius: 0,
  },
  menuItemText: { color: '#F1F5F9', fontSize: 14 },
  menuItemArrow: { color: '#64748B', fontSize: 16 },
  menuItemDanger: { borderBottomWidth: 0 },
  menuItemDangerText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  repBar: {
    height: 10, borderRadius: 5, flexDirection: 'row',
    overflow: 'hidden', backgroundColor: '#334155',
  },
  repPositive: { backgroundColor: '#4ADE80' },
  repNegative: { backgroundColor: '#EF4444' },
  repLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  repPositiveText: { color: '#4ADE80', fontSize: 12 },
  repNegativeText: { color: '#EF4444', fontSize: 12 },
});
