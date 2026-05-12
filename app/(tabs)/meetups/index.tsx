import { useCallback, useState, useMemo, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator,
  Dimensions, ScrollView, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, TCGGame } from '@/types/database';
import { availabilityBorder } from '@/lib/cardStyle';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { REGION_LABEL } from '@/lib/regions';

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
  profiles: { username: string; avatar_url: string | null; regions: string[] | null } | null;
};

type CardGroup = {
  key: string;
  game: TCGGame;
  card_name: string;
  card_number: string | null;
  set_name: string | null;
  image_url: string | null;
  is_foil: boolean;
  listings: ExploreCard[]; // ordenadas por created_at desc
  regionSet: Set<string>;  // unión de regiones de todos los publicadores
};

function groupKey(c: ExploreCard): string {
  if ((c as any).pokemon_card_id) return `pkm:${(c as any).pokemon_card_id}`;
  if ((c as any).magic_card_id) return `mtg:${(c as any).magic_card_id}`;
  return `${c.game}|${c.set_name ?? ''}|${c.card_number ?? ''}|${c.card_name}|${c.is_foil ? 'foil' : 'reg'}`;
}

export default function ExploreScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [allCards, setAllCards] = useState<ExploreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGame, setFilterGame] = useState<TCGGame | 'all'>('all');
  const [onlyMyRegions, setOnlyMyRegions] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CardGroup | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstMount = useRef(true);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select('*, profiles!inner(username, avatar_url, regions)')
      .eq('is_published', true)
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

  const enabledGamesSet = useMemo(() => new Set(resolveEnabledGames(profile?.enabled_games)), [profile?.enabled_games]);
  const myRegions = useMemo(() => new Set(profile?.regions ?? []), [profile?.regions]);
  const visibleAllCards = useMemo(
    () => allCards.filter(c => enabledGamesSet.has(c.game as TCGGame)),
    [allCards, enabledGamesSet],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CardGroup>();
    for (const c of visibleAllCards) {
      const k = groupKey(c);
      let g = map.get(k);
      if (!g) {
        g = {
          key: k,
          game: c.game as TCGGame,
          card_name: c.card_name,
          card_number: c.card_number,
          set_name: c.set_name,
          image_url: c.image_url,
          is_foil: c.is_foil,
          listings: [],
          regionSet: new Set(),
        };
        map.set(k, g);
      }
      g.listings.push(c);
      (c.profiles?.regions ?? []).forEach(r => g.regionSet.add(r));
      if (!g.image_url && c.image_url) g.image_url = c.image_url;
    }
    for (const g of map.values()) {
      g.listings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.listings[0].created_at).getTime() -
        new Date(a.listings[0].created_at).getTime(),
    );
  }, [visibleAllCards]);

  const uniqueGames = useMemo(() => new Set(grouped.map(g => g.game)), [grouped]);

  const cards = useMemo(() => {
    let result = grouped;
    if (filterGame !== 'all') result = result.filter(g => g.game === filterGame);
    if (onlyMyRegions && myRegions.size > 0) {
      result = result.filter(g => Array.from(g.regionSet).some(r => myRegions.has(r)));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.card_name.toLowerCase().includes(q));
    }
    return result;
  }, [grouped, filterGame, onlyMyRegions, myRegions, search]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>
            {allCards.length} carta{allCards.length !== 1 ? 's' : ''} publicada{allCards.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.key}
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
          ListHeaderComponent={
            <ExploreHeader
              search={search}
              onSearchChange={setSearch}
              uniqueGames={uniqueGames}
              filterGame={filterGame}
              setFilterGame={setFilterGame}
              onlyMyRegions={onlyMyRegions}
              setOnlyMyRegions={setOnlyMyRegions}
              hasRegions={myRegions.size > 0}
            />
          }
          renderItem={({ item }) => (
            <CardItem group={item} onPress={() => setSelectedGroup(item)} />
          )}
          ListEmptyComponent={<EmptyExplore />}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366F1" />
          }
        />
      )}

      <CardDetailModal
        group={selectedGroup}
        myRegions={myRegions}
        onClose={() => setSelectedGroup(null)}
        onPropose={(listing) => {
          setSelectedGroup(null);
          router.push({
            pathname: '/(tabs)/encuentros/nueva',
            params: { receiver_id: listing.user_id, card_id: listing.id },
          });
        }}
      />
    </SafeAreaView>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function ExploreHeader({
  search, onSearchChange, uniqueGames, filterGame, setFilterGame,
  onlyMyRegions, setOnlyMyRegions, hasRegions,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  uniqueGames: Set<TCGGame>;
  filterGame: TCGGame | 'all';
  setFilterGame: (g: TCGGame | 'all') => void;
  onlyMyRegions: boolean;
  setOnlyMyRegions: (v: boolean) => void;
  hasRegions: boolean;
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
        {hasRegions && (
          <TouchableOpacity
            style={[styles.filterChip, onlyMyRegions && styles.filterChipActive]}
            onPress={() => setOnlyMyRegions(!onlyMyRegions)}
          >
            <Ionicons name="location-outline" size={15} color={onlyMyRegions ? '#fff' : '#A5B4FC'} />
            <Text style={[styles.filterChipText, onlyMyRegions && styles.filterChipTextActive]}>
              Mis regiones
            </Text>
          </TouchableOpacity>
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

function CardItem({ group, onPress }: { group: CardGroup; onPress: () => void }) {
  const gameIcon = GAME_ICON[group.game];
  const count = group.listings.length;
  return (
    <TouchableOpacity style={[styles.thumb, availabilityBorder({ is_published: true })]} onPress={onPress} activeOpacity={0.7}>
      {group.image_url ? (
        <Image source={{ uri: group.image_url }} style={styles.thumbImg} contentFit="contain" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name={gameIcon.name} size={32} color={gameIcon.color} />
        </View>
      )}
      <View style={styles.thumbFooter}>
        {group.card_number && <Text style={styles.thumbNum}>#{group.card_number}</Text>}
        <Text style={styles.thumbName} numberOfLines={1}>{group.card_name}</Text>
      </View>
      {count > 1 && (
        <View style={styles.countBadge}>
          <Ionicons name="people" size={9} color="#fff" />
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Card detail modal ────────────────────────────────────────────────────────

function CardDetailModal({ group, myRegions, onClose, onPropose }: { group: CardGroup | null; myRegions: Set<string>; onClose: () => void; onPropose: (listing: ExploreCard) => void }) {
  if (!group) return null;
  const gameIcon = GAME_ICON[group.game];

  return (
    <Modal visible={!!group} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalHandle} />

            <View style={styles.modalContent}>
              {group.image_url ? (
                <Image source={{ uri: group.image_url }} style={styles.modalImage} contentFit="contain" />
              ) : (
                <View style={styles.modalImagePlaceholder}>
                  <Ionicons name={gameIcon.name} size={64} color={gameIcon.color} />
                </View>
              )}

              <View style={styles.modalInfo}>
                <View style={styles.modalGameRow}>
                  <Ionicons name={gameIcon.name} size={14} color={gameIcon.color} />
                  <Text style={[styles.modalGameText, { color: gameIcon.color }]}>{GAME_LABELS[group.game]}</Text>
                  {group.card_number && <Text style={styles.modalCardNum}>#{group.card_number}</Text>}
                </View>
                <Text style={styles.modalCardName}>{group.card_name}</Text>
                {group.set_name && <Text style={styles.modalSetName}>{group.set_name}</Text>}
                {group.is_foil && (
                  <View style={styles.badgeFoil}>
                    <Text style={styles.badgeFoilText}>✦ Foil</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.listingsHeader}>
              {group.listings.length === 1 ? '1 publicador' : `${group.listings.length} publicadores`}
            </Text>

            <ScrollView style={styles.listingsScroll} contentContainerStyle={{ gap: 8 }}>
              {group.listings.map(l => {
                const ownerRegions = l.profiles?.regions ?? [];
                const matching = myRegions.size > 0
                  ? ownerRegions.filter(r => myRegions.has(r))
                  : ownerRegions;
                const regionLabel = matching.length > 0
                  ? matching.slice(0, 2).map(r => REGION_LABEL[r] ?? r).join(', ') + (matching.length > 2 ? ` +${matching.length - 2}` : '')
                  : myRegions.size > 0
                    ? 'Otra región'
                    : null;
                return (
                  <View key={l.id} style={styles.listingRow}>
                    <View style={styles.ownerAvatar}>
                      {l.profiles?.avatar_url ? (
                        <Image source={{ uri: l.profiles.avatar_url }} style={styles.ownerAvatarImg} />
                      ) : (
                        <Ionicons name="person-outline" size={18} color="#64748B" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ownerUsername}>@{l.profiles?.username ?? '—'}</Text>
                      <View style={styles.listingMetaRow}>
                        <Text style={styles.listingMeta}>
                          {CONDITION_LABELS[l.condition] ?? l.condition}
                        </Text>
                        {l.price_reference != null && (
                          <>
                            <Text style={styles.listingMetaDot}>·</Text>
                            <Text style={[styles.listingMeta, { color: '#4ADE80' }]}>
                              ${l.price_reference} {(l.price_reference_currency ?? 'usd').toUpperCase()}
                            </Text>
                          </>
                        )}
                        {regionLabel && (
                          <>
                            <Text style={styles.listingMetaDot}>·</Text>
                            <Text style={styles.listingMeta}>{regionLabel}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity style={styles.listingBtn} onPress={() => onPropose(l)}>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
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
      <Text style={styles.emptyText}>Aún no hay cartas publicadas. Vuelve más tarde.</Text>
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
  filterChipLogo: { width: 18, height: 18 },
  filterChipText: { color: '#64748B', fontSize: 13 },
  filterChipTextActive: { color: '#fff' },

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
  ownerBadge: {
    position: 'absolute', bottom: 24, right: 0, left: 0,
    backgroundColor: '#00000066', paddingHorizontal: 4, paddingVertical: 2,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  ownerText: { color: '#94A3B8', fontSize: 8, textAlign: 'center' },
  countBadge: {
    position: 'absolute', top: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#6366F1', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8,
  },
  countText: { color: '#fff', fontSize: 9, fontWeight: '700' },

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
  badgePublished: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4ADE8022', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgePublishedText: { color: '#4ADE80', fontSize: 12, fontWeight: '600' },
  badgePrice: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4ADE8022', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgePriceText: { color: '#4ADE80', fontSize: 12, fontWeight: '600' },
  badgeFoil: {
    backgroundColor: '#A78BFA22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeFoilText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },
  modalMetaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  modalMetaLabel: { color: '#64748B', fontSize: 12, width: 56 },
  modalMetaValue: { color: '#F1F5F9', fontSize: 12, fontWeight: '600' },
  modalNotes: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic', marginTop: 4 },

  listingsHeader: {
    color: '#94A3B8', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  listingsScroll: { maxHeight: 320 },
  listingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0F172A', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#334155',
  },
  ownerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ownerAvatarImg: { width: 40, height: 40 },
  ownerUsername: { color: '#A5B4FC', fontSize: 14, fontWeight: '700' },
  listingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  listingMeta: { color: '#94A3B8', fontSize: 11 },
  listingMetaDot: { color: '#475569', fontSize: 11 },
  listingBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 60 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8 },
});
