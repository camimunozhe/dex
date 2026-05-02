import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator, Modal, FlatList,
  TextInput, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { requestCollectionRefresh } from '@/lib/collectionRefresh';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CardCollection, CollectionFolder, TCGGame } from '@/types/database';
import { formatPrice, currencyLabel } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { validateFolderGame, gameLabel } from '@/lib/folderValidation';

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
  mint: 'Nueva', near_mint: 'Casi Nueva', excellent: 'Excelente',
  good: 'Buena', played: 'Jugada', poor: 'Dañada',
};

const CONDITIONS: { value: import('@/types/database').CardCondition; label: string }[] = [
  { value: 'mint', label: 'Nueva' },
  { value: 'near_mint', label: 'Casi Nueva' },
  { value: 'excellent', label: 'Excelente' },
  { value: 'good', label: 'Buena' },
  { value: 'played', label: 'Jugada' },
  { value: 'poor', label: 'Dañada' },
];

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const currency = profile?.currency ?? 'usd';
  const router = useRouter();
  type CardWithPrice = CardCollection & {
    pokemon_cards?: { tcgplayer_normal_market: number | null; tcgplayer_foil_market: number | null } | null;
  };
  const [card, setCard] = useState<CardWithPrice | null>(null);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);
  const [usdToClp, setUsdToClp] = useState<number | null>(null);

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
    const tasks: Promise<unknown>[] = [
      supabase.from('cards_collection')
        .select('*, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market)')
        .eq('id', id).single()
        .then(({ data }) => setCard(data as CardWithPrice)),
      fetchFolders(),
    ];
    if (currency === 'clp') tasks.push(getUsdToClp().then(setUsdToClp));
    Promise.all(tasks).finally(() => setLoading(false));
  }, [id, fetchFolders, currency]);

  // Initialize price input — price_reference is stored in user's currency, no conversion needed
  useEffect(() => {
    if (!card) return;
    const val = card.price_reference;
    if (val == null) { setPriceInput(''); return; }
    setPriceInput(currency === 'clp'
      ? String(Math.round(val))
      : (val % 1 === 0 ? String(val) : val.toFixed(2)));
  }, [card?.id, currency]);

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

  async function toggleField(field: 'is_for_trade' | 'is_for_sale', value: boolean) {
    await supabase.from('cards_collection').update({ [field]: value }).eq('id', id);
    setCard(c => c ? { ...c, [field]: value } : c);
    requestCollectionRefresh();
  }

  async function savePrice() {
    setPriceSaving(true);
    const inputNum = priceInput.trim() ? parseFloat(priceInput) : null;
    const storeVal = inputNum !== null && !isNaN(inputNum) ? inputNum : null;
    await supabase.from('cards_collection').update({ price_reference: storeVal }).eq('id', id);
    setCard(c => c ? { ...c, price_reference: storeVal } : c);
    requestCollectionRefresh();
    setPriceSaving(false);
  }

  async function clearToMarketPrice() {
    setPriceInput('');
    setPriceSaving(true);
    await supabase.from('cards_collection').update({ price_reference: null }).eq('id', id);
    setCard(c => c ? { ...c, price_reference: null } : c);
    requestCollectionRefresh();
    setPriceSaving(false);
  }

  async function saveCondition(condition: import('@/types/database').CardCondition) {
    await supabase.from('cards_collection').update({ condition }).eq('id', id);
    setCard(c => c ? { ...c, condition } : c);
    setShowConditionPicker(false);
  }

  async function assignFolder(folderId: string | null) {
    if (folderId && card) {
      const check = await validateFolderGame(folderId, [card.game]);
      if (!check.ok) {
        Alert.alert('Carpeta de otro juego', `Esta carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.`);
        return;
      }
    }
    await supabase.from('cards_collection').update({ folder_id: folderId }).eq('id', id);
    setCard(c => c ? { ...c, folder_id: folderId } : c);
    setShowFolderPicker(false);
  }

  if (loading || authLoading) return <ActivityIndicator style={{ flex: 1 }} color="#6366F1" />;
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
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          {card.image_url ? (
            <Image source={{ uri: card.image_url }} style={styles.heroImage} contentFit="contain" />
          ) : (
            <Ionicons name={gameIcon.name} size={72} color={gameIcon.color} style={styles.heroIcon} />
          )}
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
          <TouchableOpacity style={styles.detailRow} onPress={() => setShowConditionPicker(true)}>
            <Text style={styles.detailLabel}>Condición</Text>
            <View style={styles.folderValue}>
              <Text style={styles.detailValue}>{CONDITION_LABELS[card.condition]}</Text>
              <Ionicons name="chevron-forward-outline" size={14} color="#475569" />
            </View>
          </TouchableOpacity>
          <DetailRow label="Cantidad" value={String(card.quantity)} />
          {(() => {
            const p = card.pokemon_cards;
            const marketPrice = p
              ? (card.is_foil
                ? (p.tcgplayer_foil_market ?? p.tcgplayer_normal_market)
                : (p.tcgplayer_normal_market ?? p.tcgplayer_foil_market))
              : null;
            return (
              <View style={styles.priceBlock}>
                {marketPrice != null && (
                  <View style={styles.marketRow}>
                    <Text style={styles.detailLabel}>Precio mercado</Text>
                    <Text style={styles.marketValue}>
                      {formatPrice(marketPrice, currency, usdToClp ?? 950)} {currencyLabel(currency)}
                    </Text>
                  </View>
                )}
                <View style={styles.myPriceRow}>
                  <Text style={styles.detailLabel}>Tu precio ({currencyLabel(currency)})</Text>
                  <View style={styles.myPriceInputRow}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={priceInput}
                      onChangeText={setPriceInput}
                      keyboardType="decimal-pad"
                      placeholder={marketPrice != null
                        ? (currency === 'clp'
                            ? String(Math.round(marketPrice * (usdToClp ?? 950)))
                            : (marketPrice % 1 === 0 ? String(marketPrice) : marketPrice.toFixed(2)))
                        : (currency === 'clp' ? '0' : '0.00')}
                      placeholderTextColor="#475569"
                      returnKeyType="done"
                      onSubmitEditing={savePrice}
                      selectionColor="#6366F1"
                      underlineColorAndroid="transparent"
                    />
                    <TouchableOpacity onPress={savePrice} disabled={priceSaving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {priceSaving
                        ? <ActivityIndicator size="small" color="#6366F1" />
                        : <Ionicons name="checkmark-circle-outline" size={22} color="#6366F1" />}
                    </TouchableOpacity>
                  </View>
                </View>
                {marketPrice != null && card.price_reference != null && (
                  <TouchableOpacity style={styles.useMarketRow} onPress={clearToMarketPrice}>
                    <Ionicons name="trending-up-outline" size={13} color="#6366F1" />
                    <Text style={styles.useMarketText}>Usar precio de mercado</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
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

        <View style={styles.switches}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelRow}>
              <Ionicons name="swap-horizontal-outline" size={16} color="#22D3EE" />
              <Text style={styles.switchLabel}>Para intercambiar</Text>
            </View>
            <Switch
              value={card.is_for_trade}
              onValueChange={v => toggleField('is_for_trade', v)}
              trackColor={{ true: '#22D3EE' }}
            />
          </View>
          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchLabelRow}>
              <Ionicons name="pricetag-outline" size={16} color="#4ADE80" />
              <Text style={styles.switchLabel}>Para vender</Text>
            </View>
            <Switch
              value={card.is_for_sale}
              onValueChange={v => toggleField('is_for_sale', v)}
              trackColor={{ true: '#4ADE80' }}
            />
          </View>
        </View>

        {card.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notas</Text>
            <Text style={styles.notesText}>{card.notes}</Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showConditionPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowConditionPicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Condición</Text>
            <FlatList
              data={CONDITIONS}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.folderOption, card.condition === item.value && styles.folderOptionActive]}
                  onPress={() => saveCondition(item.value)}
                >
                  <Text style={styles.folderOptionText}>{item.label}</Text>
                  {card.condition === item.value && (
                    <Ionicons name="checkmark-outline" size={18} color="#6366F1" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

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
  heroImage: { width: 180, height: 252, borderRadius: 10, marginBottom: 16 },
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
  priceBlock: { borderBottomWidth: 1, borderBottomColor: '#334155' },
  marketRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E3A2F',
  },
  marketValue: { color: '#4ADE80', fontSize: 14, fontWeight: '600' },
  myPriceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  myPriceInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencySymbol: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  priceInput: {
    color: '#F1F5F9', fontSize: 14, fontWeight: '600',
    width: 110, textAlign: 'right', paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#334155',
  },
  useMarketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  useMarketText: { color: '#6366F1', fontSize: 12, fontWeight: '600' },
  folderValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderDot: { width: 8, height: 8, borderRadius: 4 },
  switches: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  switchRowLast: { borderBottomWidth: 0 },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: '#F1F5F9', fontSize: 14 },
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
