import { useCallback, useState, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { consumeCollectionRefresh } from '@/lib/collectionRefresh';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, SafeAreaView, ActivityIndicator,
  Image, Dimensions, ScrollView, Alert, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, CollectionFolder, TCGGame } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type CardCollectionWithPrice = CardCollection & {
  pokemon_cards?: { tcgplayer_normal_market: number | null; tcgplayer_foil_market: number | null } | null;
};

function effectivePrice(card: CardCollectionWithPrice): number {
  if (card.price_reference != null) return card.price_reference;
  if (card.pokemon_cards) {
    const p = card.pokemon_cards;
    if (card.is_foil) return p.tcgplayer_foil_market ?? p.tcgplayer_normal_market ?? 0;
    return p.tcgplayer_normal_market ?? p.tcgplayer_foil_market ?? 0;
  }
  return 0;
}

// content paddingHorizontal:16 (×2=32) + gap:8 between 3 cols (×2=16) = 48
const CARD_WIDTH = (Dimensions.get('window').width - 48) / 3;

const FOLDER_COLORS = ['#6366F1', '#F87171', '#FACC15', '#34D399', '#60A5FA', '#FB923C', '#A78BFA', '#22D3EE'];

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15' },
  magic: { name: 'color-wand-outline', color: '#A78BFA' },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

type FolderForm = { mode: 'create' | 'rename'; id?: string; name: string; color: string };

export default function CollectionScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [allCards, setAllCards] = useState<CardCollectionWithPrice[]>([]);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGame, setFilterGame] = useState<TCGGame | 'all'>('all');
  const [folderForm, setFolderForm] = useState<FolderForm | null>(null);
  const [folderPickerCard, setFolderPickerCard] = useState<CardCollection | null>(null);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [folderValues, setFolderValues] = useState<Record<string, number>>({});

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('collection_folders').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: true });
    setFolders(data ?? []);
  }, [user]);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select('*, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market)')
      .eq('user_id', user.id).is('folder_id', null).order('created_at', { ascending: false });
    setAllCards((data ?? []) as CardCollectionWithPrice[]);
  }, [user]);

  const fetchFolderCounts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select('folder_id, quantity, price_reference, is_foil, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market)')
      .eq('user_id', user.id)
      .not('folder_id', 'is', null);
    const counts: Record<string, number> = {};
    const values: Record<string, number> = {};
    for (const row of (data ?? []) as CardCollectionWithPrice[]) {
      if (row.folder_id) {
        counts[row.folder_id] = (counts[row.folder_id] ?? 0) + row.quantity;
        values[row.folder_id] = (values[row.folder_id] ?? 0) + effectivePrice(row) * row.quantity;
      }
    }
    setFolderCounts(counts);
    setFolderValues(values);
  }, [user]);

  const uniqueGames = useMemo(() => new Set(allCards.map(c => c.game as TCGGame)), [allCards]);

  const cards = useMemo(() => {
    let result = allCards;
    if (filterGame !== 'all') result = result.filter(c => c.game === filterGame);
    if (search.trim()) result = result.filter(c => c.card_name.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [allCards, filterGame, search]);

  const isFirstMount = useRef(true);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current || consumeCollectionRefresh()) {
      isFirstMount.current = false;
      setLoading(true);
      Promise.all([fetchFolders(), fetchCards(), fetchFolderCounts()]).finally(() => setLoading(false));
    }
  }, [fetchCards, fetchFolders, fetchFolderCounts]));

