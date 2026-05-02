import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl,
  Dimensions, Modal, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, CollectionFolder, TCGGame } from '@/types/database';
import { formatCurrencyValue } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { requestCollectionRefresh } from '@/lib/collectionRefresh';
import { validateFolderGame, gameLabel } from '@/lib/folderValidation';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type CardCollectionWithPrice = CardCollection & {
  pokemon_cards?: { tcgplayer_normal_market: number | null; tcgplayer_foil_market: number | null } | null;
};

function effectivePrice(
  card: CardCollectionWithPrice,
  currency: import('@/types/database').Currency,
  usdToClp: number,
): number {
  if (card.price_reference != null) return card.price_reference;
  if (card.pokemon_cards) {
    const p = card.pokemon_cards;
    const usd = card.is_foil
      ? p.tcgplayer_foil_market ?? p.tcgplayer_normal_market ?? 0
      : p.tcgplayer_normal_market ?? p.tcgplayer_foil_market ?? 0;
    return currency === 'clp' ? usd * usdToClp : usd;
  }
  return 0;
}

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3;

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15' },
  magic: { name: 'color-wand-outline', color: '#A78BFA' },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? 'usd';
  const router = useRouter();

  const [folder, setFolder] = useState<CollectionFolder | null>(null);
  const [cards, setCards] = useState<CardCollectionWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [usdToClp, setUsdToClp] = useState(950);

  const fetchFolder = useCallback(async () => {
    const { data } = await supabase
      .from('collection_folders')
      .select('*')
      .eq('id', id)
      .single();
    setFolder(data);
  }, [id]);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select('*, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market)')
      .eq('user_id', user.id)
      .eq('folder_id', id)
      .order('created_at', { ascending: false });
    setCards((data ?? []) as CardCollectionWithPrice[]);
  }, [user, id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchFolder(), fetchCards()]).finally(() => setLoading(false));
  }, [fetchFolder, fetchCards]);

  useEffect(() => {
    if (currency !== 'clp') return;
    getUsdToClp().then(setUsdToClp);
  }, [currency]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchFolder(), fetchCards()]);
    setRefreshing(false);
  }

  async function removeFromFolder(cardId: string) {
    await supabase.from('cards_collection').update({ folder_id: null }).eq('id', cardId);
    setCards(prev => prev.filter(c => c.id !== cardId));
    requestCollectionRefresh();
  }

  function handleCardLongPress(card: CardCollection) {
    Alert.alert(card.card_name, undefined, [
      {
        text: 'Quitar de carpeta',
        style: 'destructive',
        onPress: () => removeFromFolder(card.id),
      },
      { text: 'Ver detalle', onPress: () => router.push(`/(tabs)/collection/${card.id}`) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function deleteFolder() {
    Alert.alert('Eliminar carpeta', `¿Eliminar "${folder?.name}"? Las cartas quedarán sin carpeta.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await supabase.from('collection_folders').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#6366F1" />;
  if (!folder) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#6366F1" />
          <Text style={styles.back}>Colección</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
          <Text style={styles.title} numberOfLines={1}>{folder.name}</Text>
        </View>
        <TouchableOpacity onPress={deleteFolder} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={19} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>{totalCards} cartas</Text>

      <FlatList
        data={cards}
        keyExtractor={item => item.id}
        numColumns={3}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        renderItem={({ item }) => (
          <CardItem
            card={item}
            onPress={() => router.push(`/(tabs)/collection/${item.id}`)}
            onLongPress={() => handleCardLongPress(item)}
            currency={currency}
            usdToClp={usdToClp}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={48} color="#334155" />
            <Text style={styles.emptyTitle}>Carpeta vacía</Text>
            <Text style={styles.emptyText}>Agrega cartas desde tu colección</Text>
          </View>
        }
        contentContainerStyle={cards.length === 0 ? { flex: 1 } : { padding: 8, paddingBottom: 100 }}
      />

      <View style={styles.addBar}>
        <TouchableOpacity style={styles.addBarBtn} onPress={() => setShowPicker(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.addBarBtnText}>Agregar cartas</Text>
        </TouchableOpacity>
      </View>

      <CardPickerModal
        visible={showPicker}
        folderId={id}
        folderColor={folder.color}
        userId={user!.id}
        onClose={() => setShowPicker(false)}
        onAdded={() => { setShowPicker(false); fetchCards(); }}
      />
    </SafeAreaView>
  );
}

// ─── Card picker modal ────────────────────────────────────────────────────────

function CardPickerModal({
  visible, folderId, folderColor, userId, onClose, onAdded,
}: {
  visible: boolean;
  folderId: string;
  folderColor: string;
  userId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [allCards, setAllCards] = useState<CardCollection[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelected(new Set());
    setSearch('');
    supabase
      .from('cards_collection')
      .select('*')
      .eq('user_id', userId)
      .or(`folder_id.is.null,folder_id.neq.${folderId}`)
      .order('card_name', { ascending: true })
      .then(({ data }) => { setAllCards(data ?? []); setLoading(false); });
  }, [visible, userId, folderId]);

  const filtered = search.trim()
    ? allCards.filter(c => c.card_name.toLowerCase().includes(search.toLowerCase()))
    : allCards;

  function toggleCard(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    const games = allCards.filter(c => selected.has(c.id)).map(c => c.game);
    const check = await validateFolderGame(folderId, games);
    if (!check.ok) {
      setSaving(false);
      Alert.alert('Carpeta de otro juego', `Esta carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.`);
      return;
    }
    await supabase
      .from('cards_collection')
      .update({ folder_id: folderId })
      .in('id', Array.from(selected));
    setSaving(false);
    requestCollectionRefresh();
    onAdded();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Agregar cartas</Text>
          <TouchableOpacity
            style={[styles.modalSaveBtn, { backgroundColor: folderColor }, (selected.size === 0 || saving) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={selected.size === 0 || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.modalSaveBtnText}>
                  {selected.size === 0 ? 'Agregar' : `Agregar ${selected.size}`}
                </Text>
            }
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.modalSearch}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar carta..."
          placeholderTextColor="#475569"
        />

        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color="#6366F1" />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={c => c.id}
            numColumns={3}
            columnWrapperStyle={{ justifyContent: 'flex-start' }}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              const gameIcon = GAME_ICON[item.game];
              return (
                <TouchableOpacity
                  style={[styles.thumb, isSelected && { borderColor: folderColor, borderWidth: 2, backgroundColor: folderColor + '22' }]}
                  onPress={() => toggleCard(item.id)}
                  activeOpacity={0.7}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.thumbImg} contentFit="contain" />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons name={gameIcon.name} size={28} color={gameIcon.color} />
                    </View>
                  )}
                  <View style={styles.thumbFooter}>
                    {item.card_number && <Text style={styles.thumbNum}>#{item.card_number}</Text>}
                    <Text style={styles.thumbName} numberOfLines={1}>{item.card_name}</Text>
                  </View>
                  {item.quantity > 1 && !isSelected && (
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyText}>×{item.quantity}</Text>
                    </View>
                  )}
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: folderColor }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {search ? 'Sin resultados' : 'Todas tus cartas ya están en esta carpeta'}
                </Text>
              </View>
            }
            contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { padding: 8, paddingBottom: 20 }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Card item ────────────────────────────────────────────────────────────────

function CardItem({ card, onPress, onLongPress, currency = 'usd', usdToClp = 950 }: {
  card: CardCollectionWithPrice;
  onPress: () => void;
  onLongPress: () => void;
  currency?: import('@/types/database').Currency;
  usdToClp?: number;
}) {
  const gameIcon = GAME_ICON[card.game];
  const price = effectivePrice(card, currency, usdToClp);
  return (
    <TouchableOpacity style={styles.thumb} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {card.image_url ? (
        <Image source={{ uri: card.image_url }} style={styles.thumbImg} contentFit="contain" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name={gameIcon.name} size={32} color={gameIcon.color} />
        </View>
      )}
      <View style={styles.thumbFooter}>
        {card.card_number && <Text style={styles.thumbNum}>#{card.card_number}</Text>}
        <Text style={styles.thumbName} numberOfLines={1}>{card.card_name}</Text>
        {price > 0 && <Text style={styles.thumbPrice}>{formatCurrencyValue(price, currency)}</Text>}
      </View>
      {card.quantity > 1 && (
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>×{card.quantity}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  back: { color: '#6366F1', fontSize: 15 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  folderDot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 17, fontWeight: '700', color: '#F1F5F9' },
  deleteBtn: { minWidth: 80, alignItems: 'flex-end' },
  subtitle: { color: '#64748B', fontSize: 13, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { color: '#F1F5F9', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#64748B', fontSize: 14, textAlign: 'center' },

  addBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 28,
    backgroundColor: '#0F172A',
    borderTopWidth: 1, borderTopColor: '#1E293B',
  },
  addBarBtn: {
    backgroundColor: '#6366F1', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  addBarBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  thumb: {
    width: CARD_WIDTH, margin: 4, alignItems: 'center',
    backgroundColor: '#1E293B', borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: '#334155',
  },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  thumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  thumbNum: { color: '#64748B', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', flex: 1 },
  thumbPrice: { color: '#4ADE80', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  qtyBadge: {
    position: 'absolute', bottom: 28, right: 4,
    backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 5, paddingVertical: 1,
  },
  qtyText: { color: '#94A3B8', fontSize: 9, fontWeight: '700' },
  checkBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  modalContainer: { flex: 1, backgroundColor: '#0F172A' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  modalCancel: { color: '#6366F1', fontSize: 15, minWidth: 70 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#F1F5F9' },
  modalSaveBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 70, alignItems: 'center' },
  modalSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalSearch: {
    margin: 12,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    borderRadius: 12, padding: 12, fontSize: 14, color: '#F1F5F9',
  },
});
