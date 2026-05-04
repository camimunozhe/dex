import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { DatePickerModal, TimePickerModal, formatDate, formatTime } from '@/lib/DateTimePicker';
import type { CardCollection } from '@/types/database';

type Step = 'cards' | 'details';

const CARD_THUMB_WIDTH = (Dimensions.get('window').width - 32 - 16) / 3; // 16px lateral padding × 2, 8px gap × 2

export default function NuevaPropuestaScreen() {
  const { receiver_id, card_id } = useLocalSearchParams<{ receiver_id: string; card_id: string }>();
  const { user, profile } = useAuth();
  const router = useRouter();

  // Receiver info
  const [receiverProfile, setReceiverProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [theirCards, setTheirCards] = useState<CardCollection[]>([]);   // all available from receiver
  const [selectedTheir, setSelectedTheir] = useState<Set<string>>(new Set(card_id ? [card_id] : []));

  const [type, setType] = useState<'trade' | 'purchase'>('trade');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number>(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');

  const [step, setStep] = useState<Step>('cards');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const enabled = resolveEnabledGames(profile?.enabled_games);
    const [profileRes, theirRes] = await Promise.all([
      supabase.from('profiles').select('username, avatar_url').eq('id', receiver_id).single(),
      supabase.from('cards_collection')
        .select('*')
        .eq('user_id', receiver_id)
        .or('is_for_trade.eq.true,is_for_sale.eq.true')
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
    if (selectedTheir.size === 0) { Alert.alert('Selecciona al menos una carta del otro'); return; }
    if (!date) { Alert.alert('Selecciona una fecha'); return; }

    setSaving(true);
    const scheduled = new Date(date);
    scheduled.setHours(hour ?? 12, minute, 0, 0);
    const scheduledAt = scheduled.toISOString();

    const { data: meetupData, error } = await supabase.from('meetups').insert({
      proposer_id: user!.id,
      receiver_id,
      type,
      status: 'pending',
      scheduled_at: scheduledAt,
      notes: notes.trim() || null,
      custom_location: location.trim() || null,
      agreed_price: price.trim() ? parseFloat(price) : null,
      last_modified_by: user!.id,
    }).select().single();

    if (error || !meetupData) { Alert.alert('Error al crear la propuesta'); setSaving(false); return; }

    const meetupId = (meetupData as any).id;
    const cardInserts = Array.from(selectedTheir).map(cid => ({ meetup_id: meetupId, card_id: cid, side: 'receiver' as const }));
    if (cardInserts.length > 0) {
      await supabase.from('meetup_cards').insert(cardInserts);
    }

    setSaving(false);
    Alert.alert('¡Propuesta enviada!', 'Puedes hacer seguimiento en la tab Encuentros.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/encuentros') },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 'cards' ? router.back() : setStep('cards'))}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva propuesta</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Step indicator */}
      <StepBar step={step} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>

          {/* Their profile */}
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              {receiverProfile?.avatar_url
                ? <Image source={{ uri: receiverProfile.avatar_url }} style={styles.avatar} />
                : <Ionicons name="person-outline" size={20} color="#64748B" />}
            </View>
            <Text style={styles.profileName}>@{receiverProfile?.username ?? '—'}</Text>
          </View>

          {step === 'cards' && (
            <>
              <Text style={styles.sectionTitle}>¿Qué cartas quieres?</Text>
              <Text style={styles.sectionSub}>Toca para seleccionar — solo aparecen las disponibles para intercambio o venta</Text>
              <CardGrid
                cards={theirCards}
                selected={selectedTheir}
                onToggle={id => setSelectedTheir(prev => toggle(prev, id))}
              />
              <View style={styles.typeRow}>
                <Text style={styles.fieldLabel}>Tipo de encuentro</Text>
                <View style={styles.typeBtns}>
                  <TouchableOpacity
                    style={[styles.typeBtn, type === 'trade' && styles.typeBtnActive]}
                    onPress={() => setType('trade')}
                  >
                    <Ionicons name="swap-horizontal-outline" size={15} color={type === 'trade' ? '#fff' : '#64748B'} />
                    <Text style={[styles.typeBtnText, type === 'trade' && styles.typeBtnTextActive]}>Intercambio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeBtn, type === 'purchase' && styles.typeBtnActive]}
                    onPress={() => setType('purchase')}
                  >
                    <Ionicons name="pricetag-outline" size={15} color={type === 'purchase' ? '#fff' : '#64748B'} />
                    <Text style={[styles.typeBtnText, type === 'purchase' && styles.typeBtnTextActive]}>Compra</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.nextBtn, selectedTheir.size === 0 && styles.nextBtnDisabled]}
                disabled={selectedTheir.size === 0}
                onPress={() => setStep('details')}
              >
                <Text style={styles.nextBtnText}>Siguiente: detalles →</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'details' && (
            <>
              <Text style={styles.sectionTitle}>Detalles del encuentro</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Fecha</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
                  <Text style={[styles.pickerBtnText, !date && styles.pickerBtnPlaceholder]}>
                    {date ? formatDate(date) : 'Seleccionar fecha'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Hora (opcional)</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={18} color="#94A3B8" />
                  <Text style={[styles.pickerBtnText, hour === null && styles.pickerBtnPlaceholder]}>
                    {hour !== null ? formatTime(hour, minute) : 'Seleccionar hora'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Lugar</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Ej: Mall Plaza Vespucio, entrada principal"
                  placeholderTextColor="#475569"
                />
              </View>

              {type === 'purchase' && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Precio ofrecido (USD)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={price}
                    onChangeText={setPrice}
                    placeholder="0.00"
                    placeholderTextColor="#475569"
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nota (opcional)</Text>
                <TextInput
                  style={[styles.fieldInput, { height: 80, textAlignVertical: 'top' }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Cualquier detalle adicional..."
                  placeholderTextColor="#475569"
                  multiline
                />
              </View>

              {/* Summary */}
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Resumen</Text>
                <Text style={styles.summarySub}>
                  {selectedTheir.size} carta{selectedTheir.size !== 1 ? 's' : ''} solicitada{selectedTheir.size !== 1 ? 's' : ''}
                  {type === 'purchase' && price ? ` · $${price}` : ''}
                </Text>
                {type === 'trade' && (
                  <Text style={styles.summaryHint}>
                    @{receiverProfile?.username ?? 'el otro'} elegirá qué carta tuya quiere a cambio.
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
                onPress={submit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.nextBtnText}>Enviar propuesta</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={showDatePicker}
        value={date}
        minDate={new Date()}
        onClose={() => setShowDatePicker(false)}
        onPick={d => setDate(d)}
      />
      <TimePickerModal
        visible={showTimePicker}
        hour={hour ?? 16}
        minute={minute}
        onClose={() => setShowTimePicker(false)}
        onPick={(h, m) => { setHour(h); setMinute(m); }}
      />
    </SafeAreaView>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps = [{ key: 'cards', label: 'Sus cartas' }, { key: 'details', label: 'Detalles' }];
  const activeIdx = steps.findIndex(s => s.key === step);
  return (
    <View style={styles.stepBar}>
      {steps.map((s, i) => (
        <View key={s.key} style={styles.stepItem}>
          <View style={[styles.stepDot, i <= activeIdx && styles.stepDotActive]}>
            <Text style={styles.stepDotText}>{i + 1}</Text>
          </View>
          <Text style={[styles.stepLabel, i <= activeIdx && styles.stepLabelActive]}>{s.label}</Text>
          {i < steps.length - 1 && <View style={[styles.stepLine, i < activeIdx && styles.stepLineActive]} />}
        </View>
      ))}
    </View>
  );
}

function CardGrid({ cards, selected, onToggle }: {
  cards: CardCollection[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (cards.length === 0) {
    return <Text style={styles.emptyCards}>No hay cartas disponibles</Text>;
  }
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

  stepBar: { flexDirection: 'row', justifyContent: 'center', padding: 16, gap: 0 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  stepDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepLabel: { color: '#64748B', fontSize: 11, marginLeft: 4 },
  stepLabelActive: { color: '#6366F1', fontWeight: '700' },
  stepLine: { width: 24, height: 1, backgroundColor: '#334155', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: '#6366F1' },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: 38, height: 38 },
  profileName: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },

  sectionTitle: { color: '#F1F5F9', fontSize: 17, fontWeight: '800' },
  sectionSub: { color: '#64748B', fontSize: 13, lineHeight: 18, marginTop: -8 },

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
  emptyCards: { color: '#475569', fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  typeRow: { gap: 8 },
  typeBtns: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B',
  },
  typeBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  typeBtnText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  typeBtnTextActive: { color: '#fff' },

  field: { gap: 6 },
  fieldLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  fieldInput: {
    backgroundColor: '#1E293B', borderRadius: 10, borderWidth: 1, borderColor: '#334155',
    padding: 12, color: '#F1F5F9', fontSize: 14,
  },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 10, borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  pickerBtnText: { flex: 1, color: '#F1F5F9', fontSize: 14, fontWeight: '500' },
  pickerBtnPlaceholder: { color: '#475569', fontWeight: '400' },

  summaryBox: {
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1,
    borderColor: '#6366F133', borderLeftWidth: 3, borderLeftColor: '#6366F1',
    padding: 14, gap: 4,
  },
  summaryTitle: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  summarySub: { color: '#94A3B8', fontSize: 13 },
  summaryHint: { color: '#64748B', fontSize: 12, lineHeight: 17, marginTop: 4 },

  nextBtn: {
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
