export interface Position {
  id: string;
  marketName: string;
  outcome: string;
  shares: number;
  averagePrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercentage: number;
  conditionId?: string;
  slug?: string;
  endDate?: string | null;  // ISO date string — used to detect settled paper trades
}

export interface Account {
  id: string;
  address: string;
  username?: string;
  totalVolume: number;
  profitability: number;
  totalPnL: number;
  winRate: number | null;
  lastActive: string;
  openPositions: Position[];
  /** Total open positions before tier-based slicing (for "+N more with Premium" label). */
  totalOpenPositionCount?: number;
}

export type TabType = 'all' | 'following' | 'top';
export type SortType = 'profit' | 'volume';
