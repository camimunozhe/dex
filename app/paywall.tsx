import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '@/context/AuthContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Feature = { icon: IoniconName; title: string; desc: string; color: string };

const FEATURES: Feature[] = [
  { icon: 'notifications', title: 'Alertas de cartas', desc: 'Te avisamos cuando alguien publica una carta de tu watchlist en tu región.', color: '#FACC15' },
  { icon: 'rocket', title: 'Boost en Explorar', desc: 'Tus publicaciones aparecen primero, llegan a más compradores.', color: '#6366F1' },
  { icon: 'options', title: 'Filtros avanzados', desc: 'Buscá por precio, condición, foil, set y mucho más.', color: '#A78BFA' },
  { icon: 'camera', title: 'Fotos propias', desc: 'Subí fotos reales de tus cartas en cada publicación.', color: '#4ADE80' },
  { icon: 'stats-chart', title: 'Stats de colección', desc: 'Valor histórico, completitud de sets y top cartas.', color: '#FB923C' },
  { icon: 'shield-checkmark', title: 'Badge Trocora Pro', desc: 'Mostrale a la comunidad que sos coleccionista serio.', color: '#22C55E' },
  { icon: 'infinite', title: 'Sin límites', desc: 'Carpetas, regiones, publicaciones y trades ilimitados.', color: '#F472B6' },
  { icon: 'document-text', title: 'Exportar colección', desc: 'Bajá tu colección a CSV o PDF cuando quieras.', color: '#94A3B8' },
];

function annualMonthlyPriceLabel(annual: PurchasesPackage): string | null {
  const totalCents = annual.product.price * 100;
  const monthly = totalCents / 12 / 100;
  // Match the currency code from the annual product
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: annual.product.currencyCode,
      maximumFractionDigits: 2,
    }).format(monthly);
  } catch {
    return null;
  }
}

