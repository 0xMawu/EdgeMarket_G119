// Signal Feed - shows live trades from wallets the user follows, updated every 60s
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  Pressable, ScrollView, TextInput, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Zap, Copy, Search, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useFollowing } from '../hooks/useFollowing';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/Badge';

const POLL_INTERVAL_MS = 60 * 1000;

type OutcomeFilter = 'ALL' | 'YES' | 'NO';

const MIN_SIZE_OPTIONS: { key: number; label: string }[] = [
  { key: 0,    label: 'Any size' },
  { key: 100,  label: '$100+' },
  { key: 500,  label: '$500+' },
  { key: 1000, label: '$1k+' },
  { key: 5000, label: '$5k+' },
];

interface RawTrade {
  transactionHash?: string;
  proxyWallet: string;
  outcome: string;
  size: number;
  price: number;
  timestamp: number;
  title?: string;
  eventSlug?: string;
  side?: string;
}

interface Trade {
  id: string;
  makerAddress: string;
  marketName: string;
  side: 'YES' | 'NO';
  sizeUSDC: number;
  timestamp: number;
  eventSlug: string;
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function fetchTradesForAddress(address: string): Promise<Trade[]> {
  try {
    const res = await fetch(`https://data-api.polymarket.com/trades?user=${address}&limit=50`);
    if (!res.ok) return [];
    const json: RawTrade[] = await res.json();
    if (!Array.isArray(json)) return [];
    return json.map((t) => ({
      id: t.transactionHash ?? `${address}-${t.timestamp}`,
      makerAddress: t.proxyWallet ?? address,
      marketName: t.title ?? 'Unknown Market',
      side: t.outcome?.toLowerCase() === 'no' ? 'NO' : 'YES',
      sizeUSDC: (t.size ?? 0) * (t.price ?? 0),
      timestamp: t.timestamp,
      eventSlug: t.eventSlug ?? '',
    }));
  } catch {
    return [];
  }
}

// Single trade card
function TradeCard({ trade, onCopy }: { trade: Trade; onCopy: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.tradeCard}>
      <View style={styles.tradeHeaderRow}>
        <View style={styles.tradeAddressWrap}>
          <Text style={styles.tradeAddress}>{shortAddress(trade.makerAddress)}</Text>
        </View>
        <Text style={styles.tradeTime}>{timeAgo(trade.timestamp)}</Text>
      </View>
      <Text style={styles.tradeMarket} numberOfLines={2}>{trade.marketName}</Text>
      <View style={styles.tradeFooterRow}>
        <Badge label={trade.side} variant={trade.side === 'YES' ? 'success' : 'danger'} size="sm" />
        <Text style={[styles.tradeSize, { color: colors.textMuted }]}>
          ${trade.sizeUSDC.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC
        </Text>
        <Pressable onPress={onCopy} style={styles.copyBtn} hitSlop={8}>
          <Copy size={13} color={colors.purple} />
          <Text style={[styles.copyText, { color: colors.purple }]}>Copy Trade</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SignalFeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { followingIds } = useFollowing();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL');
  const [minSize, setMinSize] = useState<number>(0);
  const [marketQuery, setMarketQuery] = useState('');

  const fetchAll = useCallback(async () => {
    if (followingIds.length === 0) { setTrades([]); return; }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(followingIds.map(fetchTradesForAddress));
      setTrades(results.flat().sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  }, [followingIds]);

  // keep a ref so the polling interval picks up the latest following list without restarting
  const followingIdsRef = useRef(followingIds);
  useEffect(() => { followingIdsRef.current = followingIds; }, [followingIds]);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(async () => {
      if (followingIdsRef.current.length === 0) { setTrades([]); return; }
      try {
        const results = await Promise.all(followingIdsRef.current.map(fetchTradesForAddress));
        setTrades(results.flat().sort((a, b) => b.timestamp - a.timestamp));
      } catch { /* silent — keep last data */ }
    }, POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = useCallback(async (trade: Trade) => {
    const url = trade.eventSlug ? `https://polymarket.com/event/${trade.eventSlug}` : 'https://polymarket.com';
    await Clipboard.setStringAsync(url);
  }, []);

  const filteredTrades = useMemo(() => trades.filter((t) => {
    if (outcomeFilter !== 'ALL' && t.side !== outcomeFilter) return false;
    if (t.sizeUSDC < minSize) return false;
    if (marketQuery && !t.marketName.toLowerCase().includes(marketQuery.toLowerCase())) return false;
    return true;
  }), [trades, outcomeFilter, minSize, marketQuery]);

  const gradient = [colors.gradientStart, colors.gradientMid, colors.gradientEnd] as const;

  if (loading && trades.length === 0) {
    return (
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.title}>Signal Feed</Text>
            <Text style={styles.subtitle}>Live trades from followed wallets</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
            <SkeletonLoader width="100%" height={90} />
            <SkeletonLoader width="100%" height={90} />
            <SkeletonLoader width="100%" height={90} />
            <SkeletonLoader width="100%" height={90} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!loading && followingIds.length === 0) {
    return (
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.title}>Signal Feed</Text>
            <Text style={styles.subtitle}>Live trades from followed wallets</Text>
          </View>
          <EmptyState icon={Zap} title="No signals yet" subtitle="Follow traders to see their signals here." />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}><Text style={styles.title}>Signal Feed</Text></View>
          <EmptyState icon={AlertCircle} title="Failed to load signals" subtitle={error ?? undefined} action={{ label: 'Try Again', onPress: fetchAll }} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={filteredTrades}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <Text style={styles.title}>Signal Feed</Text>
                <Text style={styles.subtitle}>
                  {filteredTrades.length} signal{filteredTrades.length !== 1 ? 's' : ''}
                  {filteredTrades.length !== trades.length ? ` (of ${trades.length})` : ''} · updates every 60s
                </Text>
              </View>
              <View style={styles.filterSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {(['ALL', 'YES', 'NO'] as OutcomeFilter[]).map((opt) => (
                    <Pressable key={opt} style={[styles.chip, outcomeFilter === opt && styles.chipActive]} onPress={() => setOutcomeFilter(opt)}>
                      <Text style={[styles.chipText, outcomeFilter === opt && styles.chipTextActive]}>{opt === 'ALL' ? 'All Outcomes' : opt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {MIN_SIZE_OPTIONS.map((opt) => (
                    <Pressable key={opt.key} style={[styles.chip, minSize === opt.key && styles.chipActive]} onPress={() => setMinSize(opt.key)}>
                      <Text style={[styles.chipText, minSize === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.searchWrap}>
                  <Search size={14} color={colors.textFaint} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Filter by market name..."
                    placeholderTextColor={colors.textFainter}
                    value={marketQuery}
                    onChangeText={setMarketQuery}
                  />
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState icon={Search} title="No matching signals" subtitle="Try adjusting your filters." />}
          renderItem={({ item }) => <TradeCard trade={item} onCopy={() => handleCopy(item)} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={colors.purple} />}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, marginBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 24, fontFamily: fonts.semiBold, fontWeight: '600', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  filterSection: { paddingBottom: 8 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  chipActive: { backgroundColor: 'rgba(168,85,247,0.2)', borderColor: colors.purple },
  chipText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, fontWeight: '500' },
  chipTextActive: { color: colors.purple },
  searchWrap: { marginHorizontal: 16, marginTop: 6, marginBottom: 4, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  searchInput: {
    paddingLeft: 38, paddingRight: 14, paddingVertical: 10,
    borderRadius: 14, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
    color: colors.textPrimary, fontSize: 13,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  // trade card
  tradeCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14, marginBottom: 10 },
  tradeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tradeAddressWrap: { backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tradeAddress: { color: '#a78bfa', fontSize: 12, fontFamily: fonts.semiBold, fontWeight: '600' },
  tradeTime: { color: colors.textFainter, fontSize: 11 },
  tradeMarket: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.medium, fontWeight: '500', marginBottom: 10, lineHeight: 18 },
  tradeFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tradeSize: { fontSize: 12, flex: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { fontSize: 12, fontFamily: fonts.medium, fontWeight: '500' },
});
