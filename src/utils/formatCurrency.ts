// formats numbers as currency strings for display

// compact with suffix: $1.2K, $4.6M, $7.9B
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    const scaled = abs / 1_000_000_000;
    return `${sign}$${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled)}B`;
  }
  if (abs >= 1_000_000) {
    const scaled = abs / 1_000_000;
    return `${sign}$${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled)}M`;
  }
  if (abs >= 1_000) {
    const scaled = abs / 1_000;
    return `${sign}$${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled)}K`;
  }
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

// full dollar amount with commas: $1,234,567
export function formatFull(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

// signed compact P&L: +$1.5K or -$250
export function formatPnl(value: number): string {
  if (value === 0) return '$0';
  const prefix = value > 0 ? '+' : '';
  return prefix + formatCompact(value);
}

// percentage: 7.8% or 62% or 1,235%
export function formatPct(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs < 10) return `${sign}${abs.toFixed(1)}%`;
  return `${sign}${Math.round(abs).toLocaleString('en-US')}%`;
}
