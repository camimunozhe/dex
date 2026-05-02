import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection } from '@/types/database';

type Step = 'cards' | 'my_cards' | 'details';

export default function NuevaPropuestaScreen() {
  const { receiver_id, card_id } = useLocalSearchParams<{ receiver_id: string; card_id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  // Receiver info
  const [receiverProfile, setReceiverProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [theirCards, setTheirCards] = useState<CardCollection[]>([]);   // all available from receiver
  const [selectedTheir, setSelectedTheir] = useState<Set<string>>(new Set(card_id ? [card_id] : []));

  // My cards (for trade)
  const [myCards, setMyCards] = useState<CardCollection[]>([]);
  const [selectedMine, setSelectedMine] = useState<Set<string>>(new Set());

  const [type, setType] = useState<'trade' | 'purchase'>('trade');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const [step, setStep] = useState<Step>('cards');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [profileRes, theirRes, mineRes] = await Promise.all([
      supabase.from('profiles').select('username, avatar_url').eq('id', receiver_id).single(),
      supabase.from('cards_collection')
        .select('*')
        .eq('user_id', receiver_id)
        .or('is_for_trade.eq.true,is_for_sale.eq.true')
        .order('created_at', { ascending: false }),
      supabase.from('cards_collection')
        .select('*')
        .eq('user_id', user!.id)
        .is('folder_id', null)
        .order('created_at', { ascending: false }),
    ]);
    setReceiverProfile(profileRes.data as any);
    setTheirCards((theirRes.data ?? []) as CardCollection[]);
    setMyCards((mineRes.data ?? []) as CardCollection[]);
  }, [receiver_id, user]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  async function submit() {
    if (selectedTheir.size === 0) { Alert.alert('Selecciona al menos una carta del otro'); return; }
    if (!date.trim()) { Alert.alert('Ingresa una fecha'); return; }

    setSaving(true);
    const scheduledAt = buildDateTime(date, time);
    if (!scheduledAt) { Alert.alert('Fecha inválida. Usa formato DD/MM/AAAA'); setSaving(false); return; }

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
    const cardInserts = [
      ...Array.from(selectedTheir).map(cid => ({ meetup_id: meetupId, card_id: cid, side: 'receiver' as const })),
      ...Array.from(selectedMine).map(cid => ({ meetup_id: meetupId, card_id: cid, side: 'proposer' as const })),
    ];
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
        <TouchableOpacity onPress={() => (step === 'cards' ? router.back() : setStep(step === 'details' ? (type === 'trade' ? 'my_cards' : 'cards') : 'cards'))}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva propuesta</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Step indicator */}
      <StepBar step={step} type={type} />

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
                onPress={() => setStep(type === 'trade' ? 'my_cards' : 'details')}
              >
                <Text style={styles.nextBtnText}>
                  {type === 'trade' ? 'Siguiente: mis cartas →' : 'Siguiente: detalles →'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'my_cards' && (
            <>
              <Text style={styles.sectionTitle}>¿Qué ofreces a cambio?</Text>
              <Text style={styles.sectionSub}>Selecciona tus cartas para el intercambio (opcional)</Text>
              <CardGrid
                cards={myCards}
                selected={selectedMine}
                onToggle={id => setSelectedMine(prev => toggle(prev, id))}
              />
              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('details')}>
                <Text style={styles.nextBtnText}>Siguiente: detalles →</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'details' && (
            <>
              <Text style={styles.sectionTitle}>Detalles del encuentro</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Fecha (DD/MM/AAAA)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={date}
                  onChangeText={setDate}
                  placeholder="15/06/2025"
                  placeholderTextColor="#475569"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Hora (HH:MM, opcional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={time}
                  onChangeText={setTime}
                  placeholder="16:00"
                  placeholderTextColor="#475569"
                  keyboardType="numbers-and-punctuation"
                />
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
                  {type === 'trade' && selectedMine.size > 0 ? ` · ${selectedMine.size} tuya${selectedMine.size !== 1 ? 's' : ''} a cambio` : ''}
                  {type === 'purchase' && price ? ` · $${price}` : ''}
                </Text>
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
    </SafeAreaView>
  );
}

function StepBar({ step, type }: { step: Step; type: 'trade' | 'purchase' }) {
  const steps = type === 'trade'
    ? [{ key: 'cards', label: 'Sus cartas' }, { key: 'my_cards', label: 'Mis cartas' }, { key: 'details', label: 'Detalles' }]
    : [{ key: 'cards', label: 'Sus cartas' }, { key: 'details', label: 'Detalles' }];
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

function buildDateTime(dateStr: string, timeStr: string): string | null {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const hour = timeStr.trim() ? parseInt(timeStr.split(':')[0]) : 12;
  const min = timeStr.trim() ? parseInt(timeStr.split(':')[1] ?? '0') : 0;
  const dt = new Date(y, m - 1, d, hour, min);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
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
    width: '30%', backgroundColor: '#1E293B', borderRadius: 10,
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

  summaryBox: {
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1,
    borderColor: '#6366F133', borderLeftWidth: 3, borderLeftColor: '#6366F1',
    padding: 14, gap: 4,
  },
  summaryTitle: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  summarySub: { color: '#94A3B8', fontSize: 13 },

  nextBtn: {
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
