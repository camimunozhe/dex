import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscribeCollection, removeCollectionCard } from '@/lib/collectionRefresh';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, SafeAreaView, ActivityIndicator, RefreshControl,
  Dimensions, ScrollView, Alert, Modal, Switch, AppState,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, CollectionFolder, TCGGame } from '@/types/database';
import { formatPrice, formatCurrencyValue, currencyLabel } from '@/lib/currency';
import { validateFolderGame, gameLabel } from '@/lib/folderValidation';
import { reassignFolderCardsToDefault } from '@/lib/defaultFolders';
import { getUsdToClp } from '@/lib/exchangeRate';
import { availabilityBorder } from '@/lib/cardStyle';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { effectivePrice, COLLECTION_CARD_SELECT, type CardWithCatalog } from '@/lib/cardPrice';
import { FolderIcon } from '@/lib/folderIcon';
import { UndoSnackbar } from '@/lib/UndoSnackbar';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type CardCollectionWithPrice = CardWithCatalog;

const CARD_WIDTH = (Dimensions.get('window').width - 48) / 3;
const FOLDER_TILE_WIDTH = (Dimensions.get('window').width - 32 - 10) / 2; // 16px lateral padding, 10px gap entre columnas
const FOLDER_COLORS = ['#6366F1', '#F87171', '#FACC15', '#34D399', '#60A5FA', '#FB923C', '#A78BFA', '#22D3EE'];

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string; image?: ReturnType<typeof require> }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15', image: require('../../../assets/pokemon-tcg-logo.png') },
  magic: { name: 'color-wand-outline', color: '#A78BFA', image: require('../../../assets/magic-tcg-logo.png') },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

type FolderForm = { mode: 'create' | 'rename'; id?: string; name: string; color: string };

