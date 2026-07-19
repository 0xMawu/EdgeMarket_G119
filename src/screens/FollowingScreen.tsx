// Following screen - shows wallets the user is tracking
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Star } from 'lucide-react-native';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountCard } from '../components/AccountCard';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useFollowing } from '../hooks/useFollowing';
import { usePolymarket } from '../hooks/usePolymarket';
import { useAuth } from '../context/AuthContext';
import type { Account } from '../types';

export function FollowingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { currentUser } = useAuth();
  const isPremium = currentUser?.isPremium ?? false;
  const { followingIds, toggleFollow } = useFollowing();
  const { accounts, loading } = usePolymarket(isPremium);

  // track expanded cards by address — same pattern as LeaderboardScreen
  const [expandedAddresses, setExpandedAddresses] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((address: string) => {
    setExpandedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }, []);

  const followingAccounts = accounts.filter((acc) => followingIds.includes(acc.address));

  const renderItem = useCallback(({ item }: { item: Account }) => (
    <AccountCard
      account={item}
      isFollowing={true}
      onToggleFollow={toggleFollow}
      expanded={expandedAddresses.has(item.address)}
      onToggleExpand={toggleExpand}
    />
  ), [toggleFollow, expandedAddresses, toggleExpand]);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>EdgeMarket</Text>
          <Text style={styles.title}>Following</Text>
          <Text style={styles.subtitle}>Wallets you're tracking</Text>
        </View>

        {loading && followingIds.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
            <SkeletonLoader width="100%" height={80} />
            <SkeletonLoader width="100%" height={80} />
            <SkeletonLoader width="100%" height={80} />
          </View>
        ) : followingAccounts.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Not following anyone yet"
            subtitle="Go to the Leaderboard and tap Follow on traders you want to track."
          />
        ) : (
          <>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                Following {followingAccounts.length} account{followingAccounts.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <FlatList
              data={followingAccounts}
              keyExtractor={(item) => item.address}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  eyebrow: { color: colors.purple, fontSize: 13, marginBottom: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontFamily: fonts.semiBold, fontWeight: '600', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  countBadge: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
  },
  countText: { color: '#d8b4fe', fontSize: 13, fontFamily: fonts.medium, fontWeight: '500' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
});
