// lets users pin markets on the Discover screen and track price changes since pinning

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PricePoint {
  timestamp: number;
  yesPrice: number;
}

type PriceHistory = Record<string, PricePoint[]>;

const PINNED_KEY = '@edgemarket/watchlist_pinned';
const HISTORY_KEY = '@edgemarket/watchlist_history';
const MAX_HISTORY_PER_MARKET = 50;

export interface UseWatchlistResult {
  pinnedIds: string[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
  getHistory: (id: string) => PricePoint[];
  recordPrices: (prices: { id: string; yesPrice: number }[]) => void;
}

export function useWatchlist(): UseWatchlistResult {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<PriceHistory>({});

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PINNED_KEY),
      AsyncStorage.getItem(HISTORY_KEY),
    ])
      .then(([rawPinned, rawHistory]) => {
        if (rawPinned) {
          const parsed = JSON.parse(rawPinned);
          if (Array.isArray(parsed)) setPinnedIds(parsed);
        }
        if (rawHistory) {
          const parsed = JSON.parse(rawHistory);
          if (parsed && typeof parsed === 'object') setHistory(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      AsyncStorage.setItem(PINNED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });

    // remove price history when unpinning
    setHistory((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _removed, ...rest } = prev;
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(rest)).catch(() => {});
      return rest;
    });
  }, []);

  const getHistory = useCallback((id: string): PricePoint[] => history[id] ?? [], [history]);

  // call this after each market fetch to record new price points for pinned markets
  const recordPrices = useCallback((prices: { id: string; yesPrice: number }[]) => {
    setPinnedIds((currentPinned) => {
      if (currentPinned.length === 0) return currentPinned;

      setHistory((prevHistory) => {
        const now = Date.now();
        let changed = false;
        const next = { ...prevHistory };

        for (const { id, yesPrice } of prices) {
          if (!currentPinned.includes(id)) continue;

          const existing = next[id] ?? [];
          const last = existing[existing.length - 1];

          // skip if price hasn't moved
          if (last && last.yesPrice === yesPrice) continue;

          changed = true;
          next[id] = [...existing, { timestamp: now, yesPrice }].slice(-MAX_HISTORY_PER_MARKET);
        }

        if (!changed) return prevHistory;
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });

      return currentPinned;
    });
  }, []);

  return { pinnedIds, isPinned, togglePin, getHistory, recordPrices };
}
