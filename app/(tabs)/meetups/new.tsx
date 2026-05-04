import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { MeetupType, SafeZone } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const MEETUP_TYPES: { value: MeetupType; label: string; desc: string; icon: IoniconName }[] = [
  { value: 'trade', label: 'Trade', desc: 'Intercambio de cartas', icon: 'swap-horizontal-outline' },
  { value: 'purchase', label: 'Compra/Venta', desc: 'Transacción económica', icon: 'pricetag-outline' },
  { value: 'casual', label: 'Casual', desc: 'Partida o juntada', icon: 'game-controller-outline' },
];

const ZONE_TYPE_ICON: Record<string, { name: IoniconName; label: string }> = {
  tcg_store: { name: 'albums-outline', label: 'Tienda TCG' },
  mall: { name: 'business-outline', label: 'Mall' },
  police_station: { name: 'shield-outline', label: 'Comisaría' },
  public_space: { name: 'leaf-outline', label: 'Espacio público' },
};

function VerBadge({ level }: { level: string }) {
  const map: Record<string, { name: IoniconName; color: string }> = {
    advanced: { name: 'shield-checkmark', color: '#A855F7' },
    intermediate: { name: 'shield-checkmark-outline', color: '#22C55E' },
    basic: { name: 'shield-outline', color: '#3B82F6' },
    none: { name: 'shield-outline', color: '#64748B' },
  };
  const badge = map[level] ?? map.none;
  return <Ionicons name={badge.name} size={20} color={badge.color} />;
}