export default function CollectionScreen() {
  const { user, profile, loading: authLoading } = useAuth();
  const currency = profile?.currency ?? 'usd';
  const router = useRouter();
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGame, setFilterGame] = useState<TCGGame | 'all'>('all');
  const [folderForm, setFolderForm] = useState<FolderForm | null>(null);
  const [folderPickerCard, setFolderPickerCard] = useState<CardCollection | null>(null);
  const [allUserCards, setAllUserCards] = useState<CardCollectionWithPrice[]>([]);
  const [cardActionCard, setCardActionCard] = useState<CardCollectionWithPrice | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);
  const [folderActionFolder, setFolderActionFolder] = useState<CollectionFolder | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [usdToClp, setUsdToClp] = useState(950);
  const [rateReady, setRateReady] = useState(currency !== 'clp');
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteRef = useRef<Set<string>>(new Set());
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('collection_folders').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: true });
    setFolders(data ?? []);
  }, [user]);

  const fetchAllCards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select(COLLECTION_CARD_SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAllUserCards((data ?? []) as unknown as CardCollectionWithPrice[]);
  }, [user]);

  const enabledGamesSet = useMemo(() => new Set(resolveEnabledGames(profile?.enabled_games)), [profile?.enabled_games]);
  const visibleUserCards = useMemo(
    () => allUserCards.filter(c => !pendingDeleteIds.has(c.id) && enabledGamesSet.has(c.game)),
    [allUserCards, enabledGamesSet, pendingDeleteIds],
  );
  const allCards = useMemo(() => visibleUserCards.filter(c => c.folder_id === null), [visibleUserCards]);
  const folderedRows = useMemo(() => visibleUserCards.filter(c => c.folder_id !== null), [visibleUserCards]);
  // Derive each folder's effective game from any card it has (custom folders) using the unfiltered set,
  // so a folder full of cards from a disabled game is still detected as belonging to that game.
  const folderGameMap = useMemo(() => {
    const map: Record<string, TCGGame | null> = {};
    for (const f of folders) map[f.id] = f.is_default ? (f.game ?? null) : null;
    for (const c of allUserCards) {
      if (c.folder_id && map[c.folder_id] == null) map[c.folder_id] = c.game;
    }
    return map;
  }, [folders, allUserCards]);
  const visibleFolders = useMemo(() => folders.filter(f => {
    if (f.is_default && f.game) return enabledGamesSet.has(f.game);
    const g = folderGameMap[f.id];
    if (g == null) return true; // empty custom folder: always show
    return enabledGamesSet.has(g);
  }), [folders, folderGameMap, enabledGamesSet]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of folderedRows) {
      if (row.folder_id) counts[row.folder_id] = (counts[row.folder_id] ?? 0) + row.quantity;
    }
    return counts;
  }, [folderedRows]);

  const folderValues = useMemo(() => {
    const values: Record<string, number> = {};
    for (const row of folderedRows) {
      if (row.folder_id) {
        values[row.folder_id] = (values[row.folder_id] ?? 0) + effectivePrice(row, currency, usdToClp) * row.quantity;
      }
    }
    return values;
  }, [folderedRows, currency, usdToClp]);

  const uniqueGames = useMemo(() => new Set(allCards.map(c => c.game as TCGGame)), [allCards]);

  const cards = useMemo(() => {
    let result = allCards;
    if (filterGame !== 'all') result = result.filter(c => c.game === filterGame);
    if (search.trim()) result = result.filter(c => c.card_name.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [allCards, filterGame, search]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchFolders(), fetchAllCards()]);
    setRefreshing(false);
  }, [fetchAllCards, fetchFolders]);

  const isFirstMount = useRef(true);
  const needsRefresh = useRef(false);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current || needsRefresh.current) {
      isFirstMount.current = false;
      needsRefresh.current = false;
      setLoading(true);
      Promise.all([fetchFolders(), fetchAllCards()]).finally(() => setLoading(false));
    }
  }, [fetchAllCards, fetchFolders]));

  useEffect(() => {
    return subscribeCollection(event => {
      if (event.type === 'patch') {
        setAllUserCards(prev => prev.map(c => c.id === event.cardId ? { ...c, ...event.patch } : c));
      } else if (event.type === 'remove') {
        setAllUserCards(prev => prev.filter(c => c.id !== event.cardId));
      } else if (event.type === 'refresh') {
        needsRefresh.current = true;
      }
    });
  }, []);

  useEffect(() => {
    if (currency !== 'clp') { setRateReady(true); return; }
    let mounted = true;
    setRateReady(false);
    getUsdToClp().then(r => {
      if (!mounted) return;
      setUsdToClp(r);
      setRateReady(true);
    });
    return () => { mounted = false; };
  }, [currency]);

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
    setFolderActionFolder(folder);
  }

  async function deleteFolderConfirmed(folder: CollectionFolder) {
    setFolderActionFolder(null);
    if (folder.is_default) {
      Alert.alert('Carpeta default', 'No se puede eliminar la carpeta default de un juego. Podés renombrarla.');
      return;
    }
    const folderGame = folderGameMap[folder.id];
    const destinationLabel = folderGame && folderGame !== 'other'
      ? `Las cartas se moverán a tu carpeta default de ${gameLabel(folderGame)}.`
      : 'Las cartas quedarán sin carpeta.';
    Alert.alert('Eliminar carpeta', `¿Eliminar "${folder.name}"? ${destinationLabel}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (user) await reassignFolderCardsToDefault(user.id, folder.id);
          await supabase.from('collection_folders').delete().eq('id', folder.id);
          fetchFolders(); fetchAllCards();
        },
      },
    ]);
  }

  function handleCardPress(card: CardCollectionWithPrice) {
    if (selectionMode) {
      toggleCardSelection(card.id);
    } else {
      setCardActionCard(card);
    }
  }

  function handleCardLongPress(card: CardCollectionWithPrice) {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedCards(new Set([card.id]));
    }
  }

  function toggleCardSelection(id: string) {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setSelectionMode(false);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedCards(new Set());
  }

  function selectAll() {
    setSelectedCards(new Set(cards.map(c => c.id)));
  }

  async function handleToggleField(card: CardCollectionWithPrice, field: 'is_for_trade' | 'is_for_sale', value: boolean) {
    await supabase.from('cards_collection').update({ [field]: value }).eq('id', card.id);
    setAllUserCards(prev => prev.map(c => c.id === card.id ? { ...c, [field]: value } : c));
    setCardActionCard(c => c?.id === card.id ? { ...c, [field]: value } : c);
  }

  async function handleDeleteCard(cardId: string) {
    Alert.alert('Eliminar carta', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await supabase.from('cards_collection').delete().eq('id', cardId);
          setAllUserCards(prev => prev.filter(c => c.id !== cardId));
          setCardActionCard(null);
        },
      },
    ]);
  }

  async function assignFolder(cardId: string, folderId: string | null) {
    if (folderId) {
      const card = allCards.find(c => c.id === cardId);
      if (card) {
        const check = await validateFolderGame(folderId, [card.game]);
        if (!check.ok) {
          Alert.alert('Carpeta de otro juego', `Esta carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.`);
          return;
        }
      }
    }
    await supabase.from('cards_collection').update({ folder_id: folderId }).eq('id', cardId);
    setFolderPickerCard(null);
    setAllUserCards(prev => prev.map(c => c.id === cardId ? { ...c, folder_id: folderId } : c));
  }

  async function bulkAssignFolder(folderId: string | null) {
    const ids = Array.from(selectedCards);
    if (folderId) {
      const games = allCards.filter(c => ids.includes(c.id)).map(c => c.game);
      const check = await validateFolderGame(folderId, games);
      if (!check.ok) {
        Alert.alert('Carpeta de otro juego', `Esta carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.`);
        return;
      }
    }
    await supabase.from('cards_collection').update({ folder_id: folderId }).in('id', ids);
    setBulkFolderOpen(false);
    setAllUserCards(prev => prev.map(c => ids.includes(c.id) ? { ...c, folder_id: folderId } : c));
    exitSelectionMode();
  }

  async function bulkToggleField(field: 'is_for_trade' | 'is_for_sale' | 'is_foil') {
    const ids = Array.from(selectedCards);
    const selectedList = allCards.filter(c => selectedCards.has(c.id));
    const newValue = !selectedList.every(c => c[field]);
    await supabase.from('cards_collection').update({ [field]: newValue }).in('id', ids);
    setAllUserCards(prev => prev.map(c => selectedCards.has(c.id) ? { ...c, [field]: newValue } : c));
    exitSelectionMode();
  }

  async function commitPendingDelete() {
    if (pendingDeleteTimer.current) { clearTimeout(pendingDeleteTimer.current); pendingDeleteTimer.current = null; }
    const ids = Array.from(pendingDeleteRef.current);
    if (ids.length === 0) return;
    pendingDeleteRef.current = new Set();
    setPendingDeleteIds(new Set());
    setAllUserCards(prev => prev.filter(c => !ids.includes(c.id)));
    await supabase.from('cards_collection').delete().in('id', ids);
    ids.forEach(cardId => removeCollectionCard(cardId));
  }

  function undoPendingDelete() {
    if (pendingDeleteTimer.current) { clearTimeout(pendingDeleteTimer.current); pendingDeleteTimer.current = null; }
    pendingDeleteRef.current = new Set();
    setPendingDeleteIds(new Set());
  }

  function bulkDelete() {
    const ids = Array.from(selectedCards);
    if (ids.length === 0) return;
    // Commit any previous pending delete before scheduling a new one.
    commitPendingDelete();
    const next = new Set(ids);
    pendingDeleteRef.current = next;
    setPendingDeleteIds(next);
    exitSelectionMode();
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    pendingDeleteTimer.current = setTimeout(() => { commitPendingDelete(); }, 5000);
  }

  // Commit pending deletes when the app backgrounds OR on unmount, so soft-deleted
  // cards aren't left as live rows in the DB if the user closes the app mid-undo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') commitPendingDelete();
    });
    return () => {
      sub.remove();
      if (pendingDeleteRef.current.size > 0) {
        const ids = Array.from(pendingDeleteRef.current);
        supabase.from('cards_collection').delete().in('id', ids);
        ids.forEach(cardId => removeCollectionCard(cardId));
      }
      if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    };
  }, []);

  const totalCards = visibleUserCards.reduce((sum, c) => sum + c.quantity, 0);
  const unfolderedValue = allCards.reduce((sum, c) => sum + effectivePrice(c, currency, usdToClp) * c.quantity, 0);
  const folderedValue = Object.values(folderValues).reduce((a, b) => a + b, 0);
  const totalValue = unfolderedValue + folderedValue;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!selectionMode && (
            <Image source={require('../../../assets/icon.png')} style={styles.headerLogo} />
          )}
          <View>
            <Text style={styles.title}>
              {selectionMode
                ? `${selectedCards.size} seleccionada${selectedCards.size !== 1 ? 's' : ''}`
                : 'Mi Colección'}
            </Text>
            {!selectionMode && (
              <Text style={styles.subtitle}>
                {totalCards} cartas{totalValue > 0 ? (
                  <>{'  ·  '}<Text style={{ color: '#4ADE80' }}>{formatCurrencyValue(totalValue, currency)} {currencyLabel(currency)}</Text></>
                ) : ''}
              </Text>
            )}
          </View>
        </View>
        {selectionMode ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.selAllText}>Todas</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitSelectionMode}>
              <Text style={styles.selCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/collection/add')}>
            <Text style={styles.addBtnText}>+ Agregar</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading || authLoading || !rateReady ? (
        <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />
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
              folders={visibleFolders}
              folderCounts={folderCounts}
              folderValues={folderValues}
              folderGameMap={folderGameMap}
              folderForm={folderForm}
              setFolderForm={setFolderForm}
              saveFolderForm={saveFolderForm}
              handleFolderLongPress={handleFolderLongPress}
              uniqueGames={uniqueGames}
              filterGame={filterGame}
              setFilterGame={setFilterGame}
              currency={currency}
              usdToClp={usdToClp}
              onFolderPress={(id) => router.push({ pathname: '/(tabs)/collection/folder/[id]', params: { id } })}
            />
          }
          renderItem={({ item }) => (
            <CardItem
              card={item}
              onPress={() => handleCardPress(item)}
              onLongPress={() => handleCardLongPress(item)}
              selected={selectedCards.has(item.id)}
              selectionMode={selectionMode}
              currency={currency}
              usdToClp={usdToClp}
            />
          )}
          ListEmptyComponent={allUserCards.length === 0 ? <EmptyCollection onAdd={() => router.push('/(tabs)/collection/add')} /> : null}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: selectionMode ? 96 : 20, gap: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#F1F5F9"
              colors={['#F1F5F9']}
              progressBackgroundColor="#334155"
            />
          }
        />
      )}

      {selectionMode && (
        <View style={styles.selectionActionBar}>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => setBulkFolderOpen(true)}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="folder-outline" size={20} color={selectedCards.size > 0 ? '#F1F5F9' : '#475569'} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Carpeta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => bulkToggleField('is_foil')}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="star-outline" size={20} color={selectedCards.size > 0 ? '#93C5FD' : '#475569'} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Foil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => bulkToggleField('is_for_trade')}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="swap-horizontal-outline" size={20} color={selectedCards.size > 0 ? '#3B82F6' : '#475569'} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Intercambio</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => bulkToggleField('is_for_sale')}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="pricetag-outline" size={20} color={selectedCards.size > 0 ? '#4ADE80' : '#475569'} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Venta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, styles.selActionBtnDanger, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={bulkDelete}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="trash-outline" size={20} color={selectedCards.size > 0 ? '#EF4444' : '#475569'} />
            <Text style={[styles.selActionText, { color: selectedCards.size > 0 ? '#EF4444' : '#475569' }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}

      <CardActionModal
        visible={!!cardActionCard}
        card={cardActionCard}
        currency={currency}
        usdToClp={usdToClp}
        onClose={() => setCardActionCard(null)}
        onViewDetail={() => {
          const id = cardActionCard?.id;
          setCardActionCard(null);
          if (id) router.push(`/(tabs)/collection/${id}`);
        }}
        onFolderPick={() => {
          const card = cardActionCard;
          setCardActionCard(null);
          setTimeout(() => card && setFolderPickerCard(card), 300);
        }}
        onToggleTrade={(value) => cardActionCard && handleToggleField(cardActionCard, 'is_for_trade', value)}
        onToggleSale={(value) => cardActionCard && handleToggleField(cardActionCard, 'is_for_sale', value)}
        onDelete={() => cardActionCard && handleDeleteCard(cardActionCard.id)}
        onStartSelect={() => {
          const card = cardActionCard;
          setCardActionCard(null);
          if (card) {
            setSelectionMode(true);
            setSelectedCards(new Set([card.id]));
          }
        }}
      />

      <FolderPickerModal
        visible={!!folderPickerCard}
        card={folderPickerCard}
        folders={visibleFolders}
        folderGameMap={folderGameMap}
        onSelect={(folderId) => folderPickerCard && assignFolder(folderPickerCard.id, folderId)}
        onClose={() => setFolderPickerCard(null)}
      />

      <FolderPickerModal
        visible={bulkFolderOpen}
        card={null}
        bulkCount={selectedCards.size}
        folders={visibleFolders}
        folderGameMap={folderGameMap}
        onSelect={bulkAssignFolder}
        onClose={() => setBulkFolderOpen(false)}
      />

      <FolderActionModal
        visible={!!folderActionFolder}
        folder={folderActionFolder}
        folderGame={folderActionFolder ? folderGameMap[folderActionFolder.id] ?? null : null}
        folderCount={folderActionFolder ? (folderCounts[folderActionFolder.id] ?? 0) : 0}
        onClose={() => setFolderActionFolder(null)}
        onRename={() => {
          const f = folderActionFolder!;
          setFolderActionFolder(null);
          setFolderForm({ mode: 'rename', id: f.id, name: f.name, color: f.color });
        }}
        onDelete={() => folderActionFolder && deleteFolderConfirmed(folderActionFolder)}
      />

      <UndoSnackbar
        visible={pendingDeleteIds.size > 0}
        message={`${pendingDeleteIds.size} carta${pendingDeleteIds.size !== 1 ? 's' : ''} eliminada${pendingDeleteIds.size !== 1 ? 's' : ''}`}
        onUndo={undoPendingDelete}
      />
    </SafeAreaView>
  );
}

// ─── Card action modal ────────────────────────────────────────────────────────

function CardActionModal({
  visible, card, currency, usdToClp, onClose, onViewDetail, onFolderPick, onToggleTrade, onToggleSale, onDelete, onStartSelect,
}: {
  visible: boolean;
  card: CardCollectionWithPrice | null;
  currency: import('@/types/database').Currency;
  usdToClp: number;
  onClose: () => void;
  onViewDetail: () => void;
  onFolderPick: () => void;
  onToggleTrade: (value: boolean) => void;
  onToggleSale: (value: boolean) => void;
  onDelete: () => void;
  onStartSelect: () => void;
}) {
  if (!card) return null;
  const gameIcon = GAME_ICON[card.game];
  const price = effectivePrice(card, currency, usdToClp);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.actionCardHeader}>
            {card.image_url ? (
              <Image source={{ uri: card.image_url }} style={styles.actionCardThumb} contentFit="contain" />
            ) : (
              <View style={[styles.actionCardThumbPlaceholder, { backgroundColor: gameIcon.color + '22' }]}>
                <Ionicons name={gameIcon.name} size={28} color={gameIcon.color} />
              </View>
            )}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={styles.actionCardName} numberOfLines={2}>{card.card_name}</Text>
              <Text style={styles.actionCardSub} numberOfLines={1}>
                {[card.card_number && `#${card.card_number}`, card.set_name].filter(Boolean).join(' · ')}
              </Text>
              {price > 0 && (
                <Text style={styles.actionCardPrice}>{formatCurrencyValue(price, currency)}</Text>
              )}
            </View>
          </View>

          <View style={styles.actionSeparator} />

          <TouchableOpacity style={styles.actionRow} onPress={onViewDetail}>
            <Ionicons name="expand-outline" size={20} color="#94A3B8" />
            <Text style={styles.actionRowText}>Ver detalle</Text>
            <Ionicons name="chevron-forward-outline" size={16} color="#475569" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={onFolderPick}>
            <Ionicons name="folder-outline" size={20} color="#94A3B8" />
            <Text style={styles.actionRowText}>Mover a carpeta</Text>
            <Ionicons name="chevron-forward-outline" size={16} color="#475569" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <Ionicons name="swap-horizontal-outline" size={20} color="#3B82F6" />
            <Text style={styles.actionRowText}>Para intercambiar</Text>
            <Switch
              value={card.is_for_trade}
              onValueChange={onToggleTrade}
              trackColor={{ true: '#3B82F6' }}
              style={{ marginLeft: 'auto' }}
            />
          </View>
          <View style={styles.actionRow}>
            <Ionicons name="pricetag-outline" size={20} color="#4ADE80" />
            <Text style={styles.actionRowText}>Para vender</Text>
            <Switch
              value={card.is_for_sale}
              onValueChange={onToggleSale}
              trackColor={{ true: '#4ADE80' }}
              style={{ marginLeft: 'auto' }}
            />
          </View>

          <View style={styles.actionSeparator} />

          <TouchableOpacity style={styles.actionRow} onPress={onStartSelect}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#94A3B8" />
            <Text style={styles.actionRowText}>Seleccionar múltiples</Text>
          </TouchableOpacity>

          <View style={styles.actionSeparator} />

          <TouchableOpacity style={styles.actionRow} onPress={onDelete}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[styles.actionRowText, { color: '#EF4444' }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Folder action modal ─────────────────────────────────────────────────────

function FolderActionModal({
  visible, folder, folderGame, folderCount, onClose, onRename, onDelete,
}: {
  visible: boolean;
  folder: CollectionFolder | null;
  folderGame: TCGGame | null;
  folderCount: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  if (!folder) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.actionCardHeader}>
            <FolderIcon game={folderGame} color={folder.color} boxSize={54} iconSize={32} borderRadius={12} />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={styles.actionCardName} numberOfLines={1}>{folder.name}</Text>
              <Text style={styles.actionCardSub}>{folderCount} carta{folderCount !== 1 ? 's' : ''}</Text>
            </View>
          </View>

          <View style={styles.actionSeparator} />

          <TouchableOpacity style={styles.actionRow} onPress={onRename}>
            <Ionicons name="pencil-outline" size={20} color="#94A3B8" />
            <Text style={styles.actionRowText}>Renombrar</Text>
          </TouchableOpacity>

          {!folder.is_default && (
            <>
              <View style={styles.actionSeparator} />
              <TouchableOpacity style={styles.actionRow} onPress={onDelete}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={[styles.actionRowText, { color: '#EF4444' }]}>Eliminar carpeta</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Collection header (scrolls with list) ───────────────────────────────────

function CollectionHeader({
  search, onSearchChange, folders, folderCounts, folderValues, folderGameMap, folderForm, setFolderForm,
  saveFolderForm, handleFolderLongPress, uniqueGames, filterGame, setFilterGame, currency, usdToClp, onFolderPress,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  folders: CollectionFolder[];
  folderCounts: Record<string, number>;
  folderValues: Record<string, number>;
  folderGameMap: Record<string, TCGGame | null>;
  folderForm: FolderForm | null;
  setFolderForm: (f: FolderForm | null) => void;
  saveFolderForm: () => void;
  handleFolderLongPress: (f: CollectionFolder) => void;
  uniqueGames: Set<TCGGame>;
  filterGame: TCGGame | 'all';
  setFilterGame: (g: TCGGame | 'all') => void;
  currency: import('@/types/database').Currency;
  usdToClp: number;
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
          <View style={styles.folderTilesGrid}>
            {folders.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.folderTile, { borderLeftColor: f.color }]}
                onPress={() => onFolderPress(f.id)}
                onLongPress={() => handleFolderLongPress(f)}
                activeOpacity={0.7}
              >
                <FolderIcon game={folderGameMap[f.id] ?? null} color={f.color} boxSize={40} iconSize={24} borderRadius={10} />
                <View style={styles.folderTileInfo}>
                  <Text style={styles.folderTileName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.folderTileCount}>{folderCounts[f.id] ?? 0} cartas</Text>
                  {(folderValues[f.id] ?? 0) > 0 && (
                    <Text style={styles.folderTileValue} numberOfLines={1}>
                      {formatCurrencyValue(folderValues[f.id], currency)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
              {GAME_ICON[g].image
                ? <View style={{ backgroundColor: '#fff', borderRadius: 4, padding: 2 }}>
                    <Image source={GAME_ICON[g].image} style={{ width: 16, height: 16 }} contentFit="contain" />
                  </View>
                : <Ionicons name={GAME_ICON[g].name} size={15} color={filterGame === g ? '#fff' : GAME_ICON[g].color} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Folder picker modal ──────────────────────────────────────────────────────

function FolderPickerModal({
  visible, card, bulkCount, folders, folderGameMap, onSelect, onClose,
}: {
  visible: boolean;
  card: CardCollection | null;
  bulkCount?: number;
  folders: CollectionFolder[];
  folderGameMap: Record<string, TCGGame | null>;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const isBulk = bulkCount != null && bulkCount > 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>
            {isBulk ? `Mover ${bulkCount} carta${bulkCount! > 1 ? 's' : ''}` : 'Mover a carpeta'}
          </Text>
          {!isBulk && card?.folder_id && (
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
              style={[styles.folderRow, !isBulk && card?.folder_id === f.id && styles.folderRowActive]}
              onPress={() => onSelect(f.id)}
            >
              <FolderIcon game={folderGameMap[f.id] ?? null} color={f.color} boxSize={36} iconSize={20} borderRadius={8} />
              <Text style={styles.folderRowName}>{f.name}</Text>
              {!isBulk && card?.folder_id === f.id && (
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

function CardItem({ card, onPress, onLongPress, selected, selectionMode, currency, usdToClp }: {
  card: CardCollectionWithPrice;
  onPress: () => void;
  onLongPress: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  currency?: import('@/types/database').Currency;
  usdToClp?: number;
}) {
  const gameIcon = GAME_ICON[card.game];
  const price = effectivePrice(card, currency ?? 'usd', usdToClp ?? 950);
  return (
    <TouchableOpacity
      style={[styles.thumb, availabilityBorder(card), selected && styles.thumbSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
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
        {price > 0 && <Text style={styles.thumbPrice}>{formatCurrencyValue(price, currency ?? 'usd')}</Text>}
      </View>
      {card.quantity > 1 && (
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>×{card.quantity}</Text>
        </View>
      )}
      {selectionMode && (
        <View style={[styles.selCheckBadge, selected && styles.selCheckBadgeActive]}>
          {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
        </View>
      )}
      {!selectionMode && card.folder_id && (
        <View style={styles.folderBadge}>
          <Ionicons name="folder" size={10} color="#94A3B8" />
        </View>
      )}
      {selected && <View style={styles.thumbSelectedOverlay} pointerEvents="none" />}
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headerLogo: { width: 32, height: 32, borderRadius: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  selAllText: { color: '#6366F1', fontSize: 14, fontWeight: '600' },
  selCancelText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
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

  folderTilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  folderTile: {
    width: FOLDER_TILE_WIDTH,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#334155', borderLeftWidth: 3,
    backgroundColor: '#1E293B', padding: 10, overflow: 'hidden',
  },
  folderTileIconWrap: {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  folderTileInfo: { flex: 1 },
  folderTileName: { color: '#F1F5F9', fontSize: 13, fontWeight: '700' },
  folderTileCount: { color: '#64748B', fontSize: 11, marginTop: 2 },
  folderTileValue: { color: '#4ADE80', fontSize: 12, fontWeight: '700', marginTop: 2 },

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
    borderWidth: 1, borderColor: '#334155', overflow: 'hidden',
  },
  thumbSelected: { borderColor: '#6366F1', borderWidth: 2 },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 8 },
  thumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 8,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  thumbNum: { color: '#64748B', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', flex: 1 },
  thumbPrice: { color: '#4ADE80', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbSelectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#6366F118',
    borderRadius: 12,
  },
  qtyBadge: {
    position: 'absolute', bottom: 28, right: 4,
    backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 5, paddingVertical: 1,
  },
  qtyText: { color: '#94A3B8', fontSize: 9, fontWeight: '700' },
  folderBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#1E293B', borderRadius: 6, borderWidth: 1, borderColor: '#334155',
    padding: 2,
  },
  selCheckBadge: {
    position: 'absolute', top: 4, left: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#0F172A', borderWidth: 1.5, borderColor: '#475569',
    alignItems: 'center', justifyContent: 'center',
  },
  selCheckBadgeActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },

  selectionActionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1E293B', borderTopWidth: 1, borderTopColor: '#334155',
    flexDirection: 'row', padding: 12, paddingBottom: 28, gap: 8,
  },
  selActionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, gap: 4,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
  },
  selActionBtnDanger: { borderColor: '#EF444430' },
  selActionBtnDisabled: { opacity: 0.35 },
  selActionText: { color: '#F1F5F9', fontSize: 11, fontWeight: '600' },
  selActionTextDisabled: { color: '#475569' },

  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#334155',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  modalTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', padding: 16, paddingBottom: 8 },

  actionCardHeader: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  folderActionIcon: { width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionCardThumb: { width: 54, height: 76, borderRadius: 6 },
  actionCardThumbPlaceholder: {
    width: 54, height: 76, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  actionCardName: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  actionCardSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  actionCardPrice: { color: '#4ADE80', fontSize: 13, fontWeight: '600', marginTop: 4 },
  actionSeparator: { height: 1, backgroundColor: '#334155' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  actionRowText: { color: '#F1F5F9', fontSize: 15 },

  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 10,
  },
  folderRowActive: { backgroundColor: '#6366F122' },
  folderRowIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  folderRowName: { color: '#F1F5F9', fontSize: 15 },
  noFoldersText: { color: '#64748B', fontSize: 14, textAlign: 'center', paddingVertical: 16, paddingHorizontal: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  emptyBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
});
