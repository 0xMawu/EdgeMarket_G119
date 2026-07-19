// Discover screen - browse active Polymarket prediction markets
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  Pressable, ScrollView, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass, TrendingUp, Droplets, AlertCircle, Pin } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { API_PREFIX } from '../config/api';
import { useWatchlist } from '../hooks/useWatchlist';
import { Badge } from '../components/Badge';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';

const MARKETS_PROXY_URL = `${API_PREFIX}/markets`;
const MARKETS_DIRECT_URL = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=50';
const PINNED_FILTER = '__pinned__';

interface RawMarket {
  id?: string;
  conditionId?: string;
  question: string;
  category?: string;
  tags?: string[];
  events?: { title?: string }[];
  volume24hr?: number;
  volumeNum?: number;
  liquidityNum?: number;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
}

interface Market {
  id: string;
  question: string;
  category: string;
  volume24h: number;
  liquidity: number;
  endDateIso: string | null;
  yesPrice: number;
  noPrice: number;
}

type SortKey = 'volume' | 'liquidity' | 'newest';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'newest', label: 'Newest' },
];

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function daysUntil(isoDate: string | null): string {
  if (!isoDate) return 'No end date';
  const diff = Math.round((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return 'Closed';
  if (diff === 0) return 'Closes today';
  if (diff === 1) return 'Closes tomorrow';
  return `Closes in ${diff}d`;
}

function formatDelta(currentYes: number, firstYes: number): string {
  const diffCents = Math.round((currentYes - firstYes) * 100);
  if (diffCents === 0) return 'flat since pinned';
  return `${diffCents > 0 ? '+' : ''}${diffCents}¢ YES since pinned`;
}

function mapMarket(raw: RawMarket): Market {
  let outcomes: string[] = [];
  let prices: number[] = [];
  try {
    outcomes = raw.outcomes ? JSON.parse(raw.outcomes) : [];
    prices = raw.outcomePrices ? JSON.parse(raw.outcomePrices).map(Number) : [];
  } catch { /* leave defaults */ }
  const yesIdx = outcomes.findIndex((o) => o?.toLowerCase() === 'yes');
  const noIdx = outcomes.findIndex((o) => o?.toLowerCase() === 'no');
  const tag = raw.category ?? raw.tags?.[0] ?? raw.events?.[0]?.title ?? 'Other';
  return {
    id: raw.id ?? raw.conditionId ?? raw.question,
    question: raw.question ?? 'Unknown Market',
    category: tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase(),
    volume24h: raw.volume24hr ?? raw.volumeNum ?? 0,
    liquidity: raw.liquidityNum ?? 0,
    endDateIso: raw.endDate ?? null,
    yesPrice: yesIdx >= 0 ? prices[yesIdx] : prices[0] ?? 0.5,
    noPrice: noIdx >= 0 ? prices[noIdx] : prices[1] ?? 0.5,
  };
}

async function fetchMarkets(): Promise<Market[]> {
  let res: Response;
  try {
    res = await fetch(MARKETS_PROXY_URL);
    if (!res.ok) throw new Error(`proxy ${res.status}`);
  } catch {
    res = await fetch(MARKETS_DIRECT_URL);
    if (!res.ok) throw new Error(`direct API ${res.status}`);
  }
  const json = await res.json();
  const raw: RawMarket[] = Array.isArray(json) ? json : json.data ?? [];
  return raw.filter((m) => m.active !== false && m.closed !== true).map(mapMarket);
}

// Market card sub-component
function MarketCard({
  market, pinned, onTogglePin, pinDelta,
}: {
  market: Market; pinned: boolean; onTogglePin: () => void; pinDelta: string | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const closing = daysUntil(market.endDateIso);
  const closingColor = closing === 'Closed' ? colors.red : closing.includes('today') ? colors.yellow : colors.textMuted;
  const yesPct = Math.round(market.yesPrice * 100);
  const noPct = Math.round(market.noPrice * 100);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {/* category badge */}
        <Badge label={market.category} variant="purple" size="sm" />
        <View style={styles.cardTopRight}>
          <Text style={[styles.closing, { color: closingColor }]}>{closing}</Text>
          <Pressable onPress={onTogglePin} hitSlop={8}>
            <Pin size={15} color={pinned ? colors.yellow : colors.textFainter} fill={pinned ? colors.yellow : 'transparent'} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.question} numberOfLines={3}>{market.question}</Text>
      {/* price bar */}
      <View style={{ marginBottom: 10 }}>
        <View style={[styles.priceBarWrap]}>
          <View style={{ flex: market.yesPrice, height: 6, backgroundColor: colors.green }} />
          <View style={{ flex: market.noPrice, height: 6, backgroundColor: colors.red }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.green, fontSize: 11, fontFamily: fonts.semiBold, fontWeight: '600' }}>YES {yesPct}¢</Text>
          <Text style={{ color: colors.red, fontSize: 11, fontFamily: fonts.semiBold, fontWeight: '600' }}>NO {noPct}¢</Text>
        </View>
      </View>
      {pinned && pinDelta && <Text style={[styles.pinDelta, { color: colors.yellow }]}>{pinDelta}</Text>}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <TrendingUp size={11} color={colors.textFaint} />
          <Text style={styles.statText}>{formatUSD(market.volume24h)} 24h vol</Text>
        </View>
        <View style={styles.statItem}>
          <Droplets size={11} color={colors.textFaint} />
          <Text style={styles.statText}>{formatUSD(market.liquidity)} liq</Text>
        </View>
      </View>
    </View>
  );
}

