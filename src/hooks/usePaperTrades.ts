/**
 * usePaperTrades — fetch the user's paper trading portfolio.
 *
 * Individual trades are copied via the Copy button on each PositionCard.
 * This hook is read-only — it fetches what has been explicitly copied.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_PREFIX } from '../config/api';

// Matches the backend's watcher.interval.ms default — how often the server
// checks for newly-settled copied trades. Polling in-app at the same cadence
// means a trade that just closed shows up (and gets called out) without
// requiring the user to pull-to-refresh.
const POLL_INTERVAL_MS = 60_000;

export interface PaperTrade {
  id: number;
  targetAddress: string;
  marketId: string;
  marketTitle: string | null;
  outcome: string | null;
  entryPrice: number;
  shares: number;
  livePrice: number | null;
  settled: boolean;
  endDate: string | null;    // ISO date string — trade is settled if endDate < now
  unrealisedPnl: number | null;
  pnlPercentage: number | null;
  createdAt: string;
  /** True once the backend settlement watcher has frozen this trade's close
   *  and (if a push token was on file) sent a "trade closed" notification. */
  notifiedClosed: boolean;
  /** ISO timestamp of when the trade was detected as closed, or null if still open. */
  closedAt: string | null;
}

export interface PaperPortfolio {
  trades: PaperTrade[];
  portfolioSummary: {
    totalTrades: number;
    totalUnrealisedPnl: number;
    groupedByTarget: Record<string, PaperTrade[]>;
  };
}

interface UsePaperTradesOptions {
  userAddress: string | null;
}

export function usePaperTrades({ userAddress }: UsePaperTradesOptions) {
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Trades that transitioned from open -> settled on the most recent refresh.
  // Consumers (e.g. PaperTradeCard) can use this to show a "trade just
  // closed — WIN/LOSS $X" callout without waiting for a push notification.
  const [recentlyClosed, setRecentlyClosed] = useState<PaperTrade[]>([]);

  // Remembers which trade IDs were already settled as of the last refresh,
  // so we only flag *new* closes rather than re-flagging every settled
  // trade on every poll.
  const seenSettledIds = useRef<Set<number>>(new Set());
  const hasLoadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    if (!userAddress) {
      setPortfolio(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_PREFIX}/paper-trades/${userAddress}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: PaperPortfolio = await res.json();
      setPortfolio(data);

      const nowSettled = data.trades.filter((t) => t.settled);
      if (hasLoadedOnce.current) {
        const newlyClosed = nowSettled.filter((t) => !seenSettledIds.current.has(t.id));
        if (newlyClosed.length > 0) setRecentlyClosed(newlyClosed);
      }
      seenSettledIds.current = new Set(nowSettled.map((t) => t.id));
      hasLoadedOnce.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load paper portfolio');
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  const dismissRecentlyClosed = useCallback(() => setRecentlyClosed([]), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll so a copied trade's close (and its WIN/LOSS amount) surfaces
  // in-app on its own, matching the backend settlement watcher's cadence.
  useEffect(() => {
    if (!userAddress) return;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userAddress, refresh]);

  return { portfolio, loading, error, refresh, recentlyClosed, dismissRecentlyClosed };
}