export default function PaywallScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let mounted = true;
    Purchases.getOfferings()
      .then(res => {
        if (!mounted) return;
        const current = res.current ?? null;
        setOffering(current);
        // Default selection: annual if available, else monthly
        const def = current?.annual ?? current?.monthly ?? current?.availablePackages?.[0] ?? null;
        setSelectedPackage(def);
      })
      .catch(err => console.warn('[paywall] getOfferings failed', err))
      .finally(() => { if (mounted) setLoadingOfferings(false); });
    return () => { mounted = false; };
  }, []);

  const annual = offering?.annual ?? null;
  const monthly = offering?.monthly ?? null;

  async function handleSubscribe() {
    if (!selectedPackage) return;
    setPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
      const isPro = !!customerInfo.entitlements.active['pro'];
      // Refresh profile so usePremium picks up the webhook update.
      // The webhook fires in 1-3 seconds; we wait briefly and refresh.
      setTimeout(() => { refreshProfile().catch(() => {}); }, 1500);
      if (isPro) {
        Alert.alert('¡Bienvenido a Trocora Pro!', 'Tu suscripción está activa.');
      }
      router.back();
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('No se pudo procesar', e.message ?? 'Intentá de nuevo en un momento.');
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      const isPro = !!info.entitlements.active['pro'];
      setTimeout(() => { refreshProfile().catch(() => {}); }, 1500);
      Alert.alert(
        isPro ? 'Compras restauradas' : 'Sin compras activas',
        isPro ? 'Tu Trocora Pro quedó activo.' : 'No encontramos suscripciones activas en esta cuenta.',
      );
      if (isPro) router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo restaurar.');
    } finally {
      setRestoring(false);
    }
  }

  const annualMonthly = annual ? annualMonthlyPriceLabel(annual) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color="#94A3B8" />
        </TouchableOpacity>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollPad}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="star" size={14} color="#FACC15" />
            <Text style={styles.heroBadgeText}>TROCORA PRO</Text>
          </View>
          <Text style={styles.title}>Sacale el máximo a tu colección</Text>
          <Text style={styles.subtitle}>
            Funciones premium para coleccionistas y vendedores activos.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: `${f.color}1A` }]}>
                <Ionicons name={f.icon} size={20} color={f.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          {loadingOfferings ? (
            <ActivityIndicator color="#94A3B8" style={{ paddingVertical: 24 }} />
          ) : !offering ? (
            <View style={styles.unavailableBox}>
              <Ionicons name="alert-circle-outline" size={20} color="#94A3B8" />
              <Text style={styles.unavailableText}>
                No pudimos cargar los planes ahora mismo. Verificá tu conexión e intentá de nuevo.
              </Text>
            </View>
          ) : (
            <>
              {annual && (
                <TouchableOpacity
                  style={[styles.planBox, selectedPackage?.identifier === annual.identifier && styles.planBoxActive]}
                  onPress={() => setSelectedPackage(annual)}
                  activeOpacity={0.8}
                >
                  <View style={styles.planHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planLabel}>Anual</Text>
                      <Text style={styles.planPrice}>{annual.product.priceString} / año</Text>
                      {annualMonthly && (
                        <Text style={styles.planPriceSub}>Equivale a {annualMonthly} / mes</Text>
                      )}
                    </View>
                    {monthly && annual.product.price < monthly.product.price * 12 && (
                      <View style={styles.savingBadge}>
                        <Text style={styles.savingBadgeText}>
                          AHORRÁ {Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100)}%
                        </Text>
                      </View>
                    )}
                  </View>
                  {annual.product.introPrice && (
                    <Text style={styles.planTrial}>
                      {annual.product.introPrice.periodNumberOfUnits} días gratis · Cancelá cuando quieras
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {monthly && (
                <TouchableOpacity
                  style={[styles.planBox, selectedPackage?.identifier === monthly.identifier && styles.planBoxActive]}
                  onPress={() => setSelectedPackage(monthly)}
                  activeOpacity={0.8}
                >
                  <View style={styles.planHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planLabel}>Mensual</Text>
                      <Text style={styles.planPrice}>{monthly.product.priceString} / mes</Text>
                    </View>
                  </View>
                  <Text style={styles.planTrial}>Cancelá cuando quieras</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.cta, (!selectedPackage || purchasing) && styles.ctaDisabled]}
          onPress={handleSubscribe}
          disabled={!selectedPackage || purchasing}
          activeOpacity={0.85}
        >
          {purchasing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.ctaText}>
                {selectedPackage?.product.introPrice
                  ? `Empezar ${selectedPackage.product.introPrice.periodNumberOfUnits} días gratis`
                  : 'Suscribirme'}
              </Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>{restoring ? 'Restaurando…' : 'Restaurar compras'}</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Se renueva automáticamente. Podés cancelar en cualquier momento desde la configuración de tu tienda (App Store / Google Play). La suscripción se cobra a tu cuenta de la tienda al confirmar la compra.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  scrollPad: { paddingHorizontal: 20, paddingBottom: 20 },

  hero: { alignItems: 'center', paddingVertical: 16 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: '#FACC15',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 14,
  },
  heroBadgeText: { color: '#FACC15', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#F1F5F9', fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 32, paddingHorizontal: 16 },
  subtitle: { color: '#94A3B8', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },

  features: { gap: 12, marginTop: 20 },
  feature: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#1E293B', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#334155',
  },
  featureIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  featureDesc: { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginTop: 2 },

  plans: { marginTop: 24, gap: 10 },
  planBox: {
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 2, borderColor: '#334155',
    padding: 16,
  },
  planBoxActive: { borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.08)' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  planLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planPrice: { color: '#F1F5F9', fontSize: 18, fontWeight: '800', marginTop: 4 },
  planPriceSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  planTrial: { color: '#4ADE80', fontSize: 12, fontWeight: '600', marginTop: 8 },
  savingBadge: {
    backgroundColor: '#4ADE80', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  savingBadgeText: { color: '#0F172A', fontSize: 10, fontWeight: '800' },

  unavailableBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    padding: 14,
  },
  unavailableText: { color: '#94A3B8', fontSize: 13, flex: 1, lineHeight: 18 },

  cta: {
    marginTop: 20, backgroundColor: '#6366F1', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  restoreBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  restoreText: { color: '#A5B4FC', fontSize: 13, fontWeight: '600' },

  legalText: { color: '#475569', fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },
});
