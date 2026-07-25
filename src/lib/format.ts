import { formatUnits } from "viem";
import { USDC_DECIMALS } from "./arc";

export function fmtUsdc(amount: bigint): string {
  const s = formatUnits(amount, USDC_DECIMALS);
  const [int, frac] = s.split(".");
  const withSep = Number(int).toLocaleString("en-US");
  return frac ? `${withSep}.${frac.slice(0, 2)}` : withSep;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtDate(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeLeft(expiredAt: bigint): { label: string; expired: boolean } {
  const diff = Number(expiredAt) * 1000 - Date.now();
  if (diff <= 0) return { label: "expired", expired: true };
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { label: `${mins}m left`, expired: false };
  const hours = Math.floor(mins / 60);
  if (hours < 48) return { label: `${hours}h left`, expired: false };
  return { label: `${Math.floor(hours / 24)}d left`, expired: false };
}
