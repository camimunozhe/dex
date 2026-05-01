import { useCallback, useState, useMemo, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, SafeAreaView, ActivityIndicator,
  Dimensions, ScrollView, Modal, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, TCGGame } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3;

const GAME_LABELS: Record<TCGGame, string> = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece',
  digimon: 'Digimon',
  lorcana: 'Lorcana',
  other: 'Otro',
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

const GAME_LOGO: Partial<Record<TCGGame, ReturnType<typeof require>>> = {
  pokemon: require('../../../assets/pokemon-tcg-logo.png'),
  magic: require('../../../assets/magic-tcg-logo.png'),
};

const CONDITION_LABELS: Record<string, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  excellent: 'Excellent',
  good: 'Good',
  played: 'Played',
  poor: 'Poor',
};

type ExploreCard = CardCollection & {
  profiles: { username: string; avatar_url: string | null } | null;
};

export default function ExploreScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [allCards, setAllCards] = useState<ExploreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGame, setFilterGame] = useState<TCGGame | 'all'>('all');
  const [filterType, setFilterType] = useState<'all' | 'trade' | 'sale'>('all');
  const [selectedCard, setSelectedCard] = useState<ExploreCard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstMount = useRef(true);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select('*, profiles(username, avatar_url)')
      .or('is_for_trade.eq.true,is_for_sale.eq.true')
      .neq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAllCards((data as ExploreCard[]) ?? []);
  }, [user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCards();
    setRefreshing(false);
  }, [fetchCards]);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setLoading(true);
      fetchCards().finally(() => setLoading(false));
    }
  }, [fetchCards]));

  const uniqueGames = useMemo(() => new Set(allCards.map(c => c.game as TCGGame)), [allCards]);

  const cards = useMemo(() => {
    let result = allCards;
    if (filterGame !== 'all') result = result.filter(c => c.game === filterGame);
    if (filterType === 'trade') result = result.filter(c => c.is_for_trade);
    if (filterType === 'sale') result = result.filter(c => c.is_for_sale);
    if (search.trim()) result = result.filter(c => c.card_name.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [allCards, filterGame, filterType, search]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>
            {allCards.filter(c => c.is_for_trade).length} para intercambio · {allCards.filter(c => c.is_for_sale).length} en venta
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#6366F1" />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.id}
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
          ListHeaderComponent={
            <ExploreHeader
              search={search}
              onSearchChange={setSearch}
              uniqueGames={uniqueGames}
              filterGame={filterGame}
              setFilterGame={setFilterGame}
              filterType={filterType}
              setFilterType={setFilterType}
            />
          }
          renderItem={({ item }) => (
            <CardItem card={item} onPress={() => setSelectedCard(item)} />
          )}
          ListEmptyComponent={<EmptyExplore />}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366F1" />
          }
        />
      )}

      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onPropose={(card) => {
          setSelectedCard(null);
          router.push({
            pathname: '/(tabs)/encuentros/nueva',
            params: { receiver_id: card.user_id, card_id: card.id },
          });
        }}
      />
    </SafeAreaView>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function ExploreHeader({
  search, onSearchChange, uniqueGames, filterGame, setFilterGame, filterType, setFilterType,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  uniqueGames: Set<TCGGame>;
  filterGame: TCGGame | 'all';
  setFilterGame: (g: TCGGame | 'all') => void;
  filterType: 'all' | 'trade' | 'sale';
  setFilterType: (t: 'all' | 'trade' | 'sale') => void;
}) {
  return (
    <>
      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={onSearchChange}
        placeholder="Buscar carta..."
        placeholderTextColor="#475569"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextActive]}>Todas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterType === 'trade' && styles.filterChipTrade]}
          onPress={() => setFilterType('trade')}
        >
          <Ionicons name="swap-horizontal-outline" size={14} color={filterType === 'trade' ? '#0F172A' : '#22D3EE'} />
          <Text style={[styles.filterChipText, filterType === 'trade' && styles.filterChipTextTrade]}>Intercambio</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterType === 'sale' && styles.filterChipSale]}
          onPress={() => setFilterType('sale')}
        >
          <Ionicons name="pricetag-outline" size={14} color={filterType === 'sale' ? '#0F172A' : '#4ADE80'} />
          <Text style={[styles.filterChipText, filterType === 'sale' && styles.filterChipTextSale]}>Venta</Text>
        </TouchableOpacity>
        {uniqueGames.size > 1 && (
          <View style={styles.filterDivider} />
        )}
        {uniqueGames.size > 1 && (Array.from(uniqueGames) as TCGGame[]).map(g => (
          <TouchableOpacity
            key={g}
            style={[styles.filterChip, filterGame === g && styles.filterChipActive]}
            onPress={() => setFilterGame(filterGame === g ? 'all' : g)}
          >
            {GAME_LOGO[g]
              ? <Image source={GAME_LOGO[g]} style={styles.filterChipLogo} contentFit="contain" />
              : <Ionicons name={GAME_ICON[g].name} size={15} color={filterGame === g ? '#fff' : GAME_ICON[g].color} />
            }
            <Text style={[styles.filterChipText, filterGame === g && styles.filterChipTextActive]}>
              {GAME_LABELS[g]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );
}

// ─── Card item ────────────────────────────────────────────────────────────────

function CardItem({ card, onPress }: { card: ExploreCard; onPress: () => void }) {
  const gameIcon = GAME_ICON[card.game];
  return (
    <TouchableOpacity style={styles.thumb} onPress={onPress} activeOpacity={0.7}>
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
      </View>
      <View style={styles.tagBadge}>
        {card.is_for_trade && <View style={styles.tagDotTrade} />}
        {card.is_for_sale && <View style={styles.tagDotSale} />}
      </View>
      {card.profiles?.username && (
        <View style={styles.ownerBadge}>
          <Text style={styles.ownerText} numberOfLines={1}>@{card.profiles.username}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Card detail modal ────────────────────────────────────────────────────────

function CardDetailModal({ card, onClose, onPropose }: { card: ExploreCard | null; onClose: () => void; onPropose: (card: ExploreCard) => void }) {
  if (!card) return null;
  const gameIcon = GAME_ICON[card.game];

  return (
    <Modal visible={!!card} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <View style={styles.modalContent}>
            {card.image_url ? (
              <Image source={{ uri: card.image_url }} style={styles.modalImage} contentFit="contain" />
            ) : (
              <View style={styles.modalImagePlaceholder}>
                <Ionicons name={gameIcon.name} size={64} color={gameIcon.color} />
              </View>
            )}

            <View style={styles.modalInfo}>
              <View style={styles.modalGameRow}>
                <Ionicons name={gameIcon.name} size={14} color={gameIcon.color} />
                <Text style={[styles.modalGameText, { color: gameIcon.color }]}>{GAME_LABELS[card.game]}</Text>
                {card.card_number && <Text style={styles.modalCardNum}>#{card.card_number}</Text>}
              </View>
              <Text style={styles.modalCardName}>{card.card_name}</Text>
              {card.set_name && <Text style={styles.modalSetName}>{card.set_name}</Text>}

              <View style={styles.modalBadges}>
                {card.is_for_trade && (
                  <View style={styles.badgeTrade}>
                    <Ionicons name="swap-horizontal-outline" size={12} color="#22D3EE" />
                    <Text style={styles.badgeTradeText}>Trade</Text>
                  </View>
                )}
                {card.is_for_sale && (
                  <View style={styles.badgeSale}>
                    <Ionicons name="pricetag-outline" size={12} color="#4ADE80" />
                    <Text style={styles.badgeSaleText}>
                      {card.price_reference ? `$${card.price_reference}` : 'Venta'}
                    </Text>
                  </View>
                )}
                {card.is_foil && (
                  <View style={styles.badgeFoil}>
                    <Text style={styles.badgeFoilText}>✦ Foil</Text>
                  </View>
                )}
              </View>

              <View style={styles.modalMetaRow}>
                <Text style={styles.modalMetaLabel}>Estado</Text>
                <Text style={styles.modalMetaValue}>{CONDITION_LABELS[card.condition] ?? card.condition}</Text>
              </View>
              {card.language && (
                <View style={styles.modalMetaRow}>
                  <Text style={styles.modalMetaLabel}>Idioma</Text>
                  <Text style={styles.modalMetaValue}>{card.language.toUpperCase()}</Text>
                </View>
              )}
              {card.quantity > 1 && (
                <View style={styles.modalMetaRow}>
                  <Text style={styles.modalMetaLabel}>Cantidad</Text>
                  <Text style={styles.modalMetaValue}>×{card.quantity}</Text>
                </View>
              )}
              {card.notes && <Text style={styles.modalNotes}>{card.notes}</Text>}
            </View>
          </View>

          {card.profiles?.username && (
            <View style={styles.ownerRow}>
              <View style={styles.ownerAvatar}>
                {card.profiles.avatar_url ? (
                  <Image source={{ uri: card.profiles.avatar_url }} style={styles.ownerAvatarImg} />
                ) : (
                  <Ionicons name="person-outline" size={18} color="#64748B" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerLabel}>Dueño</Text>
                <Text style={styles.ownerUsername}>@{card.profiles.username}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.proposeBtn} onPress={() => onPropose(card)}>
            <Ionicons name="people-outline" size={18} color="#fff" />
            <Text style={styles.proposeBtnText}>Proponer encuentro</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyExplore() {
  return (
    <View style={styles.empty}>
      <Ionicons name="compass-outline" size={64} color="#334155" style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>Nada por aquí</Text>
      <Text style={styles.emptyText}>Cuando otros coleccionistas marquen cartas para trade o venta, aparecerán aquí</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 20, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },

  searchInput: {
    marginHorizontal: 0, marginBottom: 12,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    borderRadius: 12, padding: 12, fontSize: 14, color: '#F1F5F9',
  },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B',
  },
  filterChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterChipTrade: { backgroundColor: '#22D3EE', borderColor: '#22D3EE' },
  filterChipSale: { backgroundColor: '#4ADE80', borderColor: '#4ADE80' },
  filterChipLogo: { width: 18, height: 18 },
  filterChipText: { color: '#64748B', fontSize: 13 },
  filterChipTextActive: { color: '#fff' },
  filterChipTextTrade: { color: '#0F172A', fontWeight: '600' },
  filterChipTextSale: { color: '#0F172A', fontWeight: '600' },
  filterDivider: { width: 1, backgroundColor: '#334155', marginVertical: 4, marginHorizontal: 2 },

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
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3, width: '100%' },
  thumbNum: { color: '#64748B', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', flexShrink: 1 },
  tagBadge: { position: 'absolute', top: 4, left: 4, flexDirection: 'row', gap: 3 },
  tagDotTrade: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22D3EE' },
  tagDotSale: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  ownerBadge: {
    position: 'absolute', bottom: 24, right: 0, left: 0,
    backgroundColor: '#00000066', paddingHorizontal: 4, paddingVertical: 2,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  ownerText: { color: '#94A3B8', fontSize: 8, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#334155',
    alignSelf: 'center', marginBottom: 16,
  },
  modalContent: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  modalImage: { width: 120, height: 168, borderRadius: 10 },
  modalImagePlaceholder: {
    width: 120, height: 168, borderRadius: 10,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  modalInfo: { flex: 1, gap: 6 },
  modalGameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modalGameText: { fontSize: 12, fontWeight: '600' },
  modalCardNum: { color: '#64748B', fontSize: 12 },
  modalCardName: { fontSize: 18, fontWeight: '800', color: '#F1F5F9', lineHeight: 22 },
  modalSetName: { fontSize: 12, color: '#64748B' },
  modalBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeTrade: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#22D3EE22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeTradeText: { color: '#22D3EE', fontSize: 12, fontWeight: '600' },
  badgeSale: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4ADE8022', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeSaleText: { color: '#4ADE80', fontSize: 12, fontWeight: '600' },
  badgeFoil: {
    backgroundColor: '#A78BFA22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeFoilText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },
  modalMetaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  modalMetaLabel: { color: '#64748B', fontSize: 12, width: 56 },
  modalMetaValue: { color: '#F1F5F9', fontSize: 12, fontWeight: '600' },
  modalNotes: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic', marginTop: 4 },

  ownerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0F172A', borderRadius: 12, padding: 12,
  },
  ownerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ownerAvatarImg: { width: 40, height: 40 },
  ownerLabel: { color: '#64748B', fontSize: 11 },
  ownerUsername: { color: '#A5B4FC', fontSize: 15, fontWeight: '700' },
  proposeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 14, marginTop: 8,
  },
  proposeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 60 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8 },
});