async function saveFolderForm() {
    if (!user || !folderForm?.name.trim()) return;
    if (folderForm.mode === 'create') {
      await supabase.from('collection_folders').insert({
        user_id: user.id, name: folderForm.name.trim(), color: folderForm.color,
      });
    } else if (folderForm.mode === 'rename' && folderForm.id) {
      await supabase.from('collection_folders')
        .update({ name: folderForm.name.trim(), color: folderForm.color })
        .eq('id', folderForm.id);
    }
    setFolderForm(null);
    fetchFolders();
  }

  function handleFolderLongPress(folder: CollectionFolder) {
    Alert.alert(folder.name, undefined, [
      { text: 'Renombrar', onPress: () => setFolderForm({ mode: 'rename', id: folder.id, name: folder.name, color: folder.color }) },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: () => Alert.alert('Eliminar carpeta', `¿Eliminar "${folder.name}"? Las cartas quedarán sin carpeta.`, [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar', style: 'destructive',
            onPress: async () => {
              await supabase.from('collection_folders').delete().eq('id', folder.id);
              fetchFolders(); fetchCards();
            },
          },
        ]),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  function handleCardLongPress(card: CardCollection) {
    Alert.alert(card.card_name, undefined, [
      { text: 'Mover a carpeta', onPress: () => setFolderPickerCard(card) },
      { text: 'Ver detalle', onPress: () => router.push(`/(tabs)/collection/${card.id}`) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function assignFolder(cardId: string, folderId: string | null) {
    await supabase.from('cards_collection').update({ folder_id: folderId }).eq('id', cardId);
    setFolderPickerCard(null);
    setAllCards(prev => prev.filter(c => c.id !== cardId));
    fetchFolderCounts();
  }

  const totalCards = allCards.reduce((sum, c) => sum + c.quantity, 0);
  const unfolderedValue = allCards.reduce((sum, c) => sum + effectivePrice(c) * c.quantity, 0);
  const folderedValue = Object.values(folderValues).reduce((a, b) => a + b, 0);
  const totalValue = unfolderedValue + folderedValue;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mi Colección</Text>
          <Text style={styles.subtitle}>
            {totalCards} cartas{totalValue > 0 ? (
              <>{'  ·  '}<Text style={{ color: '#4ADE80' }}>${totalValue % 1 === 0 ? totalValue : totalValue.toFixed(2)}</Text></>
            ) : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/collection/add')}>
          <Text style={styles.addBtnText}>+ Agregar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#6366F1" />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 8 }}
          ListHeaderComponent={
            <CollectionHeader
              search={search}
              onSearchChange={setSearch}
              folders={folders}
              folderCounts={folderCounts}
              folderValues={folderValues}
              folderForm={folderForm}
              setFolderForm={setFolderForm}
              saveFolderForm={saveFolderForm}
              handleFolderLongPress={handleFolderLongPress}
              uniqueGames={uniqueGames}
              filterGame={filterGame}
              setFilterGame={setFilterGame}
              onFolderPress={(id) => router.push({ pathname: '/(tabs)/collection/folder/[id]', params: { id } })}
            />
          }
          renderItem={({ item }) => (
            <CardItem
              card={item}
              onPress={() => router.push(`/(tabs)/collection/${item.id}`)}
              onLongPress={() => handleCardLongPress(item)}
            />
          )}
          ListEmptyComponent={<EmptyCollection onAdd={() => router.push('/(tabs)/collection/add')} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 8 }}
          bounces={false}
          overScrollMode="never"
        />
      )}

      {/* Folder picker modal */}
      <FolderPickerModal
        visible={!!folderPickerCard}
        card={folderPickerCard}
        folders={folders}
        onSelect={(folderId) => folderPickerCard && assignFolder(folderPickerCard.id, folderId)}
        onClose={() => setFolderPickerCard(null)}
      />
    </SafeAreaView>
  );
}

// ─── Collection header (scrolls with list) ───────────────────────────────────

function CollectionHeader({
  search, onSearchChange, folders, folderCounts, folderValues, folderForm, setFolderForm,
  saveFolderForm, handleFolderLongPress, uniqueGames, filterGame, setFilterGame, onFolderPress,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  folders: CollectionFolder[];
  folderCounts: Record<string, number>;
  folderValues: Record<string, number>;
  folderForm: FolderForm | null;
  setFolderForm: (f: FolderForm | null) => void;
  saveFolderForm: () => void;
  handleFolderLongPress: (f: CollectionFolder) => void;
  uniqueGames: Set<TCGGame>;
  filterGame: TCGGame | 'all';
  setFilterGame: (g: TCGGame | 'all') => void;
  onFolderPress: (id: string) => void;
}) {
  return (
    <>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={onSearchChange}
        placeholder="Buscar carta..."
        placeholderTextColor="#475569"
      />

      <View style={styles.foldersSection}>
        <View style={styles.foldersSectionHeader}>
          <Text style={styles.sectionLabel}>Carpetas</Text>
          <TouchableOpacity onPress={() => setFolderForm({ mode: 'create', name: '', color: FOLDER_COLORS[0] })}>
            <Text style={styles.newFolderLink}>+ Nueva</Text>
          </TouchableOpacity>
        </View>

        {folderForm && (
          <View style={styles.folderFormBox}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {FOLDER_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, folderForm.color === c && styles.colorDotActive]}
                  onPress={() => setFolderForm({ ...folderForm, color: c })}
                />
              ))}
            </ScrollView>
            <View style={styles.folderFormRow}>
              <TextInput
                style={styles.folderNameInput}
                value={folderForm.name}
                onChangeText={name => setFolderForm({ ...folderForm, name })}
                placeholder="Nombre de la carpeta"
                placeholderTextColor="#475569"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveFolderForm}
              />
              <TouchableOpacity style={[styles.folderFormBtn, { backgroundColor: folderForm.color }]} onPress={saveFolderForm}>
                <Text style={styles.folderFormBtnText}>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.folderFormCancel} onPress={() => setFolderForm(null)}>
                <Ionicons name="close-outline" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {folders.length === 0 && !folderForm ? (
          <TouchableOpacity
            style={styles.emptyFolders}
            onPress={() => setFolderForm({ mode: 'create', name: '', color: FOLDER_COLORS[0] })}
          >
            <Ionicons name="folder-open-outline" size={20} color="#334155" />
            <Text style={styles.emptyFoldersText}>Crea una carpeta para organizar tu colección</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderTilesRow}>
            {folders.map(f => (
              <TouchableOpacity
                key={f.id}
                style={styles.folderTile}
                onPress={() => onFolderPress(f.id)}
                onLongPress={() => handleFolderLongPress(f)}
                activeOpacity={0.7}
              >
                <View style={[styles.folderTileTop, { backgroundColor: f.color + '22' }]}>
                  <Ionicons name="folder" size={28} color={f.color} />
                </View>
                <View style={styles.folderTileBottom}>
                  <Text style={styles.folderTileName} numberOfLines={1}>{f.name}</Text>
                  <View style={styles.folderTileNameRow}>
                    <Text style={styles.folderTileCount}>{folderCounts[f.id] ?? 0} cartas</Text>
                    {(folderValues[f.id] ?? 0) > 0 && (
                      <Text style={styles.folderTileValue}>
                        · ${(folderValues[f.id] % 1 === 0 ? folderValues[f.id] : folderValues[f.id].toFixed(2))}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {uniqueGames.size > 1 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterGame === 'all' && styles.filterChipActive]}
            onPress={() => setFilterGame('all')}
          >
            <Text style={[styles.filterChipText, filterGame === 'all' && styles.filterChipTextActive]}>Todas</Text>
          </TouchableOpacity>
          {(Array.from(uniqueGames) as TCGGame[]).map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.filterChip, filterGame === g && styles.filterChipActive]}
              onPress={() => setFilterGame(g)}
            >
              <Ionicons name={GAME_ICON[g].name} size={15} color={filterGame === g ? '#fff' : GAME_ICON[g].color} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Folder picker modal ──────────────────────────────────────────────────────

function FolderPickerModal({
  visible, card, folders, onSelect, onClose,
}: {
  visible: boolean;
  card: CardCollection | null;
  folders: CollectionFolder[];
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Mover a carpeta</Text>
          {card?.folder_id && (
            <TouchableOpacity style={styles.folderRow} onPress={() => onSelect(null)}>
              <View style={[styles.folderRowIcon, { backgroundColor: '#33415544' }]}>
                <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
              </View>
              <Text style={styles.folderRowName}>Quitar de carpeta</Text>
            </TouchableOpacity>
          )}
          {folders.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.folderRow, card?.folder_id === f.id && styles.folderRowActive]}
              onPress={() => onSelect(f.id)}
            >
              <View style={[styles.folderRowIcon, { backgroundColor: f.color + '33' }]}>
                <Ionicons name="folder" size={20} color={f.color} />
              </View>
              <Text style={styles.folderRowName}>{f.name}</Text>
              {card?.folder_id === f.id && (
                <Ionicons name="checkmark" size={18} color="#6366F1" style={{ marginLeft: 'auto' }} />
              )}
            </TouchableOpacity>
          ))}
          {folders.length === 0 && (
            <Text style={styles.noFoldersText}>No tienes carpetas. Crea una primero.</Text>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Card item ────────────────────────────────────────────────────────────────

function CardItem({ card, onPress, onLongPress }: {
  card: CardCollectionWithPrice; onPress: () => void; onLongPress: () => void;
}) {
  const gameIcon = GAME_ICON[card.game];
  const price = effectivePrice(card);
  return (
    <TouchableOpacity style={styles.thumb} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {card.image_url ? (
        <Image source={{ uri: card.image_url }} style={styles.thumbImg} resizeMode="contain" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name={gameIcon.name} size={32} color={gameIcon.color} />
        </View>
      )}
      <View style={styles.thumbFooter}>
        {card.card_number && <Text style={styles.thumbNum}>#{card.card_number}</Text>}
        <Text style={styles.thumbName} numberOfLines={1}>{card.card_name}</Text>
        {price > 0 && <Text style={styles.thumbPrice}>${price % 1 === 0 ? price : price.toFixed(2)}</Text>}
      </View>
      {card.quantity > 1 && (
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>×{card.quantity}</Text>
        </View>
      )}
      {(card.is_for_trade || card.is_for_sale) && (
        <View style={styles.tagBadge}>
          {card.is_for_trade && <View style={styles.tagDotTrade} />}
          {card.is_for_sale && <View style={styles.tagDotSale} />}
        </View>
      )}
      {card.folder_id && (
        <View style={styles.folderBadge}>
          <Ionicons name="folder" size={10} color="#94A3B8" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyCollection({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="albums-outline" size={64} color="#334155" style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>Tu colección está vacía</Text>
      <Text style={styles.emptyText}>Agrega cartas para construir tu inventario digital</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onAdd}>
        <Text style={styles.addBtnText}>Agregar primera carta</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  search: {
    marginBottom: 16,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    borderRadius: 12, padding: 12, fontSize: 14, color: '#F1F5F9',
  },

  foldersSection: { marginBottom: 12 },
  foldersSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  newFolderLink: { color: '#6366F1', fontSize: 13, fontWeight: '600' },

  folderFormBox: {
    marginBottom: 10,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155',
    padding: 12, gap: 10,
  },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorDotActive: { borderWidth: 3, borderColor: '#fff' },
  folderFormRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderNameInput: {
    flex: 1, backgroundColor: '#0F172A', borderRadius: 8,
    borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 14, color: '#F1F5F9',
  },
  folderFormBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  folderFormBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  folderFormCancel: { padding: 4 },

  emptyFolders: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#1E293B',
  },
  emptyFoldersText: { color: '#475569', fontSize: 13 },

  folderTilesRow: { gap: 10, paddingBottom: 2 },
  folderTile: {
    width: CARD_WIDTH, borderRadius: 12, borderWidth: 1, borderColor: '#334155',
    backgroundColor: '#1E293B', overflow: 'hidden',
  },
  folderTileTop: { height: 56, alignItems: 'center', justifyContent: 'center' },
  folderTileBottom: { padding: 8 },
  folderTileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  folderTileName: { color: '#F1F5F9', fontSize: 12, fontWeight: '700' },
  folderTileCount: { color: '#64748B', fontSize: 11, marginTop: 2 },
  folderTileValue: { color: '#4ADE80', fontSize: 11, fontWeight: '600' },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B',
  },
  filterChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterChipText: { color: '#64748B', fontSize: 13 },
  filterChipTextActive: { color: '#fff' },

  thumb: {
    width: CARD_WIDTH, alignItems: 'center',
    backgroundColor: '#1E293B', borderRadius: 12, padding: 8,
    borderWidth: 1, borderColor: '#334155',
  },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 8 },
  thumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 8,
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
  tagBadge: { position: 'absolute', top: 4, left: 4, flexDirection: 'row', gap: 3 },
  tagDotTrade: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22D3EE' },
  tagDotSale: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  folderBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#1E293B', borderRadius: 6, borderWidth: 1, borderColor: '#334155',
    padding: 2,
  },

  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#334155',
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 10,
  },
  folderRowActive: { backgroundColor: '#6366F122' },
  folderRowIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  folderRowName: { color: '#F1F5F9', fontSize: 15 },
  noFoldersText: { color: '#64748B', fontSize: 14, textAlign: 'center', paddingVertical: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  emptyBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
});
