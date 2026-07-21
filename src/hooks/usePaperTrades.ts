// fetches the user's paper trading portfolio and polls every 60s for updates

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_PREFIX } from '../config/api';

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
  endDate: string | null;
  unrealisedPnl: number | null;
  pnlPercentage: number | null;
  createdAt: string;
  notifiedClosed: boolean;
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
  const [recentlyClosed, setRecentlyClosed] = useState<PaperTrade[]>([]);

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

      // detect trades that just closed since last fetch
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

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!userAddress) return;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userAddress, refresh]);

  return { portfolio, loading, error, refresh, recentlyClosed, dismissRecentlyClosed };
}