export function DiscoverScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [allMarkets, setAllMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const { pinnedIds, isPinned, togglePin, getHistory, recordPrices } = useWatchlist();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const markets = await fetchMarkets();
      setAllMarkets(markets);
      recordPrices(markets.map((m) => ({ id: m.id, yesPrice: m.yesPrice })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [recordPrices]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() =>
    Array.from(new Set(allMarkets.map((m) => m.category))).sort(),
    [allMarkets],
  );

  const filtered = useMemo(() => {
    let list = selectedCategory === PINNED_FILTER
      ? allMarkets.filter((m) => pinnedIds.includes(m.id))
      : selectedCategory
      ? allMarkets.filter((m) => m.category === selectedCategory)
      : allMarkets;
    if (sortKey === 'volume') list = [...list].sort((a, b) => b.volume24h - a.volume24h);
    else if (sortKey === 'liquidity') list = [...list].sort((a, b) => b.liquidity - a.liquidity);
    else list = [...list].sort((a, b) => {
      const da = a.endDateIso ? new Date(a.endDateIso).getTime() : 0;
      const db = b.endDateIso ? new Date(b.endDateIso).getTime() : 0;
      return db - da;
    });
    return list;
  }, [allMarkets, selectedCategory, sortKey, pinnedIds]);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Compass size={20} color={colors.purple} />
            <Text style={styles.title}>Discover</Text>
          </View>
          <Text style={styles.subtitle}>{allMarkets.length} active markets</Text>
        </View>

        {!loading && !error && (
          <View style={styles.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable key={opt.key} style={[styles.chip, sortKey === opt.key && styles.chipActive]} onPress={() => setSortKey(opt.key)}>
                  <Text style={[styles.chipText, sortKey === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {pinnedIds.length > 0 && (
                <Pressable
                  style={[styles.chip, styles.pinChip, selectedCategory === PINNED_FILTER && styles.pinChipActive]}
                  onPress={() => setSelectedCategory(selectedCategory === PINNED_FILTER ? null : PINNED_FILTER)}
                >
                  <Pin size={11} color={selectedCategory === PINNED_FILTER ? colors.yellow : colors.textMuted} />
                  <Text style={[styles.chipText, selectedCategory === PINNED_FILTER && { color: colors.yellow }]}> Pinned ({pinnedIds.length})</Text>
                </Pressable>
              )}
              <Pressable style={[styles.chip, selectedCategory === null && styles.chipActive]} onPress={() => setSelectedCategory(null)}>
                <Text style={[styles.chipText, selectedCategory === null && styles.chipTextActive]}>All</Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable key={cat} style={[styles.chip, selectedCategory === cat && styles.chipActive]} onPress={() => setSelectedCategory(cat === selectedCategory ? null : cat)}>
                  <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {loading && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
            <SkeletonLoader width="100%" height={110} />
            <SkeletonLoader width="100%" height={110} />
            <SkeletonLoader width="100%" height={110} />
            <SkeletonLoader width="100%" height={110} />
          </View>
        )}

        {!loading && error && (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load markets"
            subtitle={error}
            action={{ label: 'Try Again', onPress: () => load() }}
          />
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            icon={Compass}
            title={selectedCategory === PINNED_FILTER ? 'No pinned markets yet' : 'No markets found'}
            subtitle={selectedCategory === PINNED_FILTER ? 'Tap the pin icon on a market to track it here' : 'Try a different category or sort'}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const pinned = isPinned(item.id);
              const hist = pinned ? getHistory(item.id) : [];
              const pinDelta = hist.length > 0 ? formatDelta(item.yesPrice, hist[0].yesPrice) : null;
              return <MarketCard market={item} pinned={pinned} onTogglePin={() => togglePin(item.id)} pinDelta={pinDelta} />;
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.bold, fontWeight: '700' },
  subtitle: { color: colors.textFaint, fontSize: 12 },
  filterSection: { paddingBottom: 4 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: 'rgba(168,85,247,0.2)', borderColor: colors.purple },
  chipText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, fontWeight: '500' },
  chipTextActive: { color: colors.purple },
  pinChip: { flexDirection: 'row', alignItems: 'center' },
  pinChipActive: { backgroundColor: 'rgba(250,204,21,0.15)', borderColor: colors.yellow },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 },
  // market card
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  closing: { fontSize: 11 },
  question: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.medium, fontWeight: '500', lineHeight: 18, marginBottom: 12 },
  priceBarWrap: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.cardBorder, marginBottom: 6 },
  pinDelta: { fontSize: 11, fontFamily: fonts.medium, fontWeight: '500', marginTop: -4, marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 16 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: colors.textFaint, fontSize: 11 },
});