export default function NewMeetupScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [type, setType] = useState<MeetupType>('trade');
  const [receiverUsername, setReceiverUsername] = useState('');
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [receiverProfile, setReceiverProfile] = useState<{ username: string; verification_level: string } | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [customLocation, setCustomLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('safe_zones').select('*').eq('verified', true).limit(10)
      .then(({ data }) => setSafeZones(data ?? []));
  }, []);

  async function searchUser() {
    if (!receiverUsername.trim()) return;
    setSearchingUser(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, verification_level')
      .eq('username', receiverUsername.trim())
      .neq('id', user!.id)
      .single();

    if (!data) {
      Alert.alert('Usuario no encontrado', 'Verifica el username e intenta de nuevo');
      setReceiverId(null);
      setReceiverProfile(null);
    } else if (data.verification_level === 'none' || data.verification_level === 'basic') {
      Alert.alert(
        'Usuario no verificado',
        'Este usuario no tiene verificación intermedia o avanzada. No puede participar en encuentros.',
      );
      setReceiverId(null);
      setReceiverProfile(null);
    } else {
      setReceiverId(data.id);
      setReceiverProfile({ username: data.username, verification_level: data.verification_level });
    }
    setSearchingUser(false);
  }

  async function handleCreate() {
    if (!receiverId) { Alert.alert('Error', 'Busca y selecciona un usuario'); return; }
    if (!selectedZone && !customLocation.trim()) {
      Alert.alert('Error', 'Selecciona una zona segura o ingresa una ubicación');
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      Alert.alert('Error', 'Ingresa fecha y hora del encuentro');
      return;
    }

    const [day, month, year] = scheduledDate.split('/');
    const isoDate = `${year}-${month}-${day}T${scheduledTime}:00`;
    const scheduled = new Date(isoDate);

    if (isNaN(scheduled.getTime()) || scheduled < new Date()) {
      Alert.alert('Error', 'La fecha debe ser en el futuro');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('meetups').insert({
      proposer_id: user!.id,
      receiver_id: receiverId,
      type,
      safe_zone_id: selectedZone,
      custom_location: customLocation.trim() || null,
      scheduled_at: scheduled.toISOString(),
      notes: notes.trim() || null,
    });

    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('¡Encuentro creado!', 'El otro jugador recibirá la solicitud.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nuevo encuentro</Text>
        <TouchableOpacity onPress={handleCreate} disabled={loading}>
          <Text style={[styles.createBtn, loading && styles.createBtnDisabled]}>
            {loading ? 'Creando...' : 'Crear'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">

        <Section label="Tipo de encuentro">
          {MEETUP_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeCard, type === t.value && styles.typeCardActive]}
              onPress={() => setType(t.value)}
            >
              <View style={styles.typeLabelRow}>
                <Ionicons
                  name={t.icon}
                  size={16}
                  color={type === t.value ? '#A5B4FC' : '#64748B'}
                />
                <Text style={[styles.typeLabel, type === t.value && styles.typeLabelActive]}>
                  {t.label}
                </Text>
              </View>
              <Text style={styles.typeDesc}>{t.desc}</Text>
            </TouchableOpacity>
          ))}
        </Section>

        <Section label="Con quién">
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={receiverUsername}
              onChangeText={setReceiverUsername}
              placeholder="username del jugador"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              onSubmitEditing={searchUser}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={searchUser} disabled={searchingUser}>
              {searchingUser
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.searchBtnText}>Buscar</Text>}
            </TouchableOpacity>
          </View>
          {receiverProfile && (
            <View style={styles.userFound}>
              <VerBadge level={receiverProfile.verification_level} />
              <Text style={styles.userFoundName}>@{receiverProfile.username}</Text>
              <View style={styles.verifiedRow}>
                <Ionicons name="checkmark-circle" size={12} color="#4ADE80" />
                <Text style={styles.userFoundCheck}>Verificado</Text>
              </View>
            </View>
          )}
        </Section>

        <Section label="Zona segura sugerida">
          <Text style={styles.hint}>Tiendas TCG, malls y lugares públicos verificados</Text>
          {safeZones.map((zone) => {
            const zoneInfo = ZONE_TYPE_ICON[zone.type] ?? ZONE_TYPE_ICON.public_space;
            return (
              <TouchableOpacity
                key={zone.id}
                style={[styles.zoneCard, selectedZone === zone.id && styles.zoneCardActive]}
                onPress={() => { setSelectedZone(zone.id); setCustomLocation(''); }}
              >
                <Text style={styles.zoneName}>{zone.name}</Text>
                <Text style={styles.zoneAddress}>{zone.address} · {zone.city}</Text>
                <View style={styles.zoneTypeRow}>
                  <Ionicons name={zoneInfo.name} size={11} color="#94A3B8" />
                  <Text style={styles.zoneType}>{zoneInfo.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.orDivider}>— o ingresa ubicación personalizada —</Text>
          <TextInput
            style={styles.input}
            value={customLocation}
            onChangeText={(t) => { setCustomLocation(t); if (t) setSelectedZone(null); }}
            placeholder="Ej: Starbucks Av. Providencia 1234"
            placeholderTextColor="#475569"
          />
        </Section>

        <Section label="Cuándo">
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Fecha (DD/MM/AAAA)</Text>
              <TextInput
                style={styles.input}
                value={scheduledDate}
                onChangeText={setScheduledDate}
                placeholder="15/05/2026"
                placeholderTextColor="#475569"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Hora (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={scheduledTime}
                onChangeText={setScheduledTime}
                placeholder="16:30"
                placeholderTextColor="#475569"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </Section>

        <Section label="Notas (opcional)">
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ej: Traigo las cartas de Pikachu para el trade..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={3}
          />
        </Section>

        <View style={styles.safetyNote}>
          <View style={styles.safetyTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#4ADE80" />
            <Text style={styles.safetyTitle}>Este encuentro queda registrado</Text>
          </View>
          <Text style={styles.safetyText}>
            La app guarda fecha, lugar y participantes. Ambos podrán calificarse al finalizar.
            En el día del encuentro tendrás acceso al botón de emergencia.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  back: { color: '#6366F1', fontSize: 15 },
  title: { color: '#F1F5F9', fontSize: 17, fontWeight: '700' },
  createBtn: { color: '#6366F1', fontSize: 15, fontWeight: '700' },
  createBtnDisabled: { opacity: 0.5 },
  scroll: { flex: 1, padding: 16 },
  section: { marginBottom: 20 },
  sectionLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase' },
  typeCard: {
    backgroundColor: '#1E293B', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#334155', marginBottom: 8,
  },
  typeCardActive: { borderColor: '#6366F1', backgroundColor: '#1E1E4A' },
  typeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  typeLabel: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  typeLabelActive: { color: '#A5B4FC' },
  typeDesc: { color: '#64748B', fontSize: 13, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    borderRadius: 10, padding: 12, fontSize: 14, color: '#F1F5F9',
  },
  searchBtn: {
    backgroundColor: '#6366F1', borderRadius: 10,
    paddingHorizontal: 14, justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  userFound: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0D2E1A', borderRadius: 8, padding: 10, marginTop: 8,
  },
  userFoundName: { color: '#4ADE80', fontSize: 14, fontWeight: '600', flex: 1 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  userFoundCheck: { color: '#4ADE80', fontSize: 12 },
  hint: { color: '#475569', fontSize: 12, marginBottom: 8 },
  zoneCard: {
    backgroundColor: '#1E293B', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#334155', marginBottom: 8,
  },
  zoneCardActive: { borderColor: '#6366F1', backgroundColor: '#1E1E4A' },
  zoneName: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
  zoneAddress: { color: '#64748B', fontSize: 12, marginTop: 2 },
  zoneTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  zoneType: { color: '#94A3B8', fontSize: 11 },
  orDivider: { color: '#334155', fontSize: 12, textAlign: 'center', marginVertical: 10 },
  dateRow: { flexDirection: 'row', gap: 12 },
  inputLabel: { color: '#64748B', fontSize: 11, marginBottom: 6 },
  textArea: { height: 80, textAlignVertical: 'top' },
  safetyNote: {
    backgroundColor: '#0D2E1A', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#14532D', marginBottom: 16,
  },
  safetyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  safetyTitle: { color: '#4ADE80', fontSize: 13, fontWeight: '700' },
  safetyText: { color: '#94A3B8', fontSize: 13, lineHeight: 19 },
});
