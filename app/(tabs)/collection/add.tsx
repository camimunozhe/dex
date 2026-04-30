import { useState, useEffect, useRef } from 'react';
import { requestCollectionRefresh } from '@/lib/collectionRefresh';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, SafeAreaView, FlatList, Image,
  ActivityIndicator, Switch, Dimensions,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { TCGGame, CardCondition, CardLanguage } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Types ────────────────────────────────────────────────────────────────────

type PkmSet = {
  id: string;
  name: string;
  series: string;
  total: number;
  release_date: string;
  symbol_url: string;
  logo_url: string;
};

type PkmCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  image_url: string;
  image_url_large: string;
  supertype?: string;
  tcgplayer_normal_market?: number | null;
  tcgplayer_foil_market?: number | null;
};

type MtgSet = {
  code: string;
  name: string;
  set_type: string;
  card_count: number;
  released_at: string;
};

type MtgCard = {
  id: string;
  name: string;
  collector_number: string;
  set: string;
  set_name: string;
  image_url: string;
  image_url_large: string;
};

// ─── Wizard state ─────────────────────────────────────────────────────────────

type Page =
  | { page: 'game' }
  | { page: 'method'; game: TCGGame }
  | { page: 'sets'; game: TCGGame }
  | { page: 'cards-in-set'; game: TCGGame; setId: string; setName: string }
  | { page: 'search-name'; game: TCGGame }
  | { page: 'manual'; game: TCGGame }
  | { page: 'confirm'; game: TCGGame; card: PkmCard };

// ─── Constants ────────────────────────────────────────────────────────────────

const GAMES: { value: TCGGame; label: string; icon: IoniconName; color: string }[] = [
  { value: 'pokemon', label: 'Pokémon', icon: 'flash-outline', color: '#FACC15' },
  { value: 'magic', label: 'Magic', icon: 'color-wand-outline', color: '#A78BFA' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!', icon: 'triangle-outline', color: '#60A5FA' },
  { value: 'onepiece', label: 'One Piece', icon: 'compass-outline', color: '#F87171' },
  { value: 'digimon', label: 'Digimon', icon: 'hardware-chip-outline', color: '#34D399' },
  { value: 'lorcana', label: 'Lorcana', icon: 'flame-outline', color: '#FB923C' },
  { value: 'other', label: 'Otro', icon: 'albums-outline', color: '#94A3B8' },
];

const CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'mint', label: 'Mint' },
  { value: 'near_mint', label: 'Casi Nueva' },
  { value: 'excellent', label: 'Excelente' },
  { value: 'good', label: 'Buena' },
  { value: 'played', label: 'Jugada' },
  { value: 'poor', label: 'Dañada' },
];

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'es', label: 'ES' },
  { value: 'jp', label: 'JP' },
  { value: 'pt', label: 'PT' },
  { value: 'fr', label: 'FR' },
  { value: 'de', label: 'DE' },
  { value: 'it', label: 'IT' },
  { value: 'ko', label: 'KO' },
  { value: 'other', label: 'Otro' },
];

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3; // padding 8*2 + margin 4*2*3

const MTG_SET_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter']);

