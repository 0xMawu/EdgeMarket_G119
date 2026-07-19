import { useState, useEffect, useCallback } from 'react';
import { Account, Position } from '../types';
import { API_PREFIX } from '../config/api';

// ── Backend proxy ──────────────────────────────────────────────────────────
const LEADERBOARD_URL = `${API_PREFIX}/traders`;

const DIRECT_LEADERBOARD_URL =
  'https://data-api.polymarket.com/v1/leaderboard?limit=20&orderBy=PNL&timePeriod=ALL';

// Positions endpoint — active/open positions for a trader (redeemable === false)
const POSITIONS_URL = (address: string) =>
  `https://data-api.polymarket.com/positions?user=${address}&limit=50&sortBy=CASHPNL&sortDirection=DESC`;

// Closed positions endpoint — resolved historical positions used for win rate.
// curPrice === 1 means the trader held the winning outcome (win).
// curPrice === 0 means the trader held the losing outcome (loss).
const CLOSED_POSITIONS_URL = (address: string) =>
  `https://data-api.polymarket.com/closed-positions?user=${address}&limit=50`;

// ── Leaderboard response shape ─────────────────────────────────────────────
interface LeaderboardEntry {
  rank: string;
  proxyWallet: string;
  userName?: string;
  vol: number;
  pnl: number;
  profileImage?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
}

// ── Positions response shapes ──────────────────────────────────────────────
interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  title?: string;
  slug?: string;
  outcome?: string;
  redeemable: boolean;
  endDate?: string | null;  // ISO date from Polymarket
}

// Closed/resolved positions — returned by /closed-positions endpoint
// curPrice === 1 → trader held the winning outcome (WIN)
// curPrice === 0 → trader held the losing outcome (LOSS)
interface ClosedPosition {
  proxyWallet: string;
  conditionId: string;
  curPrice: number;        // 1 = win, 0 = loss
  realizedPnl: number;
  title?: string;
  outcome?: string;
}

// ── Mappers ────────────────────────────────────────────────────────────────

function mapPosition(pos: PolymarketPosition, index: number): Position {
  return {
    id: pos.asset ?? `pos-${index}`,
    marketName: pos.title ?? 'Unknown Market',
    outcome: pos.outcome ?? 'Yes',
    shares: pos.size,
    averagePrice: pos.avgPrice,
    currentPrice: pos.curPrice,
    value: pos.currentValue,
    pnl: pos.cashPnl,
    pnlPercentage: pos.percentPnl,
    conditionId: pos.conditionId,
    slug: pos.slug,
    endDate: pos.endDate ?? null,
  };
}

/**
 * Calculate win rate from closed/resolved positions.
 *
 * Uses the /closed-positions endpoint which returns historical resolved markets.
 * curPrice === 1 means the trader held the winning outcome (win).
 * curPrice === 0 means the trader held the losing outcome (loss).
 * Returns null when no closed positions exist.
 */
function calcWinRate(closedPositions: ClosedPosition[]): number | null {
  if (closedPositions.length === 0) return null;
  const wins = closedPositions.filter((p) => p.curPrice === 1).length;
  return Math.round((wins / closedPositions.length) * 100);
}

// ── Position limit by subscription tier ────────────────────────────────────

export function slicePositions<T>(positions: T[], isPremium: boolean): T[] {
  const limit = isPremium ? 50 : 10;
  return positions.slice(0, limit);
}

function mapEntry(
  entry: LeaderboardEntry,
  openPositions: PolymarketPosition[],
  closedPositions: ClosedPosition[],
  isPremium: boolean,
): Account {
  const totalPnL = entry.pnl ?? 0;
  const totalVolume = entry.vol ?? 0;
  const profitability = totalVolume > 0 ? (totalPnL / totalVolume) * 100 : 0;
  const winRate = calcWinRate(closedPositions);
  const allMapped = openPositions.map(mapPosition);
  const mapped = slicePositions(allMapped, isPremium);

  return {
    id: `account-${entry.rank}`,
    address: entry.proxyWallet,
    username: entry.userName || entry.xUsername || undefined,
    totalVolume,
    profitability,
    totalPnL,
    winRate,
    lastActive: new Date().toISOString(),
    openPositions: mapped,
    totalOpenPositionCount: allMapped.length,
  };
}

