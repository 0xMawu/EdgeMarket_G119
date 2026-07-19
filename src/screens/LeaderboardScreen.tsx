// Leaderboard screen - shows all traders ranked by PnL, volume, or win rate
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  RefreshControl, Pressable,
} from 'react-native';
import { Search, ListFilter, TrendingUp, BarChart2, Award, Trophy, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountCard } from '../components/AccountCard';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useFollowing } from '../hooks/useFollowing';
import { usePolymarket } from '../hooks/usePolymarket';
import { useAuth } from '../context/AuthContext';
import type { Account } from '../types';

type LeaderboardSort = 'all' | 'profit' | 'volume' | 'winrate';

const SORT_OPTIONS: { key: LeaderboardSort; label: string; icon: typeof ListFilter }[] = [
  { key: 'all',     label: 'All',        icon: ListFilter },
  { key: 'profit',  label: 'Top Profit', icon: TrendingUp },
  { key: 'volume',  label: 'Top Volume', icon: BarChart2  },
  { key: 'winrate', label: 'Win Rate',   icon: Award      },
];

// Shows a greeting based on login count and display name
export function buildGreeting(
  displayName: string | null | undefined,
  loginCount: number | undefined,
): string {
  if (!displayName) return 'EdgeMarket';
  return loginCount === 1
    ? `Hey ${displayName}, Welcome`
    : `Welcome back, ${displayName}`;
}

export function LeaderboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<LeaderboardSort>('all');
  // store which cards are open by address so sorting doesn't collapse them
  const [expandedAddresses, setExpandedAddresses] = useState<Set<string>>(new Set());

  const { currentUser } = useAuth();
  const isPremium = currentUser?.isPremium ?? false;
  const { followingIds, toggleFollow } = useFollowing();
  const { accounts, loading, error, refresh } = usePolymarket(isPremium);

  const toggleExpand = useCallback((address: string) => {
    setExpandedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter(
      (acc) =>
        acc.address.toLowerCase().includes(q) ||
        acc.username?.toLowerCase().includes(q),
    );
  }, [searchQuery, accounts]);

  const sorted = useMemo(() => {
    if (sort === 'all') return filtered;
    return [...filtered].sort((a, b) => {
      if (sort === 'profit')  return b.totalPnL - a.totalPnL;
      if (sort === 'volume')  return b.totalVolume - a.totalVolume;
      if (sort === 'winrate') return (b.winRate ?? -1) - (a.winRate ?? -1);
      return 0;
    });
  }, [sort, filtered]);

  // stable renderItem so FlatList doesn't re-render every card on each state update
  const renderItem = useCallback(({ item, index }: { item: Account; index: number }) => (
    <AccountCard
      account={item}
      isFollowing={followingIds.includes(item.address)}
      onToggleFollow={toggleFollow}
      expanded={expandedAddresses.has(item.address)}
      onToggleExpand={toggleExpand}
      rank={sort === 'all' ? undefined : index + 1}
    />
  ), [followingIds, toggleFollow, sort, expandedAddresses, toggleExpand]);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {buildGreeting(currentUser?.displayName, currentUser?.loginCount)}
          </Text>
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>Browse and rank tracked wallets</Text>
        </View>

        <View style={styles.searchWrap}>
          <Search size={15} color={colors.textFaint} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by address or username..."
            placeholderTextColor={colors.textFainter}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.sortRow}>
          {SORT_OPTIONS.map(({ key, label, icon: Icon }) => (
            <Pressable
              key={key}
              style={[styles.sortBtn, sort === key && styles.sortBtnActive]}
              onPress={() => setSort(key)}
            >
              <Icon size={14} color={sort === key ? colors.white : colors.textFaint} />
              <Text style={[styles.sortBtnText, sort === key && styles.sortBtnTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && sorted.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
            <SkeletonLoader width="100%" height={80} />
            <SkeletonLoader width="100%" height={80} />
            <SkeletonLoader width="100%" height={80} />
            <SkeletonLoader width="100%" height={80} />
            <SkeletonLoader width="100%" height={80} />
          </View>
        ) : error && sorted.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load traders"
            subtitle={error ?? undefined}
            action={{ label: 'Try Again', onPress: refresh }}
          />
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.address}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <EmptyState
                icon={Trophy}
                title="No accounts found"
                subtitle="Try a different search term."
              />
            }
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={8}
            windowSize={10}
            initialNumToRender={8}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={refresh}
                tintColor={colors.purple}
                colors={[colors.purple]}
              />
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  greeting: { color: colors.purple, fontSize: 13, marginBottom: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontFamily: fonts.semiBold, fontWeight: '600', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  searchWrap: { marginHorizontal: 16, marginBottom: 12, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  searchInput: {
    paddingLeft: 40, paddingRight: 16, paddingVertical: 12,
    borderRadius: 16, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
    color: colors.textPrimary, fontSize: 13,
  },
  sortRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 8 },
  sortBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 10,
    borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  sortBtnActive: { backgroundColor: colors.purpleStrong, borderColor: colors.purple },
  sortBtnText: { color: colors.textFaint, fontSize: 12, fontFamily: fonts.medium, fontWeight: '500' },
  sortBtnTextActive: { color: colors.white },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
});
