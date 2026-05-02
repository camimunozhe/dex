import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { MeetupStatus } from '@/types/database';

type MeetupDetail = {
  id: string;
  type: string;
  status: MeetupStatus;
  scheduled_at: string;
  notes: string | null;
  proposer_id: string;
  receiver_id: string;
  proposer_checked_in: boolean;
  receiver_checked_in: boolean;
  completed_at: string | null;
  proposer: { username: string; verification_level: string };
  receiver: { username: string; verification_level: string };
  safe_zone: { name: string; address: string; type: string } | null;
  custom_location: string | null;
  ratings: { rater_id: string; rating: string; comment: string | null }[];
};

const TYPE_LABELS: Record<string, string> = {
  trade: '🔄 Trade', purchase: '💰 Compra/Venta', casual: '🎮 Casual',
};

const STATUS_COLORS: Record<MeetupStatus, string> = {
  pending: '#FCD34D', confirmed: '#4ADE80',
  completed: '#94A3B8', cancelled: '#EF4444',
};

const STATUS_LABELS: Record<MeetupStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado',
  completed: 'Completado', cancelled: 'Cancelado',
};

export default function MeetupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [meetup, setMeetup] = useState<MeetupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  async function fetchMeetup() {
    const { data } = await supabase
      .from('meetups')
      .select(`
        *,
        proposer:profiles!meetups_proposer_id_fkey(username, verification_level),
        receiver:profiles!meetups_receiver_id_fkey(username, verification_level),
        safe_zone:safe_zones(name, address, type),
        ratings:meetup_ratings(rater_id, rating, comment)
      `)
      .eq('id', id)
      .single();
    setMeetup(data as MeetupDetail);
    setLoading(false);
  }

  useEffect(() => { fetchMeetup(); }, [id]);

  const isProposer = meetup?.proposer_id === user?.id;
  const isReceiver = meetup?.receiver_id === user?.id;
  const myCheckedIn = isProposer ? meetup?.proposer_checked_in : meetup?.receiver_checked_in;
  const alreadyRated = meetup?.ratings.some((r) => r.rater_id === user?.id);

  async function handleConfirm() {
    if (!isReceiver) return;
    setActionLoading(true);
    await supabase.from('meetups').update({ status: 'confirmed' }).eq('id', id);
    await fetchMeetup();
    setActionLoading(false);
  }

  async function handleCancel() {
    Alert.alert('Cancelar encuentro', '¿Seguro que quieres cancelarlo?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          await supabase.from('meetups').update({ status: 'cancelled' }).eq('id', id);
          await fetchMeetup();
          setActionLoading(false);
        },
      },
    ]);
  }

  async function handleCheckIn() {
    setActionLoading(true);
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
    await fetchMeetup();
    setActionLoading(false);
  }

  async function handleEmergency() {
    Alert.alert(
      '🚨 Botón de Emergencia',
      'Se registrará una alerta con tu ubicación actual. ¿Confirmar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: '¡Enviar alerta!', style: 'destructive',
          onPress: () => Alert.alert('Alerta enviada', 'Tus contactos de confianza han sido notificados.'),
        },
      ],
    );
  }

  async function handleRate(positive: boolean) {
    const ratedId = isProposer ? meetup!.receiver_id : meetup!.proposer_id;
    setActionLoading(true);
    const { error } = await supabase.from('meetup_ratings').insert({
      meetup_id: id,
      rater_id: user!.id,
      rated_id: ratedId,
      rating: positive ? 'positive' : 'negative',
    });
    if (error) Alert.alert('Error', error.message);
    else { await fetchMeetup(); Alert.alert('¡Gracias!', 'Calificación enviada.'); }
    setActionLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#94A3B8" />;
  if (!meetup) return null;

  const date = new Date(meetup.scheduled_at);
  const isUpcoming = meetup.status === 'pending' || meetup.status === 'confirmed';
  const otherUser = isProposer ? meetup.receiver : meetup.proposer;
  const verBadge = (l: string) => l === 'advanced' ? '🟣' : l === 'intermediate' ? '🟢' : '⚪';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Encuentro</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll}>

        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: STATUS_COLORS[meetup.status] + '22' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[meetup.status] }]}>
            {STATUS_LABELS[meetup.status]}
          </Text>
          <Text style={styles.statusType}>{TYPE_LABELS[meetup.type]}</Text>
        </View>

        {/* Participantes */}
        <View style={styles.participants}>
          <UserBadge
            label="Propone"
            username={meetup.proposer.username}
            level={meetup.proposer.verification_level}
            checkedIn={meetup.proposer_checked_in}
            badge={verBadge(meetup.proposer.verification_level)}
          />
          <Text style={styles.vs}>VS</Text>
          <UserBadge
            label="Recibe"
            username={meetup.receiver.username}
            level={meetup.receiver.verification_level}
            checkedIn={meetup.receiver_checked_in}
            badge={verBadge(meetup.receiver.verification_level)}
          />
        </View>

        {/* Detalles */}
        <View style={styles.details}>
          <DetailRow
            label="Fecha"
            value={date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          />
          <DetailRow
            label="Hora"
            value={date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          />
          <DetailRow
            label="Lugar"
            value={meetup.safe_zone?.name ?? meetup.custom_location ?? 'Sin especificar'}
          />
          {meetup.safe_zone?.address && (
            <DetailRow label="Dirección" value={meetup.safe_zone.address} />
          )}
          {meetup.notes && <DetailRow label="Notas" value={meetup.notes} />}
        </View>

        {/* Acciones según estado */}
        {actionLoading ? (
          <ActivityIndicator color="#94A3B8" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.actions}>
            {/* Receiver puede confirmar si está pendiente */}
            {meetup.status === 'pending' && isReceiver && (
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>✅ Confirmar asistencia</Text>
              </TouchableOpacity>
            )}

            {/* Cancelar si está pendiente o confirmado */}
            {isUpcoming && (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Cancelar encuentro</Text>
              </TouchableOpacity>
            )}

            {/* Check-in el día del encuentro */}
            {meetup.status === 'confirmed' && !myCheckedIn && (
              <TouchableOpacity style={styles.checkinBtn} onPress={handleCheckIn}>
                <Text style={styles.checkinBtnText}>📍 Confirmar llegada (Check-in)</Text>
              </TouchableOpacity>
            )}
            {myCheckedIn && meetup.status !== 'completed' && (
              <View style={styles.checkedInBadge}>
                <Text style={styles.checkedInText}>✅ Ya hiciste check-in — esperando al otro jugador</Text>
              </View>
            )}

            {/* Botón de emergencia (solo si está confirmado) */}
            {meetup.status === 'confirmed' && (
              <TouchableOpacity style={styles.emergencyBtn} onPress={handleEmergency}>
                <Text style={styles.emergencyBtnText}>🚨 Botón de Emergencia</Text>
              </TouchableOpacity>
            )}

            {/* Rating post-encuentro */}
            {meetup.status === 'completed' && !alreadyRated && (
              <View style={styles.ratingSection}>
                <Text style={styles.ratingTitle}>¿Cómo fue el encuentro con @{otherUser.username}?</Text>
                <View style={styles.ratingBtns}>
                  <TouchableOpacity style={styles.ratingPositive} onPress={() => handleRate(true)}>
                    <Text style={styles.ratingBtnText}>👍 Positivo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ratingNegative} onPress={() => handleRate(false)}>
                    <Text style={styles.ratingBtnText}>👎 Negativo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {meetup.status === 'completed' && alreadyRated && (
              <View style={styles.checkedInBadge}>
                <Text style={styles.checkedInText}>✅ Ya calificaste este encuentro</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UserBadge({ label, username, badge, checkedIn }: {
  label: string; username: string; level: string; badge: string; checkedIn: boolean;
}) {
  return (
    <View style={styles.userBadge}>
      <Text style={styles.userBadgeLabel}>{label}</Text>
      <Text style={styles.userBadgeEmoji}>{badge}</Text>
      <Text style={styles.userBadgeName}>@{username}</Text>
      {checkedIn && <Text style={styles.checkinIndicator}>✅ Check-in</Text>}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
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
  scroll: { flex: 1 },
  statusBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 16, borderRadius: 12, padding: 16,
  },
  statusText: { fontSize: 18, fontWeight: '800' },
  statusType: { color: '#94A3B8', fontSize: 15 },
  participants: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  userBadge: { flex: 1, alignItems: 'center', padding: 14 },
  userBadgeLabel: { color: '#64748B', fontSize: 11, fontWeight: '600', marginBottom: 6 },
  userBadgeEmoji: { fontSize: 24, marginBottom: 4 },
  userBadgeName: { color: '#F1F5F9', fontSize: 13, fontWeight: '600' },
  checkinIndicator: { color: '#4ADE80', fontSize: 11, marginTop: 4 },
  vs: { color: '#334155', fontWeight: '800', fontSize: 14, paddingHorizontal: 8 },
  details: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#334155', gap: 16,
  },
  detailLabel: { color: '#64748B', fontSize: 13, flexShrink: 0 },
  detailValue: { color: '#F1F5F9', fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' },
  actions: { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },
  confirmBtn: { backgroundColor: '#14532D', borderRadius: 12, padding: 16, alignItems: 'center' },
  confirmBtnText: { color: '#4ADE80', fontSize: 15, fontWeight: '700' },
  cancelBtn: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#EF4444' },
  cancelBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  checkinBtn: { backgroundColor: '#6366F1', borderRadius: 12, padding: 16, alignItems: 'center' },
  checkinBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  checkedInBadge: { backgroundColor: '#0D2E1A', borderRadius: 10, padding: 12, alignItems: 'center' },
  checkedInText: { color: '#4ADE80', fontSize: 13 },
  emergencyBtn: {
    backgroundColor: '#450A0A', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#EF4444',
  },
  emergencyBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  ratingSection: {
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  ratingTitle: { color: '#F1F5F9', fontSize: 14, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  ratingBtns: { flexDirection: 'row', gap: 10 },
  ratingPositive: { flex: 1, backgroundColor: '#14532D', borderRadius: 10, padding: 14, alignItems: 'center' },
  ratingNegative: { flex: 1, backgroundColor: '#450A0A', borderRadius: 10, padding: 14, alignItems: 'center' },
  ratingBtnText: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
});