async function fetchAllMtgCards(setCode: string): Promise<MtgCard[]> {
  const cards: MtgCard[] = [];
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=set:${setCode}+game:paper&order=set&dir=asc`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.object === 'error') break;
    for (const c of json.data) {
      const uris = c.image_uris ?? c.card_faces?.[0]?.image_uris;
      cards.push({
        id: c.id,
        name: c.name,
        collector_number: c.collector_number,
        set: c.set,
        set_name: c.set_name,
        image_url: uris?.normal ?? '',
        image_url_large: uris?.large ?? uris?.normal ?? '',
      });
    }
    url = json.has_more ? json.next_page : null;
  }
  return cards;
}

function getTitle(p: Page): string {
  switch (p.page) {
    case 'game': return 'Agregar carta';
    case 'method': return 'Cómo buscar';
    case 'sets': return 'Elegir set';
    case 'cards-in-set': return p.setName;
    case 'search-name': return 'Buscar por nombre';
    case 'manual': return 'Ingresar manual';
    case 'confirm': return p.card.name;
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type SaveCtx = { total: number; saving: boolean; save: () => void };

export default function AddCardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const [stack, setStack] = useState<Page[]>([{ page: 'game' }]);
  const savedRef = useRef(false);
  const [saveCtx, setSaveCtx] = useState<SaveCtx | null>(null);

  const current = stack[stack.length - 1];
  const inWizard = stack.length > 1;

  // Deshabilita el gesto nativo cuando estamos dentro del wizard.
  // usePreventRemove no es suficiente en native-stack porque el gesto
  // ya remueve la pantalla a nivel nativo antes de que JS pueda actuar.
  useEffect(() => {
    (navigation as any).setOptions({ gestureEnabled: !inWizard });
  }, [navigation, inWizard]);

  // Maneja el botón back de Android (hardware)
  usePreventRemove(inWizard && !savedRef.current, () => {
    setStack(s => s.slice(0, -1));
  });

  function push(page: Page) {
    setStack(s => [...s, page]);
  }

  function pop() {
    if (stack.length <= 1) { router.back(); return; }
    setStack(s => s.slice(0, -1));
  }

  function onSave() {
    savedRef.current = true;
    requestCollectionRefresh();
    router.replace('/(tabs)/collection');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={pop} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#6366F1" />
          <Text style={styles.back}>{stack.length <= 1 ? 'Cancelar' : 'Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{getTitle(current)}</Text>
        {saveCtx ? (
          <TouchableOpacity
            style={[styles.headerSaveBtn, (saveCtx.total === 0 || saveCtx.saving) && styles.headerSaveBtnDisabled]}
            onPress={saveCtx.save}
            disabled={saveCtx.total === 0 || saveCtx.saving}
          >
            {saveCtx.saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.headerSaveBtnText}>
                  {saveCtx.total === 0 ? 'Guardar' : `Guardar ${saveCtx.total}`}
                </Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 90 }} />
        )}
      </View>

      {current.page === 'game' && (
        <GameStep onSelect={(g) => push({ page: 'method', game: g })} />
      )}
      {current.page === 'method' && (
        <MethodStep
          game={current.game}
          onSet={() => push({ page: 'sets', game: current.game })}
          onName={() => push({ page: 'search-name', game: current.game })}
          onManual={() => push({ page: 'manual', game: current.game })}
        />
      )}
      {current.page === 'sets' && (
        <SetsStep
          game={current.game}
          onSelect={(id, name) =>
            push({ page: 'cards-in-set', game: current.game, setId: id, setName: name })
          }
        />
      )}
      {current.page === 'cards-in-set' && (
        <CardsInSetStep
          setId={current.setId}
          game={current.game}
          userId={user!.id}
          onSave={onSave}
          onCtxChange={setSaveCtx}
        />
      )}
      {current.page === 'search-name' && (
        <SearchNameStep
          onSelect={(card) => push({ page: 'confirm', game: current.game, card })}
        />
      )}
      {current.page === 'manual' && (
        <ManualStep game={current.game} userId={user!.id} onSave={onSave} />
      )}
      {current.page === 'confirm' && (
        <ConfirmStep game={current.game} card={current.card} userId={user!.id} onSave={onSave} />
      )}
    </SafeAreaView>
  );
}

// ─── Step: Game ───────────────────────────────────────────────────────────────

function GameStep({ onSelect }: { onSelect: (g: TCGGame) => void }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollPad}>
      <Text style={styles.hint}>¿Qué juego quieres agregar?</Text>
      {GAMES.map((g) => (
        <TouchableOpacity key={g.value} style={styles.bigCard} onPress={() => onSelect(g.value)}>
          <View style={[styles.bigCardIcon, { backgroundColor: g.color + '1A' }]}>
            <Ionicons name={g.icon} size={30} color={g.color} />
          </View>
          <Text style={styles.bigCardLabel}>{g.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#475569" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Step: Method ─────────────────────────────────────────────────────────────

function MethodStep({
  game, onSet, onName, onManual,
}: {
  game: TCGGame;
  onSet: () => void;
  onName: () => void;
  onManual: () => void;
}) {
  const hasSetBrowse = game === 'pokemon' || game === 'magic';
  const hasNameSearch = game === 'pokemon';
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollPad}>
      <Text style={styles.hint}>¿Cómo quieres buscar la carta?</Text>
      {hasSetBrowse ? (
        <>
          <MethodOption icon="albums-outline" label="Por Set" desc="Explora las expansiones y elige una carta del set" onPress={onSet} />
          {hasNameSearch && (
            <MethodOption icon="search-outline" label="Por nombre" desc="Busca directamente por nombre de la carta" onPress={onName} />
          )}
        </>
      ) : (
        <View style={styles.soonBox}>
          <Ionicons name="time-outline" size={36} color="#334155" />
          <Text style={styles.soonTitle}>API próximamente</Text>
          <Text style={styles.soonText}>La búsqueda automática para este juego estará disponible pronto.</Text>
        </View>
      )}
      <MethodOption icon="create-outline" label="Ingresar manual" desc="Escribe los datos de la carta tú mismo" onPress={onManual} muted />
    </ScrollView>
  );
}

function MethodOption({ icon, label, desc, onPress, muted }: {
  icon: IoniconName; label: string; desc: string; onPress: () => void; muted?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.methodCard, muted && styles.methodCardMuted]} onPress={onPress}>
      <View style={[styles.methodIconBox, muted && styles.methodIconBoxMuted]}>
        <Ionicons name={icon} size={24} color={muted ? '#475569' : '#A5B4FC'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.methodLabel, muted && styles.methodLabelMuted]}>{label}</Text>
        <Text style={styles.methodDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#475569" />
    </TouchableOpacity>
  );
}

// ─── Step: Sets ───────────────────────────────────────────────────────────────

function SetsStep({ game, onSelect }: { game: TCGGame; onSelect: (id: string, name: string) => void }) {
  if (game === 'magic') return <MagicSetsStep onSelect={onSelect} />;
  return <PokemonSetsStep onSelect={onSelect} />;
}

function PokemonSetsStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [sets, setSets] = useState<PkmSet[]>([]);
  const [filtered, setFiltered] = useState<PkmSet[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('pokemon_sets')
      .select('id, name, series, total, release_date, symbol_url, logo_url')
      .order('release_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) Alert.alert('Error', 'No se pudo cargar los sets');
        setSets(data ?? []);
        setFiltered(data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered(sets); return; }
    const q = search.toLowerCase();
    setFiltered(sets.filter(s => s.name.toLowerCase().includes(q) || s.series.toLowerCase().includes(q)));
  }, [search, sets]);

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color="#6366F1" />;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBar}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar set o serie..."
        placeholderTextColor="#475569"
      />
      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.setRow} onPress={() => onSelect(item.id, item.name)}>
            <Image source={{ uri: item.symbol_url }} style={styles.setSymbol} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.setName}>{item.name}</Text>
              <Text style={styles.setMeta}>{item.series} · {item.total} cartas</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#475569" />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const MTG_TYPE_LABEL: Record<string, string> = {
  core: 'Core', expansion: 'Expansión', masters: 'Masters',
  draft_innovation: 'Draft', commander: 'Commander', starter: 'Starter',
};

function MagicSetsStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [sets, setSets] = useState<MtgSet[]>([]);
  const [filtered, setFiltered] = useState<MtgSet[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://api.scryfall.com/sets')
      .then(r => r.json())
      .then(json => {
        const relevant = (json.data as MtgSet[])
          .filter(s => MTG_SET_TYPES.has(s.set_type) && s.card_count > 0 && s.released_at)
          .sort((a, b) => b.released_at.localeCompare(a.released_at));
        setSets(relevant);
        setFiltered(relevant);
        setLoading(false);
      })
      .catch(() => { Alert.alert('Error', 'No se pudo cargar los sets de Magic'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered(sets); return; }
    const q = search.toLowerCase();
    setFiltered(sets.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)));
  }, [search, sets]);

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color="#A78BFA" />;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBar}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar set..."
        placeholderTextColor="#475569"
      />
      <FlatList
        data={filtered}
        keyExtractor={s => s.code}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.setRow} onPress={() => onSelect(item.code, item.name)}>
            <View style={styles.mtgSetCode}>
              <Text style={styles.mtgSetCodeText}>{item.code.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.setName}>{item.name}</Text>
              <Text style={styles.setMeta}>
                {MTG_TYPE_LABEL[item.set_type] ?? item.set_type} · {item.card_count} cartas · {item.released_at?.slice(0, 4)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#475569" />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

// ─── Step: Cards in set ───────────────────────────────────────────────────────

type Selection = { card: PkmCard; qty: number };

function CardsInSetStep({ setId, game, userId, onSave, onCtxChange }: {
  setId: string;
  game: TCGGame;
  userId: string;
  onSave: () => void;
  onCtxChange: (ctx: SaveCtx | null) => void;
}) {
  const [cards, setCards] = useState<PkmCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, Selection>>(new Map());
  const [condition, setCondition] = useState<CardCondition>('near_mint');
  const [language, setLanguage] = useState<CardLanguage>('en');
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (game === 'magic') {
      fetchAllMtgCards(setId)
        .then(data => {
          const sorted = data.sort((a, b) => {
            const na = parseInt(a.collector_number, 10);
            const nb = parseInt(b.collector_number, 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return a.collector_number.localeCompare(b.collector_number);
          });
          setCards(sorted.map(c => ({
            id: c.id, name: c.name, number: c.collector_number,
            set_id: c.set, set_name: c.set_name,
            image_url: c.image_url, image_url_large: c.image_url_large,
          })));
          setLoading(false);
        })
        .catch(() => { Alert.alert('Error', 'No se pudo cargar las cartas'); setLoading(false); });
    } else {
      supabase
        .from('pokemon_cards')
        .select('id, name, number, set_id, set_name, image_url, image_url_large, supertype, tcgplayer_normal_market, tcgplayer_foil_market')
        .eq('set_id', setId)
        .then(({ data, error }) => {
          if (error) Alert.alert('Error', 'No se pudo cargar las cartas');
          const sorted = (data ?? []).sort((a, b) => {
            const na = parseInt(a.number, 10);
            const nb = parseInt(b.number, 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return a.number.localeCompare(b.number);
          });
          setCards(sorted);
          setLoading(false);
        });
    }
  }, [setId, game]);

  function tapCard(card: PkmCard) {
    setSelected(prev => {
      const next = new Map(prev);
      const existing = next.get(card.id);
      next.set(card.id, { card, qty: (existing?.qty ?? 0) + 1 });
      return next;
    });
  }

  function removeCard(cardId: string) {
    setSelected(prev => {
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  }

  const totalCards = Array.from(selected.values()).reduce((sum, s) => sum + s.qty, 0);

  saveRef.current = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const rows = Array.from(selected.values()).map(({ card, qty }) => ({
      user_id: userId,
      card_name: card.name,
      game,
      set_name: card.set_name,
      card_number: card.number,
      quantity: qty,
      condition,
      language,
      is_foil: false,
      is_for_trade: false,
      is_for_sale: false,
      price_reference: null,
      image_url: card.image_url_large ?? card.image_url ?? null,
      pokemon_card_id: game === 'pokemon' ? card.id : null,
    }));
    const { error } = await supabase.from('cards_collection').insert(rows);
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else onSave();
  };

  useEffect(() => {
    onCtxChange({ total: totalCards, saving, save: () => saveRef.current() });
  }, [totalCards, saving]);

  useEffect(() => {
    return () => onCtxChange(null);
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color="#6366F1" />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={cards}
        keyExtractor={c => c.id}
        numColumns={3}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        renderItem={({ item }) => {
          const sel = selected.get(item.id);
          const qty = sel?.qty ?? 0;
          return (
            <TouchableOpacity
              style={[styles.thumb, qty > 0 && styles.thumbSelected]}
              onPress={() => tapCard(item)}
              activeOpacity={0.7}
            >
              <Image source={{ uri: item.image_url }} style={styles.thumbImg} resizeMode="contain" />
              <View style={styles.thumbFooter}>
                <Text style={styles.thumbNum}>#{item.number}</Text>
                <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
                {(() => { const p = item.tcgplayer_normal_market ?? item.tcgplayer_foil_market; return p ? <Text style={styles.thumbPrice}>${p % 1 === 0 ? p : p.toFixed(2)}</Text> : null; })()}
              </View>
              {qty > 0 && (
                <TouchableOpacity style={styles.qtyBadge} onPress={() => removeCard(item.id)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                  <Text style={styles.qtyText}>{qty}</Text>
                  <Ionicons name="close-circle" size={11} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: 8, paddingBottom: 8 }}
      />

      {/* Bottom panel */}
      <View style={styles.setBottomPanel}>
        <View style={styles.setBottomRow}>
          <Text style={styles.setBottomLabel}>Condición</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c.value}
                style={[styles.miniChip, condition === c.value && styles.miniChipActive]}
                onPress={() => setCondition(c.value)}
              >
                <Text style={[styles.miniChipText, condition === c.value && styles.miniChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.setBottomRow}>
          <Text style={styles.setBottomLabel}>Idioma</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.value}
                style={[styles.miniChip, language === l.value && styles.miniChipActive]}
                onPress={() => setLanguage(l.value)}
              >
                <Text style={[styles.miniChipText, language === l.value && styles.miniChipTextActive]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

// ─── Step: Search by name ─────────────────────────────────────────────────────

function SearchNameStep({ onSelect }: { onSelect: (c: PkmCard) => void }) {
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<PkmCard[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { setCards([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, set_id, set_name, image_url, image_url_large, supertype')
        .ilike('name', `%${query.trim()}%`)
        .order('name')
        .limit(60);
      if (error) Alert.alert('Error', 'No se pudo realizar la búsqueda');
      setCards(data ?? []);
      setLoading(false);
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBar}
        value={query}
        onChangeText={setQuery}
        placeholder="Ej: Charizard, Pikachu..."
        placeholderTextColor="#475569"
        autoFocus
      />
      {loading && <ActivityIndicator style={{ marginTop: 24 }} color="#6366F1" />}
      {!loading && (
        <FlatList
          data={cards}
          keyExtractor={c => c.id}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.thumb} onPress={() => onSelect(item)}>
              <Image source={{ uri: item.image_url }} style={styles.thumbImg} resizeMode="contain" />
              <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.thumbNum} numberOfLines={1}>{item.set_name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchText}>Sin resultados para "{query}"</Text>
              </View>
            ) : (
              <View style={styles.emptySearch}>
                <Ionicons name="search-outline" size={40} color="#334155" />
                <Text style={styles.emptySearchText}>Escribe el nombre del Pokémon</Text>
              </View>
            )
          }
          contentContainerStyle={{ padding: 8, paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

// ─── Step: Manual entry ───────────────────────────────────────────────────────

function ManualStep({ game, userId, onSave }: { game: TCGGame; userId: string; onSave: () => void }) {
  const [cardName, setCardName] = useState('');
  const [setName, setSetName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [condition, setCondition] = useState<CardCondition>('near_mint');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [isFoil, setIsFoil] = useState(false);
  const [isForTrade, setIsForTrade] = useState(false);
  const [isForSale, setIsForSale] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!cardName.trim()) { Alert.alert('Error', 'El nombre de la carta es requerido'); return; }
    setSaving(true);
    const { error } = await supabase.from('cards_collection').insert({
      user_id: userId,
      card_name: cardName.trim(),
      game,
      set_name: setName.trim() || null,
      card_number: cardNumber.trim() || null,
      quantity: parseInt(quantity) || 1,
      condition,
      is_foil: isFoil,
      is_for_trade: isForTrade,
      is_for_sale: isForSale,
      price_reference: price ? parseFloat(price) : null,
    });
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else onSave();
  }

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Nombre de la carta *</Text>
        <TextInput style={styles.input} value={cardName} onChangeText={setCardName} placeholder="Ej: Charizard ex" placeholderTextColor="#475569" />
      </View>
      <View style={styles.rowInputs}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Set / Edición</Text>
          <TextInput style={styles.input} value={setName} onChangeText={setSetName} placeholder="Stellar Crown" placeholderTextColor="#475569" />
        </View>
        <View style={{ width: 100 }}>
          <Text style={styles.fieldLabel}>Número</Text>
          <TextInput style={styles.input} value={cardNumber} onChangeText={setCardNumber} placeholder="006/142" placeholderTextColor="#475569" />
        </View>
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Condición</Text>
        <View style={styles.chips}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity key={c.value} style={[styles.chip, condition === c.value && styles.chipActive]} onPress={() => setCondition(c.value)}>
              <Text style={[styles.chipText, condition === c.value && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.rowInputs}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Cantidad</Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="1" placeholderTextColor="#475569" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Precio ref. (USD)</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#475569" />
        </View>
      </View>
      <View style={styles.switches}>
        <SwitchRow icon="star-outline" label="Foil / Holo" value={isFoil} onChange={setIsFoil} />
        <SwitchRow icon="swap-horizontal-outline" label="Disponible para trade" value={isForTrade} onChange={setIsForTrade} />
        <SwitchRow icon="pricetag-outline" label="En venta" value={isForSale} onChange={setIsForSale} last />
      </View>
      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Guardar en colección</Text>}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Step: Confirm (after API card selection) ─────────────────────────────────

function ConfirmStep({ game, card, userId, onSave }: {
  game: TCGGame; card: PkmCard; userId: string; onSave: () => void;
}) {
  const [condition, setCondition] = useState<CardCondition>('near_mint');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [isFoil, setIsFoil] = useState(false);
  const [isForTrade, setIsForTrade] = useState(false);
  const [isForSale, setIsForSale] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from('cards_collection').insert({
      user_id: userId,
      card_name: card.name,
      game,
      set_name: card.set_name,
      card_number: card.number,
      quantity: parseInt(quantity) || 1,
      condition,
      is_foil: isFoil,
      is_for_trade: isForTrade,
      is_for_sale: isForSale,
      price_reference: price ? parseFloat(price) : null,
      image_url: card.image_url_large ?? card.image_url ?? null,
      pokemon_card_id: card.id,
    });
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else onSave();
  }

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.cardPreview}>
        <Image source={{ uri: card.image_url_large ?? card.image_url }} style={styles.cardPreviewImg} resizeMode="contain" />
        <Text style={styles.previewName}>{card.name}</Text>
        <Text style={styles.previewMeta}>{card.set_name} · #{card.number}</Text>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Condición</Text>
        <View style={styles.chips}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity key={c.value} style={[styles.chip, condition === c.value && styles.chipActive]} onPress={() => setCondition(c.value)}>
              <Text style={[styles.chipText, condition === c.value && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.rowInputs}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Cantidad</Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="1" placeholderTextColor="#475569" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Precio ref. (USD)</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#475569" />
        </View>
      </View>

      <View style={styles.switches}>
        <SwitchRow icon="star-outline" label="Foil / Holo" value={isFoil} onChange={setIsFoil} />
        <SwitchRow icon="swap-horizontal-outline" label="Disponible para trade" value={isForTrade} onChange={setIsForTrade} />
        <SwitchRow icon="pricetag-outline" label="En venta" value={isForSale} onChange={setIsForSale} last />
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Guardar en colección</Text>}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── SwitchRow ────────────────────────────────────────────────────────────────

function SwitchRow({ icon, label, value, onChange, last }: {
  icon: IoniconName; label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <View style={[styles.switchRow, last && styles.switchRowLast]}>
      <View style={styles.switchLabelRow}>
        <Ionicons name={icon} size={16} color="#94A3B8" />
        <Text style={styles.switchLabel}>{label}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#6366F1' }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 90 },
  back: { color: '#6366F1', fontSize: 15 },
  title: { flex: 1, color: '#F1F5F9', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerSaveBtn: {
    backgroundColor: '#6366F1', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, width: 90, alignItems: 'center',
  },
  headerSaveBtnDisabled: { opacity: 0.4 },
  headerSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollPad: { padding: 16 },
  hint: { color: '#94A3B8', fontSize: 14, marginBottom: 16 },

  // Game step
  bigCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#334155',
  },
  bigCardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bigCardLabel: { flex: 1, color: '#F1F5F9', fontSize: 16, fontWeight: '700' },

  // Method step
  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#334155',
  },
  methodCardMuted: { backgroundColor: '#141E2E', borderColor: '#1E293B' },
  methodIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#1E1E4A', alignItems: 'center', justifyContent: 'center' },
  methodIconBoxMuted: { backgroundColor: '#1E293B' },
  methodLabel: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  methodLabelMuted: { color: '#475569' },
  methodDesc: { color: '#64748B', fontSize: 13, marginTop: 2 },

  soonBox: { alignItems: 'center', padding: 24, gap: 8, marginBottom: 16, backgroundColor: '#1E293B', borderRadius: 12 },
  soonTitle: { color: '#64748B', fontSize: 16, fontWeight: '700' },
  soonText: { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Search bar (shared)
  searchBar: {
    margin: 12, marginBottom: 8,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    borderRadius: 12, padding: 12, fontSize: 14, color: '#F1F5F9',
  },

  // Sets step
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  setSymbol: { width: 36, height: 36 },
  mtgSetCode: {
    width: 44, height: 36, borderRadius: 8,
    backgroundColor: '#1E1E4A', alignItems: 'center', justifyContent: 'center',
  },
  mtgSetCodeText: { color: '#A78BFA', fontSize: 11, fontWeight: '800' },
  setName: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
  setMeta: { color: '#64748B', fontSize: 12, marginTop: 1 },

  // Card thumbnails grid
  thumb: {
    width: CARD_WIDTH, margin: 4, alignItems: 'center',
    backgroundColor: '#1E293B', borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: '#334155',
  },
  thumbSelected: {
    borderColor: '#6366F1', borderWidth: 2, backgroundColor: '#1e1e4a',
  },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  thumbNum: { color: '#64748B', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', flex: 1 },
  thumbPrice: { color: '#4ADE80', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  qtyBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#6366F1', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  qtyText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Set bottom panel
  setBottomPanel: {
    borderTopWidth: 1, borderTopColor: '#334155',
    backgroundColor: '#0F172A', padding: 12, gap: 10,
  },
  setBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setBottomLabel: { color: '#64748B', fontSize: 11, fontWeight: '600', width: 62 },
  miniChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#334155',
    backgroundColor: '#1E293B',
  },
  miniChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  miniChipText: { color: '#64748B', fontSize: 12 },
  miniChipTextActive: { color: '#fff', fontWeight: '600' },
  foilToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1,
    borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  foilToggleText: { color: '#64748B', fontSize: 13, fontWeight: '600', flex: 1 },
  foilToggleTextActive: { color: '#FACC15' },
  foilToggleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155' },
  foilToggleDotActive: { backgroundColor: '#FACC15' },

  emptySearch: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 10 },
  emptySearchText: { color: '#64748B', fontSize: 14 },

  // Confirm step
  cardPreview: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 32 },
  cardPreviewImg: { width: 200, height: 280, borderRadius: 12 },
  previewName: { color: '#F1F5F9', fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  previewMeta: { color: '#64748B', fontSize: 13, marginTop: 4 },

  // Shared form elements
  fieldBlock: { paddingHorizontal: 16, marginBottom: 16 },
  fieldLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B' },
  chipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { color: '#64748B', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  rowInputs: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 16 },
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, fontSize: 14, color: '#F1F5F9' },
  switches: { marginHorizontal: 16, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  switchRowLast: { borderBottomWidth: 0 },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: '#F1F5F9', fontSize: 14 },
  saveBtn: { marginHorizontal: 16, backgroundColor: '#6366F1', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
