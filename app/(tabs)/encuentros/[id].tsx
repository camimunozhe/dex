import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Linking, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { resolveEnabledGames } from '@/lib/enabledGames';
import type { Meetup, CardCollection } from '@/types/database';

type CardWithMeta = CardCollection & {
  meetup_card_id: string;
  side: 'proposer' | 'receiver';
};

type MeetupFull = Meetup & {
  proposer: { username: string; avatar_url: string | null; phone: string | null } | null;
  receiver: { username: string; avatar_url: string | null; phone: string | null } | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',    color: '#FACC15' },
  countered: { label: 'Contra-propuesta', color: '#FB923C' },
  confirmed: { label: 'Confirmado',   color: '#4ADE80' },
  completed: { label: 'Completado',   color: '#64748B' },
  cancelled: { label: 'Cancelado',    color: '#EF4444' },
};

export default function EncuentroDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [meetup, setMeetup] = useState<MeetupFull | null>(null);
  const [cards, setCards] = useState<CardWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [myCollection, setMyCollection] = useState<CardCollection[]>([]);
  const [theirCollection, setTheirCollection] = useState<CardCollection[]>([]);
  const [editMyCardIds, setEditMyCardIds] = useState<Set<string>>(new Set());
  const [editTheirCardIds, setEditTheirCardIds] = useState<Set<string>>(new Set());
  const [counterPrice, setCounterPrice] = useState('');
  const [counterNotes, setCounterNotes] = useState('');

  const load = useCallback(async () => {
    const [meetupRes, cardsRes] = await Promise.all([
      supabase
        .from('meetups')
        .select('*, proposer:proposer_id(username, avatar_url, phone), receiver:receiver_id(username, avatar_url, phone)')
        .eq('id', id)
        .single(),
      supabase
        .from('meetup_cards')
        .select('id, side, card_id, cards_collection(*, id)')
        .eq('meetup_id', id),
    ]);

    setMeetup(meetupRes.data as MeetupFull);
    const mapped: CardWithMeta[] = ((cardsRes.data ?? []) as any[]).map(row => ({
      ...(row.cards_collection as CardCollection),
      meetup_card_id: row.id,
      side: row.side,
    }));
    setCards(mapped);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />;
  if (!meetup) return null;

  const isProposer = meetup.proposer_id === user?.id;
  const other = isProposer ? meetup.receiver : meetup.proposer;
  const myCards = cards.filter(c => c.side === (isProposer ? 'proposer' : 'receiver'));
  const theirCards = cards.filter(c => c.side === (isProposer ? 'receiver' : 'proposer'));
  const proposerSideCards = cards.filter(c => c.side === 'proposer');
  const needsReceiverPick = !isProposer && meetup.status === 'pending' && proposerSideCards.length === 0;
  const status = STATUS_LABEL[meetup.status] ?? { label: meetup.status, color: '#94A3B8' };
  const canAct = !isProposer && (meetup.status === 'pending' || meetup.status === 'countered') && !needsReceiverPick;
  const canEdit = meetup.status === 'pending' || meetup.status === 'countered';
  const isConfirmed = meetup.status === 'confirmed';
  const myCheckedIn = isProposer ? meetup.proposer_checked_in : meetup.receiver_checked_in;

  async function openEditModal() {
    setShowEdit(true);
    setLoadingEdit(true);
    const otherUserId = isProposer ? meetup.receiver_id : meetup.proposer_id;

    const enabled = resolveEnabledGames(profile?.enabled_games);
    const [myRes, theirRes] = await Promise.all([
      supabase.from('cards_collection').select('*').eq('user_id', user?.id).in('game', enabled).order('card_name'),
      supabase.from('cards_collection').select('*').eq('user_id', otherUserId)
        .or('is_for_trade.eq.true,is_for_sale.eq.true').in('game', enabled).order('card_name'),
    ]);

    setMyCollection(myRes.data ?? []);
    setTheirCollection(theirRes.data ?? []);
    setEditMyCardIds(new Set(myCards.map(c => c.id)));
    setEditTheirCardIds(new Set(theirCards.map(c => c.id)));
    setCounterPrice(meetup.agreed_price?.toString() ?? '');
    setCounterNotes(meetup.counter_notes ?? '');
    setLoadingEdit(false);
  }

  async function submitEdit() {
    setSaving(true);
    const price = counterPrice.trim() ? parseFloat(counterPrice) : null;
    const mySide: 'proposer' | 'receiver' = isProposer ? 'proposer' : 'receiver';
    const theirSide: 'proposer' | 'receiver' = isProposer ? 'receiver' : 'proposer';

    await supabase.from('meetups').update({
      status: 'countered',
      counter_notes: counterNotes.trim() || null,
      agreed_price: price,
      last_modified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    await supabase.from('meetup_cards').delete().eq('meetup_id', id);

    const rows = [
      ...Array.from(editMyCardIds).map(cardId => ({ meetup_id: id, card_id: cardId, side: mySide })),
      ...Array.from(editTheirCardIds).map(cardId => ({ meetup_id: id, card_id: cardId, side: theirSide })),
    ];
    if (rows.length > 0) await supabase.from('meetup_cards').insert(rows);

    await load();
    setShowEdit(false);
    setSaving(false);
  }

  async function updateStatus(newStatus: string) {
    setSaving(true);
    await supabase.from('meetups').update({
      status: newStatus,
      last_modified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setMeetup(m => m ? { ...m, status: newStatus as any } : m);
    setSaving(false);
  }

  async function checkIn() {
    setSaving(true);
    const field = isProposer ? 'proposer_checked_in' : 'receiver_checked_in';
    await supabase.from('meetups').update({ [field]: true }).eq('id', id);

    const { data: updated } = await supabase
      .from('meetups')
      .select('proposer_checked_in, receiver_checked_in')
      .eq('id', id)
      .single();

    if (updated?.proposer_checked_in && updated?.receiver_checked_in) {
      await supabase.rpc('transfer_trade_cards', { p_meetup_id: id });
      await supabase.from('meetups').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    }

    await load();
    setSaving(false);
  }

  function openWhatsApp() {
    const phone = other?.phone?.replace(/\D/g, '');
    if (!phone) { Alert.alert('Sin teléfono', 'Esta persona no ha agregado su número.'); return; }
    const msg = encodeURIComponent(`Hola @${other?.username}, te escribo por el encuentro en TCG Safe.`);
    Linking.openURL(`https://wa.me/${phone}?text=${msg}`);
  }

  function toggleMy(cardId: string) {
    setEditMyCardIds(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s; });
  }
  function toggleTheir(cardId: string) {
    setEditTheirCardIds(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s; });
  }

  const dateStr = new Date(meetup.scheduled_at).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = new Date(meetup.scheduled_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <View style={[styles.statusPill, { backgroundColor: status.color + '22' }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* Other user */}
        <View style={styles.card}>
          <View style={styles.userRow}>
            <View style={styles.avatarWrap}>
              {other?.avatar_url
                ? <Image source={{ uri: other.avatar_url }} style={styles.avatar} />
                : <Ionicons name="person-outline" size={22} color="#64748B" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.username}>@{other?.username ?? '—'}</Text>
              <Text style={styles.userSub}>{isProposer ? 'Receptor' : 'Proponente'}</Text>
            </View>
            <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={styles.waBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date + location */}
        <View style={styles.card}>
          <InfoRow icon="calendar-outline" label={dateStr} />
          <InfoRow icon="time-outline" label={timeStr} />
          {meetup.custom_location && <InfoRow icon="location-outline" label={meetup.custom_location} />}
          {meetup.agreed_price != null && (
            <InfoRow icon="pricetag-outline" label={`Precio acordado: $${meetup.agreed_price}`} highlight />
          )}
        </View>

        {/* Notes */}
        {(meetup.notes || meetup.counter_notes) && (
          <View style={styles.card}>
            {meetup.notes && (
              <View>
                <Text style={styles.noteLabel}>Nota inicial</Text>
                <Text style={styles.noteText}>{meetup.notes}</Text>
              </View>
            )}
            {meetup.counter_notes && (
              <View style={{ marginTop: meetup.notes ? 10 : 0 }}>
                <Text style={[styles.noteLabel, { color: '#FB923C' }]}>Contra-propuesta</Text>
                <Text style={styles.noteText}>{meetup.counter_notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Their cards */}
        {theirCards.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>
              {isProposer ? 'Cartas que quieres' : 'Cartas que ofrecen'}
            </Text>
            <CardRow cards={theirCards} />
          </View>
        )}

        {/* My cards */}
        {myCards.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>
              {isProposer ? 'Tus cartas ofrecidas' : 'Te solicitan'}
            </Text>
            <CardRow cards={myCards} />
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsBlock}>
          {needsReceiverPick && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnAccept]}
                onPress={openEditModal}
                disabled={saving}
              >
                <Ionicons name="albums-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Elegí qué querés a cambio</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnReject]}
                onPress={() => Alert.alert('Rechazar', '¿Rechazar esta propuesta?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Rechazar', style: 'destructive', onPress: () => updateStatus('cancelled') },
                ])}
                disabled={saving}
              >
                <Ionicons name="close-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Rechazar</Text>
              </TouchableOpacity>
            </>
          )}
          {canAct && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnAccept]}
                onPress={() => updateStatus('confirmed')}
                disabled={saving}
              >
                <Ionicons name="checkmark-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnCounter]}
                onPress={openEditModal}
                disabled={saving}
              >
                <Ionicons name="git-compare-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Contra-proponer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnReject]}
                onPress={() => Alert.alert('Rechazar', '¿Rechazar esta propuesta?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Rechazar', style: 'destructive', onPress: () => updateStatus('cancelled') },
                ])}
                disabled={saving}
              >
                <Ionicons name="close-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Rechazar</Text>
              </TouchableOpacity>
            </>
          )}

          {!canAct && canEdit && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnCounter]}
              onPress={openEditModal}
              disabled={saving}
            >
              <Ionicons name="git-compare-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Modificar propuesta</Text>
            </TouchableOpacity>
          )}

          {isConfirmed && !myCheckedIn && (
            <TouchableOpacity style={[styles.actionBtn, styles.btnCounter]} onPress={checkIn}>
              <Ionicons name="qr-code-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Confirmar encuentro in situ</Text>
            </TouchableOpacity>
          )}

          {isConfirmed && myCheckedIn && (
            <View style={styles.checkedInRow}>
              <Ionicons name="checkmark-circle" size={18} color="#4ADE80" />
              <Text style={styles.checkedInText}>Tu check-in registrado — esperando al otro</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Edit / Counter-propose modal ── */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEdit(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-outline" size={26} color="#94A3B8" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Modificar propuesta</Text>
            <TouchableOpacity
              style={[styles.sendBtn, (saving || loadingEdit) && { opacity: 0.5 }]}
              onPress={submitEdit}
              disabled={saving || loadingEdit}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.sendBtnText}>Enviar</Text>}
            </TouchableOpacity>
          </View>

          {loadingEdit ? (
            <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>

              {/* ── Their cards ── */}
              <View>
                <Text style={styles.editTitle}>
                  Cartas que quiero recibir de @{other?.username}
                </Text>
                <Text style={styles.editSub}>
                  {editTheirCardIds.size} seleccionada{editTheirCardIds.size !== 1 ? 's' : ''}
                </Text>
                {theirCollection.length === 0 ? (
                  <Text style={styles.emptyCol}>No tiene cartas disponibles para intercambio o venta</Text>
                ) : (
                  <SelectableGrid cards={theirCollection} selectedIds={editTheirCardIds} onToggle={toggleTheir} />
                )}
              </View>

              {/* ── My cards ── */}
              <View>
                <Text style={styles.editTitle}>
                  Mis cartas que le doy a @{other?.username}
                </Text>
                <Text style={styles.editSub}>
                  {editMyCardIds.size} seleccionada{editMyCardIds.size !== 1 ? 's' : ''}
                </Text>
                {myCollection.length === 0 ? (
                  <Text style={styles.emptyCol}>No tienes cartas en tu colección</Text>
                ) : (
                  <SelectableGrid cards={myCollection} selectedIds={editMyCardIds} onToggle={toggleMy} />
                )}
              </View>

              {/* ── Price ── */}
              {(meetup.type === 'purchase' || meetup.agreed_price != null) && (
                <View>
                  <Text style={styles.editTitle}>Precio (USD)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={counterPrice}
                    onChangeText={setCounterPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#475569"
                  />
                </View>
              )}

              {/* ── Note ── */}
              <View>
                <Text style={styles.editTitle}>Nota</Text>
                <TextInput
                  style={[styles.fieldInput, { height: 90, textAlignVertical: 'top' }]}
                  value={counterNotes}
                  onChangeText={setCounterNotes}
                  multiline
                  placeholder="Ej: cambiaría la Charizard por la Blastoise…"
                  placeholderTextColor="#475569"
                />
              </View>

            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Selectable card grid ──────────────────────────────────────────────────────
function SelectableGrid({ cards, selectedIds, onToggle }: {
  cards: CardCollection[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.selGrid}>
      {cards.map(card => {
        const sel = selectedIds.has(card.id);
        return (
          <TouchableOpacity
            key={card.id}
            style={[styles.selCard, sel && styles.selCardOn]}
            onPress={() => onToggle(card.id)}
            activeOpacity={0.75}
          >
            {card.image_url
              ? <Image source={{ uri: card.image_url }} style={styles.selCardImg} contentFit="contain" />
              : <View style={styles.selCardPlaceholder}><Ionicons name="albums-outline" size={20} color="#64748B" /></View>}
            {sel && (
              <View style={styles.selCheck}>
                <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
              </View>
            )}
            <Text style={styles.selCardName} numberOfLines={2}>{card.card_name}</Text>
            <Text style={styles.selCardSub}>{card.set_name ?? card.game}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Horizontal card row (read-only) ─────────────────────────────────────────
function CardRow({ cards }: { cards: CardWithMeta[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {cards.map(card => (
        <View key={card.meetup_card_id} style={styles.cardThumb}>
          {card.image_url
            ? <Image source={{ uri: card.image_url }} style={styles.cardThumbImg} contentFit="contain" />
            : <View style={styles.cardThumbPlaceholder}><Ionicons name="albums-outline" size={24} color="#64748B" /></View>}
          <Text style={styles.cardThumbName} numberOfLines={2}>{card.card_name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function InfoRow({ icon, label, highlight }: { icon: any; label: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color="#64748B" />
      <Text style={[styles.infoText, highlight && { color: '#4ADE80', fontWeight: '700' }]}>{label}</Text>
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
  statusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },

  card: {
    backgroundColor: '#1E293B', borderRadius: 14,
    borderWidth: 1, borderColor: '#334155', padding: 14, gap: 8,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: 46, height: 46 },
  username: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  userSub: { color: '#64748B', fontSize: 12 },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#25D36622', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#25D36644',
  },
  waBtnText: { color: '#25D366', fontSize: 13, fontWeight: '700' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: '#F1F5F9', fontSize: 14, flex: 1 },

  noteLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  noteText: { color: '#CBD5E1', fontSize: 14, lineHeight: 20 },

  sectionLabel: {
    color: '#94A3B8', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },

  cardThumb: {
    width: 90, backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1, borderColor: '#334155', padding: 6, alignItems: 'center', gap: 4,
  },
  cardThumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  cardThumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  cardThumbName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', textAlign: 'center' },

  actionsBlock: { gap: 10, paddingBottom: 24 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnAccept:  { backgroundColor: '#22C55E' },
  btnCounter: { backgroundColor: '#6366F1' },
  btnReject:  { backgroundColor: '#EF4444' },
  checkedInRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12 },
  checkedInText: { color: '#4ADE80', fontSize: 14, fontWeight: '600' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#0F172A' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#F1F5F9' },
  sendBtn: {
    backgroundColor: '#6366F1', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  editTitle: { color: '#F1F5F9', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  editSub: { color: '#64748B', fontSize: 12, marginBottom: 10 },
  emptyCol: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 20 },

  selGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selCard: {
    width: '31%', backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#334155', padding: 6, alignItems: 'center', gap: 3,
  },
  selCardOn: { borderColor: '#6366F1', backgroundColor: '#6366F115' },
  selCardImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  selCardPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  selCardName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  selCardSub: { color: '#475569', fontSize: 8, textAlign: 'center' },
  selCheck: { position: 'absolute', top: 4, right: 4 },

  fieldInput: {
    backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1,
    borderColor: '#334155', padding: 12, color: '#F1F5F9', fontSize: 14,
  },
});

