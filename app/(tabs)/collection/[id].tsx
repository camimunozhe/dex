import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { requestCollectionRefresh } from '@/lib/collectionRefresh';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, CollectionFolder, TCGGame } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const GAME_LABELS: Record<TCGGame, string> = {
  pokemon: 'Pokémon', magic: 'Magic: The Gathering', yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece', digimon: 'Digimon', lorcana: 'Lorcana', other: 'Otro',
};

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15' },
  magic: { name: 'color-wand-outline', color: '#A78BFA' },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

const CONDITION_LABELS: Record<string, string> = {
  mint: 'Mint', near_mint: 'Casi Nueva', excellent: 'Excelente',
  good: 'Buena', played: 'Jugada', poor: 'Dañada',
};

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  type CardWithPrice = CardCollection & {
    pokemon_cards?: { tcgplayer_normal_market: number | null; tcgplayer_foil_market: number | null } | null;
  };
  const [card, setCard] = useState<CardWithPrice | null>(null);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('collection_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setFolders(data ?? []);
  }, [user]);

  useEffect(() => {
    Promise.all([
      supabase.from('cards_collection')
        .select('*, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market)')
        .eq('id', id).single()
        .then(({ data }) => setCard(data as CardWithPrice)),
      fetchFolders(),
    ]).finally(() => setLoading(false));
  }, [id, fetchFolders]);

  async function handleDelete() {
    Alert.alert('Eliminar carta', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await supabase.from('cards_collection').delete().eq('id', id);
          requestCollectionRefresh();
          router.back();
        },
      },
    ]);
  }

  async function assignFolder(folderId: string | null) {
    await supabase.from('cards_collection').update({ folder_id: folderId }).eq('id', id);
    setCard(c => c ? { ...c, folder_id: folderId } : c);
    setShowFolderPicker(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#6366F1" />;
  if (!card) return null;

  const gameIcon = GAME_ICON[card.game];
  const currentFolder = folders.find(f => f.id === card.folder_id);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteBtn}>Eliminar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.heroCard}>
          <Ionicons name={gameIcon.name} size={72} color={gameIcon.color} style={styles.heroIcon} />
          <Text style={styles.heroName}>{card.card_name}</Text>
          <Text style={styles.heroGame}>{GAME_LABELS[card.game]}</Text>
          {card.is_foil && (
            <View style={styles.foilBadge}>
              <Ionicons name="star-outline" size={13} color="#93C5FD" />
              <Text style={styles.foilText}>Foil</Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          <DetailRow label="Set" value={card.set_name ?? '-'} />
          <DetailRow label="Número" value={card.card_number ?? '-'} />
          <DetailRow label="Condición" value={CONDITION_LABELS[card.condition]} />
          <DetailRow label="Cantidad" value={String(card.quantity)} />
          {card.price_reference && (
            <DetailRow label="Precio ref." value={`$${card.price_reference} USD`} highlight />
          )}
          {card.pokemon_cards && (() => {
            const p = card.pokemon_cards!;
            const mp = card.is_foil
              ? (p.tcgplayer_foil_market ?? p.tcgplayer_normal_market)
              : (p.tcgplayer_normal_market ?? p.tcgplayer_foil_market);
            return mp ? <DetailRow label="Precio mercado" value={`$${mp} USD`} highlight /> : null;
          })()}
          <TouchableOpacity style={styles.detailRow} onPress={() => setShowFolderPicker(true)}>
            <Text style={styles.detailLabel}>Carpeta</Text>
            <View style={styles.folderValue}>
              {currentFolder ? (
                <>
                  <View style={[styles.folderDot, { backgroundColor: currentFolder.color }]} />
                  <Text style={styles.detailValue}>{currentFolder.name}</Text>
                </>
              ) : (
                <Text style={[styles.detailValue, { color: '#475569' }]}>Sin carpeta</Text>
              )}
              <Ionicons name="chevron-forward-outline" size={14} color="#475569" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.tags}>
          {card.is_for_trade && (
            <View style={styles.tagTrade}>
              <Ionicons name="swap-horizontal-outline" size={14} color="#E2E8F0" />
              <Text style={styles.tagText}>Disponible para trade</Text>
            </View>
          )}
          {card.is_for_sale && (
            <View style={styles.tagSale}>
              <Ionicons name="pricetag-outline" size={14} color="#E2E8F0" />
              <Text style={styles.tagText}>En venta</Text>
            </View>
          )}
        </View>

        {card.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notas</Text>
            <Text style={styles.notesText}>{card.notes}</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showFolderPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowFolderPicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Mover a carpeta</Text>
            <FlatList
              data={[{ id: null as string | null, name: 'Sin carpeta', color: '#475569' }, ...folders]}
              keyExtractor={item => item.id ?? 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.folderOption, card.folder_id === item.id && styles.folderOptionActive]}
                  onPress={() => assignFolder(item.id)}
                >
                  <View style={[styles.folderOptionDot, { backgroundColor: item.color }]} />
                  <Text style={styles.folderOptionText}>{item.name}</Text>
                  {card.folder_id === item.id && (
                    <Ionicons name="checkmark-outline" size={18} color="#6366F1" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && styles.detailValueHighlight]}>{value}</Text>
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
  deleteBtn: { color: '#EF4444', fontSize: 15 },
  scroll: { flex: 1 },
  heroCard: {
    alignItems: 'center', padding: 32,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  heroIcon: { marginBottom: 12 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#F1F5F9', textAlign: 'center' },
  heroGame: { fontSize: 14, color: '#64748B', marginTop: 4 },
  foilBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, backgroundColor: '#1E3A5F',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
  },
  foilText: { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  details: {
    margin: 16, backgroundColor: '#1E293B',
    borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  detailLabel: { color: '#64748B', fontSize: 14 },
  detailValue: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
  detailValueHighlight: { color: '#4ADE80' },
  folderValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderDot: { width: 8, height: 8, borderRadius: 4 },
  tags: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  tagTrade: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#164E63', borderRadius: 10, padding: 12, justifyContent: 'center',
  },
  tagSale: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#14532D', borderRadius: 10, padding: 12, justifyContent: 'center',
  },
  tagText: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },
  notes: { margin: 16, backgroundColor: '#1E293B', borderRadius: 12, padding: 14 },
  notesLabel: { color: '#64748B', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  notesText: { color: '#F1F5F9', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, maxHeight: '60%',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#F1F5F9', padding: 16, paddingBottom: 8 },
  folderOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  folderOptionActive: { backgroundColor: '#0F172A' },
  folderOptionDot: { width: 12, height: 12, borderRadius: 6 },
  folderOptionText: { flex: 1, color: '#F1F5F9', fontSize: 15 },
});
