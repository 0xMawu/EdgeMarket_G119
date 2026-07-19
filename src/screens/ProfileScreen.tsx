import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import {
  User, Bell, Shield, LogOut, ChevronRight, Wallet,
  TrendingUp, BarChart2, AlertCircle, Crown, Moon, Sun,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';
import { useFollowing, setFollowingUserAddress, setFollowingAuth, setFollowingUserId } from '../hooks/useFollowing';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { usePolymarket, fetchWalletData, fetchAccountData } from '../hooks/usePolymarket';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { usePortfolioHistory } from '../hooks/usePortfolioHistory';
import { TwoStepConnectModal } from '../components/TwoStepConnectModal';
import { PaperTradeCard } from '../components/PaperTradeCard';
import { PremiumPaywallModal } from '../components/PremiumPaywallModal';
import { apiRequest } from '../utils/apiClient';
import { API_PREFIX } from '../config/api';
import { formatCompact, formatPct } from '../utils/formatCurrency';
import { PnlText } from '../components/PnlText';
import { usePaperTrades } from '../hooks/usePaperTrades';
import { useAuth } from '../context/AuthContext';
import type { Position, Account } from '../types';

const menuItems = [
  { icon: LogOut, label: 'Sign Out', color: 'red' as const },
];

// ── Hand-rolled SVG sparkline ──────────────────────────────────────────────
// Uses react-native-svg (already in the project). No extra deps needed.

interface SparklineProps {
  data: { timestamp: number; totalPnL: number }[];
  width: number;
  height: number;
  colors: ThemeColors;
}

function PnLSparkline({ data, width, height, colors }: SparklineProps) {
  if (data.length < 2) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textFaint, fontSize: 12 }}>
          Collecting data… check back after a few refreshes
        </Text>
      </View>
    );
  }

  const values = data.map((d) => d.totalPnL);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const pad = { top: 12, bottom: 20, left: 4, right: 4 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top - pad.bottom;

  const points = data.map((d, i) => {
    const x = pad.left + (i / (data.length - 1)) * W;
    const y = pad.top + (1 - (d.totalPnL - minV) / range) * H;
    return `${x},${y}`;
  });

  const isPositive = values[values.length - 1] >= values[0];
  const lineColor = isPositive ? colors.green : colors.red;

  // Zero line Y
  const zeroY = minV <= 0 && maxV >= 0
    ? pad.top + (1 - (0 - minV) / range) * H
    : null;

  return (
    <Svg width={width} height={height}>
      {zeroY !== null && (
        <Line
          x1={pad.left}
          y1={zeroY}
          x2={width - pad.right}
          y2={zeroY}
          stroke="rgba(128,128,128,0.25)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}
      <Polyline
        points={points.join(' ')}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Start/end labels */}
      <SvgText
        x={pad.left}
        y={height - 4}
        fontSize={9}
        fill={colors.textFaint}
      >
        Start
      </SvgText>
      <SvgText
        x={width - pad.right}
        y={height - 4}
        fontSize={9}
        fill={colors.textFaint}
        textAnchor="end"
      >
        Now
      </SvgText>
    </Svg>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  // ── Theme (dark = app default, light = white) ───────────────────────────
  const { colors, mode, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDarkMode = mode === 'dark';

  const { followingIds, syncFromServer } = useFollowing();
  const {
    walletAddress,
    isConnected,
    connect,
    disconnect,
    jwt,
    authStatus,
    clearAuth,
    storeJwt,
    rehydrating,
  } = useWalletAuth();
  const { pushToken, permissionStatus, requestPermission } = usePushNotifications();
  const { samples, addSample } = usePortfolioHistory(walletAddress);
  const { getJwt: getEmailJwt, currentUser, logout: emailLogout, refreshUser } = useAuth();
  const isPremium = currentUser?.isPremium ?? false;
  const { accounts } = usePolymarket(isPremium);

  // Use email-auth JWT first, fall back to wallet-signature JWT
  const getEffectiveJwt = () => getEmailJwt() ?? jwt;

  const [paywallVisible, setPaywallVisible] = useState(false);

  // ── Followed traders (superset of leaderboard — includes non-top-20 wallets) ─
  const [followedAccountsMap, setFollowedAccountsMap] = useState<Map<string, Account>>(new Map());

  useEffect(() => {
    if (followingIds.length === 0) return;

    followingIds.forEach((addr) => {
      const fromLeaderboard = accounts.find((a) => a.address.toLowerCase() === addr.toLowerCase());
      if (fromLeaderboard) {
        setFollowedAccountsMap((prev) => {
          const next = new Map(prev);
          next.set(addr.toLowerCase(), fromLeaderboard);
          return next;
        });
        return;
      }
      setFollowedAccountsMap((prev) => {
        if (prev.has(addr.toLowerCase())) return prev;
        fetchAccountData(addr, isPremium).then((acc) => {
          setFollowedAccountsMap((m) => {
            const next = new Map(m);
            next.set(addr.toLowerCase(), acc);
            return next;
          });
        }).catch(() => {});
        return prev;
      });
    });
  }, [followingIds, accounts, isPremium]);

  // ── Paper trading ─────────────────────────────────────────────────────────
  // Use email-auth user ID when available; fall back to wallet address for
  // legacy wallet-only sessions. Email-auth users don't need a wallet at all.
  const paperUserAddress = currentUser?.id ?? walletAddress;
  const {
    portfolio: paperPortfolio,
    loading: paperLoading,
    error: paperError,
    refresh: refreshPaper,
    recentlyClosed: paperRecentlyClosed,
    dismissRecentlyClosed: dismissPaperRecentlyClosed,
  } = usePaperTrades({
    userAddress: paperUserAddress ?? null,
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  // Track whether the user explicitly dismissed the auth modal so we don't
  // immediately re-open it in the same session. Resets when auth succeeds.
  const [authDismissed, setAuthDismissed] = useState(false);

  // ── Connected wallet's own portfolio (P&L, positions, win rate) ───────────
  const [ownPositions, setOwnPositions] = useState<Position[]>([]);
  const [ownPnL, setOwnPnL] = useState(0);
  const [ownWinRate, setOwnWinRate] = useState<number | null>(null);
  const [ownLoading, setOwnLoading] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      setOwnPositions([]);
      setOwnPnL(0);
      setOwnWinRate(null);
      return;
    }
    setOwnLoading(true);
    fetchWalletData(walletAddress, isPremium)
      .then(({ positions, totalPnL, winRate }) => {
        setOwnPositions(positions);
        setOwnPnL(totalPnL);
        setOwnWinRate(winRate);
      })
      .catch(() => {})
      .finally(() => setOwnLoading(false));
  }, [walletAddress, isPremium]);

  // ── Scope follow list to the logged-in account ──────────────────────────
  useEffect(() => {
    // Use the email-auth user ID as the namespace key if available,
    // otherwise fall back to wallet address so legacy sessions still work
    const accountKey = currentUser?.id ?? walletAddress ?? null;
    setFollowingUserId(accountKey);
  }, [currentUser?.id, walletAddress]);

  // ── Wire setFollowingAuth — use email-auth JWT first, fall back to wallet JWT ──
  useEffect(() => {
    setFollowingAuth(
      () => getEffectiveJwt(),
      async () => {
        await clearAuth();
      },
    );
  }, [jwt, clearAuth, getEffectiveJwt]);

  // ── Sync module-level user address; attempt server follow-sync when available ──
  useEffect(() => {
    setFollowingUserAddress(walletAddress);

    if (walletAddress) {
      fetch(`${API_PREFIX}/follows/${walletAddress}`)
        .then((r) => {
          const contentType = r.headers.get('content-type') ?? '';
          if (!r.ok || !contentType.includes('application/json')) return null;
          return r.json();
        })
        .then((addresses: string[] | null) => {
          if (Array.isArray(addresses)) syncFromServer(addresses);
        })
        .catch(() => {
          // Backend offline — local AsyncStorage state is already loaded by useFollowing
        });
    }
  }, [walletAddress, syncFromServer]);

  // ── Auto-show auth modal at Step 2 when wallet connected but JWT absent/expired ──
  // Guard against rehydrating phase and explicit user dismissal to avoid loops
  useEffect(() => {
    if (rehydrating) return;
    if (authDismissed) return;
    if (isConnected && (authStatus === 'unauthenticated' || authStatus === 'error')) {
      setAuthModalVisible(true);
    }
  }, [isConnected, authStatus, rehydrating, authDismissed]);

  // All followed accounts — from leaderboard cache or individually fetched
  const followingAccounts = followingIds
    .map((id) => followedAccountsMap.get(id.toLowerCase()))
    .filter((acc): acc is Account => acc !== undefined);
  const totalFollowingValue = ownPositions.reduce((s, p) => s + p.value, 0);
  const totalOpenPositions = ownPositions.length;

  // Sample connected wallet's own P&L into history
  useEffect(() => {
    if (isConnected && ownPositions.length > 0) {
      addSample(ownPnL, totalFollowingValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownPositions, isConnected]);

  // ── Push notification toggle ─────────────────────────────────────────────

  const handleNotificationsToggle = useCallback(
    async (enabled: boolean) => {
      setNotificationsEnabled(enabled);

      // If expo-notifications isn't available, toggle is just UI (in-app badge mode)
      if (permissionStatus === 'unavailable') return;

      if (enabled) {
        if (permissionStatus !== 'granted') await requestPermission();

        if (pushToken && walletAddress) {
          const url = `${API_PREFIX}/push-tokens`;
          const options: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userAddress: walletAddress, pushToken }),
          };
          apiRequest(
            url,
            options,
            () => jwt,
            async () => {
              await clearAuth();
              setAuthModalVisible(true);
            },
          )
            .then((res) => {
              if (res.status === 401 || res.status === 403) {
                Alert.alert('Authentication required — please sign in again');
              }
            })
            .catch((err) => console.warn('[ProfileScreen] push token POST failed:', err));
        }
      } else {
        if (walletAddress) {
          const url = `${API_PREFIX}/push-tokens`;
          const options: RequestInit = {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userAddress: walletAddress }),
          };
          apiRequest(
            url,
            options,
            () => jwt,
            async () => {
              await clearAuth();
              setAuthModalVisible(true);
            },
          )
            .then((res) => {
              if (res.status === 401 || res.status === 403) {
                Alert.alert('Authentication required — please sign in again');
              }
            })
            .catch((err) => console.warn('[ProfileScreen] push token DELETE failed:', err));
        }
      }
    },
    [permissionStatus, pushToken, walletAddress, requestPermission, jwt, clearAuth],
  );

  // ── Wallet handlers ──────────────────────────────────────────────────────

  const handleDisconnect = () => {
    Alert.alert('Disconnect Wallet', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => disconnect() },
    ]);
  };

  // ── onSuccess for TwoStepConnectModal ────────────────────────────────────
  const handleAuthSuccess = useCallback(
    async (token: string, address?: string) => {
      if (address && !isConnected) {
        await connect(address);
      }
      await storeJwt(token);
      setAuthDismissed(false); // reset so future JWT expiry auto-prompts again
      setAuthModalVisible(false);
    },
    [isConnected, connect, storeJwt],
  );

  const showPortfolio = isConnected && followingAccounts.length > 0;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Account & preferences</Text>
          </View>

          {/* Wallet card */}
          <View style={[styles.card, styles.avatarCard]}>
            <View style={styles.avatarWrap}>
              <User size={32} color={colors.white} />
            </View>
            <View style={styles.flex}>
              {isConnected && walletAddress ? (
                <>
                  <Text style={styles.displayName}>
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </Text>
                  <Text style={styles.connectedLabel}>Wallet connected</Text>
                </>
              ) : (
                <Text style={styles.displayNamePlaceholder}>No wallet connected</Text>
              )}
            </View>
            {isConnected ? (
              <Pressable onPress={handleDisconnect} style={styles.disconnectBtn}>
                <LogOut size={14} color={colors.red} />
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setAuthModalVisible(true)}
                style={styles.connectBtn}
              >
                <Wallet size={14} color={colors.white} />
                <Text style={styles.connectText}>Connect</Text>
              </Pressable>
            )}
          </View>

          {/* Stats */}
          <View style={[styles.card, styles.statsCard]}>
            <View style={styles.statGridCell}>
              <Text style={styles.statValue}>{followingIds.length}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={[styles.statGridCell, styles.statGridCellBorder]}>
              <PnlText value={ownPnL} style={styles.statValue} />
              <Text style={styles.statLabel}>My P&L</Text>
            </View>
            <View style={styles.statGridCell}>
              <Text style={styles.statValue}>
                {ownWinRate !== null ? formatPct(ownWinRate) : '--'}
              </Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
          </View>

          {/* Subscription */}
          {currentUser && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Crown size={15} color={colors.yellow} />
                  <Text style={styles.sectionTitle}>Subscription</Text>
                </View>
              </View>
              <Text style={styles.tierLabel}>
                {currentUser.isPremium ? 'Premium' : 'Basic'}
              </Text>
              {currentUser.isPremium ? (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Cancel Subscription',
                      'Are you sure you want to cancel your Premium subscription? You will lose access to premium features immediately.',
                      [
                        { text: 'Keep Premium', style: 'cancel' },
                        {
                          text: 'Cancel Subscription',
                          style: 'destructive',
                          onPress: async () => {
                            const jwt = getEmailJwt();
                            if (!jwt) return;
                            try {
                              const res = await fetch(`${API_PREFIX}/subscription/cancel`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${jwt}` },
                              });
                              if (res.ok) {
                                Alert.alert('Cancelled', 'Your subscription has been cancelled.');
                                // Refresh user data so isPremium updates
                                const meRes = await fetch(`${API_PREFIX}/auth/me`, {
                                  headers: { Authorization: `Bearer ${jwt}` },
                                });
                                // AuthProvider will re-fetch on next mount; reload prompt
                                if (meRes.ok) {
                                  Alert.alert('Done', 'Your account has been updated to Basic. Please restart the app to see changes.');
                                }
                              } else {
                                const body = await res.json().catch(() => ({})) as { error?: string };
                                Alert.alert('Error', body.error ?? 'Failed to cancel. Please try again.');
                              }
                            } catch {
                              Alert.alert('Error', 'Network error. Please try again.');
                            }
                          },
                        },
                      ],
                    );
                  }}
                  style={styles.manageBtn}
                >
                  <Text style={styles.manageBtnText}>Cancel Subscription</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setPaywallVisible(true)}
                  style={styles.premiumBtn}
                >
                  <Text style={styles.premiumBtnText}>Go Premium</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── Portfolio Analytics (connected wallet's own positions) ── */}
          {isConnected && ownPositions.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <BarChart2 size={15} color={colors.purple} />
                  <Text style={styles.sectionTitle}>My Portfolio</Text>
                </View>
              </View>

              {/* Summary row */}
              <View style={styles.analyticsRow}>
                <View style={styles.analyticCell}>
                  <Text style={styles.analyticValue}>
                    {formatCompact(totalFollowingValue)}
                  </Text>
                  <Text style={styles.analyticLabel}>Total Value</Text>
                </View>
                <View style={[styles.analyticCell, styles.analyticCellBorder]}>
                  <PnlText value={ownPnL} style={styles.analyticValue} />
                  <Text style={styles.analyticLabel}>Total P&L</Text>
                </View>
                <View style={styles.analyticCell}>
                  <Text style={styles.analyticValue}>{totalOpenPositions}</Text>
                  <Text style={styles.analyticLabel}>Positions</Text>
                </View>
              </View>

              {/* P&L Sparkline */}
              <View style={styles.chartWrap}>
                <Text style={styles.chartLabel}>P&L Since Tracking</Text>
                <PnLSparkline data={samples} width={280} height={80} colors={colors} />
              </View>

              {/* Own open positions list */}
              {ownPositions.map((pos) => (
                <View key={pos.id} style={styles.positionRow}>
                  <View style={styles.flex}>
                    <Text style={styles.positionName} numberOfLines={1}>{pos.marketName}</Text>
                    <Text style={styles.positionMeta}>{pos.outcome} · {pos.shares.toFixed(2)} shares</Text>
                  </View>
                  <View style={styles.positionPnlWrap}>
                    <PnlText value={pos.pnl} style={styles.positionPnl} />
                    <Text style={[styles.positionPct, { color: pos.pnlPercentage >= 0 ? colors.green : colors.red }]}>
                      {formatPct(pos.pnlPercentage)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Followed traders */}
          {followingAccounts.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <User size={15} color={colors.green} />
                  <Text style={styles.sectionTitle}>Followed Traders</Text>
                </View>
              </View>
              {followingAccounts.map((acc) => (
                <View key={acc.id} style={styles.traderRow}>
                  <View style={styles.traderAvatar}>
                    <Text style={styles.traderAvatarText}>
                      {acc.username ? acc.username[0].toUpperCase() : '#'}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.traderName}>
                      {acc.username ?? `${acc.address.slice(0, 8)}...`}
                    </Text>
                    <Text style={styles.traderStats}>
                      {acc.openPositions.length} positions · {acc.winRate !== null ? formatPct(acc.winRate) + ' win rate' : 'win rate N/A'}
                    </Text>
                  </View>
                  <PnlText value={acc.totalPnL} style={styles.traderPnL} />
                </View>
              ))}
            </View>
          )}

          {/* ── Paper Portfolio ── */}
          {followingAccounts.length > 0 && (
            <PaperTradeCard
              portfolio={paperPortfolio}
              loading={paperLoading}
              error={paperError}
              onRefresh={refreshPaper}
              recentlyClosed={paperRecentlyClosed}
              onDismissRecentlyClosed={dismissPaperRecentlyClosed}
            />
          )}

          {/* Preferences */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Bell size={15} color={colors.blue} />
                <Text style={styles.sectionTitle}>Preferences</Text>
              </View>
            </View>
            <View style={styles.prefRow}>
              <View style={styles.flex}>
                <Text style={styles.prefLabel}>Trade Alerts</Text>
                <Text style={styles.prefSub}>
                  {permissionStatus === 'unavailable'
                    ? 'In-app badge alerts (OS notifications unavailable)'
                    : 'Notify when followed traders open positions'}
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: 'rgba(128,128,128,0.25)', true: colors.purpleStrong }}
                thumbColor={colors.white}
              />
            </View>
          </View>

          {/* Appearance — real dark/light mode toggle */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                {isDarkMode ? (
                  <Moon size={15} color={colors.blue} />
                ) : (
                  <Sun size={15} color={colors.yellow} />
                )}
                <Text style={styles.sectionTitle}>Appearance</Text>
              </View>
            </View>
            <View style={styles.prefRow}>
              <View style={styles.flex}>
                <Text style={styles.prefLabel}>Dark Mode</Text>
                <Text style={styles.prefSub}>
                  {isDarkMode ? 'Using the default dark theme' : 'Using the light theme'}
                </Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: 'rgba(128,128,128,0.25)', true: colors.purpleStrong }}
                thumbColor={colors.white}
              />
            </View>
          </View>

          {/* Menu */}
          <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
            {menuItems.map((item, i) => {
              const Icon = item.icon;
              const handleMenuPress = () => {
                if (item.label === 'Sign Out') {
                  Alert.alert(
                    'Sign Out',
                    'Are you sure you want to sign out?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Sign Out',
                        style: 'destructive',
                        onPress: async () => {
                          await emailLogout();
                        },
                      },
                    ],
                  );
                }
              };
              return (
                <Pressable
                  key={item.label}
                  style={[styles.menuRow, i < menuItems.length - 1 && styles.menuRowBorder]}
                  onPress={handleMenuPress}
                >
                  <View style={styles.menuLeft}>
                    <Icon size={17} color={colors[item.color]} />
                    <Text style={styles.menuLabel}>{item.label}</Text>
                  </View>
                  <ChevronRight size={15} color={colors.textFainter} />
                </Pressable>
              );
            })}
          </View>

          {isConnected && (
            <Pressable style={styles.logoutBtn} onPress={handleDisconnect}>
              <LogOut size={15} color={colors.red} />
              <Text style={styles.logoutText}>Disconnect Wallet</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Two-Step Connect / Re-Auth Modal */}
      <TwoStepConnectModal
        visible={authModalVisible}
        onClose={() => {
          setAuthModalVisible(false);
          setAuthDismissed(true); // user chose to skip — don't re-open until next session
        }}
        onSuccess={handleAuthSuccess}
        walletAddress={isConnected ? walletAddress : null}
        initialStep={isConnected ? 2 : 1}
      />

      <PremiumPaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        jwt={getEmailJwt()}
        onPaymentComplete={refreshUser}
      />
    </LinearGradient>
  );
}

// Styles are now a function of the active palette so they update live when
// the user toggles dark/light mode.
const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    gradient: { flex: 1 },
    safeArea: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
    header: { marginBottom: 20 },
    title: { color: colors.textPrimary, fontSize: 24, fontFamily: fonts.semiBold, fontWeight: '600', marginBottom: 4 },
    subtitle: { color: colors.textMuted, fontSize: 13 },
    flex: { flex: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    avatarCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    avatarWrap: {
      width: 52, height: 52, borderRadius: 14,
      backgroundColor: colors.purpleStrong,
      alignItems: 'center', justifyContent: 'center',
    },
    displayName: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semiBold, fontWeight: '600' },
    displayNamePlaceholder: { color: colors.textFaint, fontSize: 15 },
    connectedLabel: { color: colors.green, fontSize: 11, marginTop: 2 },
    connectBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.purpleStrong,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    },
    connectText: { color: colors.white, fontSize: 13, fontFamily: fonts.semiBold, fontWeight: '600' },
    disconnectBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(248,113,113,0.1)',
      borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)',
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    },
    disconnectText: { color: colors.red, fontSize: 12, fontFamily: fonts.semiBold, fontWeight: '600' },
    statsCard: { flexDirection: 'row', padding: 0, overflow: 'hidden', marginBottom: 12 },
    statGridCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    statGridCellBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
    statValue: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.bold, fontWeight: '700' },
    statLabel: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
    // Portfolio analytics
    analyticsRow: { flexDirection: 'row', marginBottom: 16 },
    analyticCell: { flex: 1, alignItems: 'center' },
    analyticCellBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
    analyticValue: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold, fontWeight: '700' },
    analyticLabel: { color: colors.textFaint, fontSize: 11, marginTop: 3 },
    chartWrap: { alignItems: 'center' },
    chartLabel: { color: colors.textFaint, fontSize: 11, marginBottom: 6, alignSelf: 'flex-start' },
    // Section header
    sectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 14,
    },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600' },
    tierLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: fonts.semiBold,
      fontWeight: '600',
      marginBottom: 12,
    },
    premiumBtn: {
      backgroundColor: colors.yellow,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    premiumBtnText: {
      color: '#1a1a2e',
      fontSize: 14,
      fontFamily: fonts.bold,
      fontWeight: '700',
    },
    manageBtn: {
      borderWidth: 1,
      borderColor: 'rgba(234,179,8,0.4)',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    manageBtnText: {
      color: colors.yellow,
      fontSize: 14,
      fontFamily: fonts.semiBold,
      fontWeight: '600',
    },
    traderRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
    },
    traderAvatar: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: colors.purpleStrong,
      alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    traderAvatarText: { color: colors.white, fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600' },
    traderName: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.medium, fontWeight: '500' },
    traderStats: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    traderPnL: { fontSize: 13, fontFamily: fonts.semiBold, fontWeight: '600' },
    // Position rows inside "My Portfolio"
    positionRow: {
      flexDirection: 'row',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.cardBorder,
    },
    positionName: { color: colors.textPrimary, fontSize: 12, fontFamily: fonts.medium, fontWeight: '500', marginBottom: 2 },
    positionMeta: { color: colors.textFaint, fontSize: 11 },
    positionPnlWrap: { alignItems: 'flex-end', justifyContent: 'center' },
    positionPnl: { fontSize: 13, fontFamily: fonts.semiBold, fontWeight: '600' },
    positionPct: { fontSize: 11, marginTop: 2 },
    prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    prefLabel: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.medium, fontWeight: '500' },
    prefSub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
    menuRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', padding: 16,
    },
    menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
    menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuLabel: { color: colors.textPrimary, fontSize: 13 },
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, padding: 16, borderRadius: 16,
      backgroundColor: 'rgba(248,113,113,0.1)',
      borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)', marginTop: 4,
    },
    logoutText: { color: colors.red, fontSize: 14 },
  });