async function fetchRawPositions(address: string): Promise<PolymarketPosition[]> {
  try {
    const res = await fetch(POSITIONS_URL(address));
    if (!res.ok) return [];
    const json: PolymarketPosition[] = await res.json();
    if (!Array.isArray(json)) return [];
    return json;
  } catch {
    return [];
  }
}

async function fetchClosedPositions(address: string): Promise<ClosedPosition[]> {
  try {
    const res = await fetch(CLOSED_POSITIONS_URL(address));
    if (!res.ok) return [];
    const json: ClosedPosition[] = await res.json();
    if (!Array.isArray(json)) return [];
    return json;
  } catch {
    return [];
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UsePolymarketResult {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch position data for a single wallet address.
 * Win rate calculated from resolved positions; open positions returned separately.
 */
export async function fetchWalletData(
  address: string,
  isPremium = false,
): Promise<{
  positions: Position[];
  totalPnL: number;
  winRate: number | null;
}> {
  const [openPositions, closedPositions] = await Promise.all([
    fetchRawPositions(address),
    fetchClosedPositions(address),
  ]);
  const positions = slicePositions(openPositions.map(mapPosition), isPremium);
  const totalPnL = openPositions.reduce((sum, p) => sum + (p.cashPnl ?? 0), 0);
  const winRate = calcWinRate(closedPositions);
  return { positions, totalPnL, winRate };
}

/**
 * Fetch minimal account data for a specific wallet address.
 * Used to display followed traders who may not be in the leaderboard top 20.
 */
export async function fetchAccountData(address: string, isPremium = false): Promise<Account> {
  const [openPositions, closedPositions] = await Promise.all([
    fetchRawPositions(address),
    fetchClosedPositions(address),
  ]);
  const allMapped = openPositions.map(mapPosition);
  const positions = slicePositions(allMapped, isPremium);
  const totalPnL = openPositions.reduce((sum, p) => sum + (p.cashPnl ?? 0), 0);
  const winRate = calcWinRate(closedPositions);
  return {
    id: `account-${address}`,
    address,
    totalVolume: 0,
    profitability: 0,
    totalPnL,
    winRate,
    lastActive: new Date().toISOString(),
    openPositions: positions,
    totalOpenPositionCount: allMapped.length,
  };
}

export function usePolymarket(isPremium = false): UsePolymarketResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch leaderboard — fast, single request
      let res: Response;
      try {
        res = await fetch(LEADERBOARD_URL);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
      } catch (proxyErr) {
        console.warn('[usePolymarket] backend proxy unreachable, falling back to direct API:', proxyErr);
        res = await fetch(DIRECT_LEADERBOARD_URL);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
      }

      const json: LeaderboardEntry[] = await res.json();
      if (!Array.isArray(json)) throw new Error('Unexpected API response format');

      // 2. Show base accounts immediately — no positions yet
      const baseAccounts = json.map((e) => mapEntry(e, [], [], isPremium));
      setAccounts(baseAccounts);
      setLoading(false); // unblock UI immediately

      // 3. Enrich top 10 only in batches of 5 — open positions + closed positions for win rate.
      const ENRICH_COUNT = 10;
      const BATCH = 5;
      for (let i = 0; i < Math.min(json.length, ENRICH_COUNT); i += BATCH) {
        const batch = json.slice(i, i + BATCH);
        const [openResults, closedResults] = await Promise.all([
          Promise.all(batch.map((e) => fetchRawPositions(e.proxyWallet))),
          Promise.all(batch.map((e) => fetchClosedPositions(e.proxyWallet))),
        ]);

        setAccounts((prev) => {
          const next = [...prev];
          batch.forEach((entry, bIdx) => {
            const idx = next.findIndex((a) => a.address === entry.proxyWallet);
            if (idx !== -1) {
              next[idx] = mapEntry(entry, openResults[bIdx], closedResults[bIdx], isPremium);
            }
          });
          return next;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load traders';
      setError(message);
      setLoading(false);
    }
  }, [isPremium]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { accounts, loading, error, refresh: fetchData };
}
