import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/lib/AppDialog';
import { usePremium } from '@/lib/usePremium';
import { GAME_DISPLAY_NAMES, resolveEnabledGames } from '@/lib/enabledGames';

export default function SettingsScreen() {
  const router = useRouter();
  const dialog = useDialog();
  const { user, profile, signOut } = useAuth();
  const premium = usePremium();

  function handleSignOut() {
    dialog.confirm({
      title: 'Cerrar sesión',
      message: '¿Seguro que querés salir?',
      confirmText: 'Salir',
      cancelText: 'Cancelar',
      destructive: true,
      onConfirm: () => signOut(),
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="#6366F1" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <TouchableOpacity
          style={styles.proCard}
          activeOpacity={0.85}
          onPress={() => router.push('/paywall')}
        >
          <View style={styles.proIconBox}>
            <Ionicons name="star" size={18} color="#FACC15" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.proTitle}>
              {premium.status === 'active' ? 'Trocora Pro activo'
                : premium.status === 'in_grace' ? 'Problema con tu Pro'
                : premium.status === 'expired' ? 'Tu Pro venció'
                : 'Probar Trocora Pro'}
            </Text>
            <Text style={styles.proSub} numberOfLines={2}>
              {premium.isPremium
                ? premium.until
                  ? `Renueva el ${premium.until.toLocaleDateString('es')}`
                  : 'Acceso ilimitado a todas las funciones'
                : '7 días gratis · Alertas, boost, filtros avanzados y más'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#64748B" />
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trocora Pro</Text>
          <View style={styles.list}>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/(tabs)/profile/watchlist')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="heart-outline" size={18} color="#FACC15" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Watchlist y alertas</Text>
                  <Text style={styles.menuItemSub}>Cartas que querés conseguir</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.list}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/profile/games')}>
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
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/profile/currency')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="cash-outline" size={18} color="#94A3B8" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Divisa</Text>
                  <Text style={styles.menuItemSub}>Para mostrar precios en tu colección</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.value}>{(profile?.currency ?? 'usd').toUpperCase()}</Text>
                <Ionicons name="chevron-forward" size={18} color="#64748B" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/(tabs)/profile/regions')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="location-outline" size={18} color="#94A3B8" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Regiones</Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {(profile?.regions ?? []).length > 0
                      ? `${(profile?.regions ?? []).length} seleccionada${(profile?.regions ?? []).length === 1 ? '' : 's'}`
                      : 'Donde puedes intercambiar'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identidad</Text>
          <View style={styles.list}>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/(tabs)/profile/verify')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#94A3B8" />
                <Text style={styles.menuItemText}>Verificación de identidad</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.list}>
            <View style={styles.menuItem}>
              <View style={styles.menuItemContent}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" />
                <Text style={styles.menuItemText}>{user?.email}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/(tabs)/profile/privacy')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" />
                <Text style={styles.menuItemText}>Privacidad</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '—'}</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
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

  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  list: {
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155', overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  menuItemContent: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { color: '#F1F5F9', fontSize: 14 },
  menuItemSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    padding: 14,
  },
  signOutText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },

  version: { color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 },

  proCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#FACC15',
    padding: 14,
  },
  proIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(250,204,21,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  proTitle: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  proSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
});
