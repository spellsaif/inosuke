import { getProgramDerivedAddress } from "@solana/kit"
import type {Address, Signature, ReadonlyUint8Array} from "@solana/kit"
import type {ClusterMoniker, ClusterInput} from "./types.js"

export const LAMPORTS_PER_SOL = 1_000_000_000n

/**
 * Helper to find a Program Derived Address (PDA).
 * Seeds can be Uint8Array buffers or regular strings.
 */
export async function findPda(programId: Address, seeds: (Uint8Array | ReadonlyUint8Array | string)[]): Promise<Address> {
  const parsedSeeds = seeds.map(s => typeof s === "string" ? new TextEncoder().encode(s) : s)
  const [pda] = await getProgramDerivedAddress({ programAddress: programId, seeds: parsedSeeds })
  return pda
}

/**
 * Convert Lamports to SOL.
 * Uses BigInt division to avoid Number() precision loss above 2^53.
 *
 * @example
 * toSol(1_000_000_000n) -> 1
 * toSol(500_000_000n) -> 0.5
 */
export function toSol(lamports: bigint, decimals = 9): number {
  const divisor = 10n ** BigInt(decimals)
  const integer = lamports / divisor
  const fraction = lamports % divisor
  const fractionStr = fraction.toString().padStart(decimals, "0")
  return parseFloat(`${integer}.${fractionStr}`)
}

/**
 * Convert SOL to Lamports
 *
 * @example
 * toLamports(1) -> 1_000_000_000n
 * toLamports(0.5) -> 500_000_000n
 */
export function toLamports(sol: number): bigint {
  return BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)))
}

/**
 * Convert lamports to a display-formatted SOL string using Intl.NumberFormat.
 * For UI display only — not for math.
 *
 * @example
 * toSolDisplay(1_000_000_000n)   -> "1"
 * toSolDisplay(1_500_000_000n)   -> "1.5"
 * toSolDisplay(123_456_789n, 3)  -> "0.123"
 */
export function toSolDisplay(lamports: bigint, maxDecimals = 9): string {
  const sol = Number(lamports) / 1_000_000_000
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.min(maxDecimals, 9),
    minimumFractionDigits: 0,
  }).format(sol)
}

// ─── Genesis hash detection ──────────────────────────────────────────────────

const GENESIS_HASH: Record<string, "mainnet" | "devnet" | "testnet"> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "mainnet",
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG": "devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "testnet",
}

/**
 * Detect which Solana cluster a genesis hash belongs to.
 * Returns the cluster moniker or "unknown" if not recognized.
 */
export function getClusterFromGenesis(hash: string): "mainnet" | "devnet" | "testnet" | "unknown" {
  return GENESIS_HASH[hash] ?? "unknown"
}

/**
 * Public HTTP RPC URL for a cluster.
 */
export function rpcUrl(cluster: ClusterMoniker): string {
  const urls: Record<ClusterMoniker, string> = {
    mainnet: "https://api.mainnet-beta.solana.com",
    devnet: "https://api.devnet.solana.com",
    testnet: "https://api.testnet.solana.com",
    localnet: "http://localhost:8899",
  }
  return urls[cluster]
}

/**
 * WebSocket URL for a cluster.
 */
export function wsUrl(cluster: ClusterMoniker): string {
  const urls: Record<ClusterMoniker, string> = {
    mainnet: "wss://api.mainnet-beta.solana.com",
    devnet: "wss://api.devnet.solana.com",
    testnet: "wss://api.testnet.solana.com",
    localnet: "ws://localhost:8900",
  }
  return urls[cluster]
}

type ExplorerEntity = "tx" | "address" | "block"

export function explorerUrl(
  value: Signature | Address | string,
  cluster: ClusterInput = "mainnet",
  entity: ExplorerEntity = "tx"
): string {
  const base = `https://explorer.solana.com/${entity}/${value}`
  if (cluster == "mainnet") return base
  if (cluster == "localnet") return `${base}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`
  return `${base}?cluster=${cluster}`
}

export function truncate(value: string, chars = 4): string {
  if (value.length <= chars * 2 + 3) return value
  return `${value.slice(0, chars)}...${value.slice(-chars)}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseSimulationLogs(logs: string[]): string | null {
  for (const log of logs) {
    const customMatch = log.match(/Program log: Error: (.+)/)
    if (customMatch?.[1]) return customMatch[1]
    const anchorMatch = log.match(/Error Message: (.+)/)
    if (anchorMatch?.[1]) return anchorMatch[1]
    const systemMatch = log.match(/Transfer: insufficient lamports (\d+), need (\d+)/)
    if (systemMatch?.[1] && systemMatch?.[2]) {
      return `Insufficient funds: have ${systemMatch[1]} lamports, need ${systemMatch[2]}`
    }
  }
  return null
}
