// PaperTradeCard - shows the user's paper trading portfolio (read-only)
// Positions are added here by tapping Copy on individual PositionCards
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { TrendingUp, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { formatPnl, formatPct } from '../utils/formatCurrency';
import type { PaperPortfolio, PaperTrade } from '../hooks/usePaperTrades';

interface Props {
  portfolio: PaperPortfolio | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Trades that just settled since the last refresh — rendered as a
   *  "trade closed" callout above the list until dismissed. */
  recentlyClosed?: PaperTrade[];
  onDismissRecentlyClosed?: () => void;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function TradeRow({ trade }: { trade: PaperTrade }) {
  const { colors } = useTheme();

  // Calculate P&L locally if backend returned null but we have entryPrice + livePrice
  let computedPnl = trade.unrealisedPnl;
  let computedPct = trade.pnlPercentage;
  if (computedPnl === null && trade.livePrice !== null && trade.entryPrice > 0) {
    computedPnl = (trade.livePrice - trade.entryPrice) * trade.shares;
    computedPct = ((trade.livePrice - trade.entryPrice) / trade.entryPrice) * 100;
  }

  // WIN / LOSS is only final once the trade has actually settled (market
  // closed on Polymarket). Before that it's still OPEN — we show the
  // current unrealized direction for color, but the badge says OPEN so
  // it isn't confused with a closed result.
  const hasPnl = computedPnl !== null;
  const isWin = trade.settled && hasPnl && computedPnl! > 0;
  const isLoss = trade.settled && hasPnl && computedPnl! < 0;

  const pnlColor = !hasPnl
    ? colors.textFaint
    : computedPnl! > 0 ? colors.green : computedPnl! < 0 ? colors.red : colors.textFaint;

  const pnlAmount = computedPnl !== null
    ? formatPnl(Math.round(computedPnl * 100) / 100)
    : '—';
  const pnlPct = computedPct !== null
    ? formatPct(Math.round(computedPct * 10) / 10)
    : null;

  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 12, fontFamily: fonts.medium, fontWeight: '500', marginBottom: 3 }} numberOfLines={2}>
            {trade.marketTitle ?? trade.marketId.slice(0, 12) + '…'}
          </Text>
          <Text style={{ color: colors.textFaint, fontSize: 10, marginBottom: 2 }}>
            {trade.outcome ?? '—'} · {trade.shares.toFixed(2)} shares · entry {(trade.entryPrice * 100).toFixed(1)}¢
          </Text>
          <Text style={{ color: colors.textFainter, fontSize: 10 }}>
            via {shortAddr(trade.targetAddress)}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {/* WIN / LOSS badge only appears once the trade has actually closed */}
          {trade.settled ? (
            <View style={{
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
              backgroundColor: isWin ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              borderColor: isWin ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)',
            }}>
              <Text style={{ color: pnlColor, fontSize: 11, fontFamily: fonts.bold, fontWeight: '700' }}>
                {isWin ? '✓ WIN' : '✗ LOSS'}
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)' }}>
              <Text style={{ color: colors.purple, fontSize: 10, fontFamily: fonts.medium, fontWeight: '500' }}>OPEN</Text>
            </View>
          )}
          {/* P&L amount */}
          <Text style={{ color: pnlColor, fontSize: 13, fontFamily: fonts.semiBold, fontWeight: '600' }}>
            {pnlAmount}
          </Text>
          {pnlPct && (
            <Text style={{ color: pnlColor, fontSize: 10 }}>{pnlPct}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ClosedTradeBanner({ trade, onDismiss }: { trade: PaperTrade; onDismiss: () => void }) {
  const { colors } = useTheme();
  const pnl = trade.unrealisedPnl ?? 0;
  const isWin = pnl > 0;

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1,
        backgroundColor: isWin ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
        borderColor: isWin ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)',
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ color: isWin ? colors.green : colors.red, fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' }}>
          {isWin ? '✓ Trade closed — WIN' : '✗ Trade closed — LOSS'}
        </Text>
        <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {trade.marketTitle ?? trade.marketId.slice(0, 12) + '…'} · {formatPnl(Math.round(pnl * 100) / 100)}
        </Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Text style={{ color: colors.textFainter, fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}

export function PaperTradeCard({ portfolio, loading, error, onRefresh, recentlyClosed = [], onDismissRecentlyClosed }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const hasTrades = (portfolio?.trades.length ?? 0) > 0;
  const totalPnl = portfolio?.portfolioSummary.totalUnrealisedPnl ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <TrendingUp size={15} color={colors.purple} />
          <Text style={styles.cardTitle}>Paper Portfolio</Text>
        </View>
        <Pressable onPress={onRefresh} hitSlop={8} disabled={loading}>
          <RefreshCw size={14} color={loading ? colors.textFainter : colors.textFaint} />
        </Pressable>
      </View>

      {recentlyClosed.length > 0 ? (
        <View style={{ marginBottom: 4 }}>
          {recentlyClosed.map((trade) => (
            <ClosedTradeBanner
              key={trade.id}
              trade={trade}
              onDismiss={() => onDismissRecentlyClosed?.()}
            />
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</Text>
          <Pressable onPress={onRefresh} style={styles.retryBtn}>
            <Text style={{ color: colors.red, fontSize: 12, fontFamily: fonts.semiBold, fontWeight: '600' }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !hasTrades ? (
        <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
      ) : null}

      {hasTrades && !loading ? (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{portfolio!.portfolioSummary.totalTrades}</Text>
              <Text style={styles.summaryLabel}>Positions</Text>
            </View>
            <View style={[styles.summaryCell, { borderLeftWidth: 1, borderLeftColor: colors.cardBorder }]}>
              <Text style={[styles.summaryValue, { color: totalPnl >= 0 ? colors.green : colors.red }]}>
                {formatPnl(totalPnl)}
              </Text>
              <Text style={styles.summaryLabel}>Total P&L</Text>
            </View>
          </View>
          {portfolio!.trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </>
      ) : null}

      {!hasTrades && !loading && !error ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: 13, fontFamily: fonts.medium, fontWeight: '500', marginBottom: 4 }}>
            No paper positions yet.
          </Text>
          <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center' }}>
            Tap the Copy button on any open position to start paper trading.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.cardBorder,
    padding: 16, marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600' },
  retryBtn: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  summaryRow: {
    flexDirection: 'row', marginBottom: 16,
    backgroundColor: colors.cardBorder, borderRadius: 12, overflow: 'hidden',
  },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  summaryValue: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.bold, fontWeight: '700' },
  summaryLabel: { color: colors.textFaint, fontSize: 11, marginTop: 3 },
});
