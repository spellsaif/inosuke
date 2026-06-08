import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  compileTransaction,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  assertIsTransactionWithBlockhashLifetime,
} from "@solana/kit"
import type {
  TransactionSigner,
  TransactionMessageWithBlockhashLifetime,
  Instruction,
  Address,
} from "@solana/kit"
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget"
import { getTransferSolInstruction } from "@solana-program/system"
import { fetchAddressLookupTable } from "@solana-program/address-lookup-table"
import { compressTransactionMessageUsingAddressLookupTables } from "@solana/transaction-messages"
import { SimulationError, BlockhashExpiredError } from "./errors.js"
import { parseSimulationLogs, sleep } from "./utils.js"
import { debug } from "./debug.js"
import type { LatestBlockhash, SendOptions, SendResult, ClusterInput } from "./types.js"

const COMPUTE_UNIT_BUFFER = 1.1
const DEFAULT_COMPUTE_UNIT_LIMIT = 200_000

// ─── Hook types ───────────────────────────────────────────────────────────────

export type TxHook =
  | "simulate" | "sign" | "send" | "confirm" | "retry" | "error"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HookFn = (data: any) => void | Promise<void> | boolean | Promise<boolean>

// ─── Fee strategy types ───────────────────────────────────────────────────────

type FeeStrategy =
  | "auto"
  | "low"
  | "medium"
  | "high"
  | "veryHigh"

interface TxBuilderState {
  feePayer: TransactionSigner
  instructions: Instruction[]
  computeUnitLimit: number | undefined
  computeUnitPrice: bigint | undefined
  latestBlockhash: LatestBlockhash | undefined
  lookupTables: Address[]
  jitoTip: bigint | undefined
  jitoEngine: string | undefined
  feeStrategy: FeeStrategy | undefined
  cluster: ClusterInput
  rpc: RpcConnection
  rpcSubscriptions: RpcSubscriptionsConnection
  hooks: Map<TxHook, HookFn[]>
}

type RpcConnection = ReturnType<typeof import("@solana/kit").createSolanaRpc>
type RpcSubscriptionsConnection = ReturnType<typeof import("@solana/kit").createSolanaRpcSubscriptions>

// ─── TxBuilder ────────────────────────────────────────────────────────────────

export class TxBuilder {
  private readonly state: TxBuilderState

  constructor(state: TxBuilderState) {
    this.state = state
  }

  // ── Fee modifiers ───────────────────────────────────────────────────────────

  /**
   * Set priority fee. One method, three modes:
   *   .withFee(1000n)         — explicit microLamports
   *   .withFee("high")        — dynamic percentile
   *   .withFee("auto")        — let Inosuke decide (default)
   *
   * Also accepts a config object:
   *   .withFee({ strategy: "percentile", level: "high", floor: 500n })
   */
  withFee(
    fee: bigint | FeeStrategy | { strategy: "explicit"; value: bigint } | { strategy: "percentile"; level: FeeStrategy extends "auto" ? never : FeeStrategy & string; floor?: bigint }
  ): TxBuilder {
    if (typeof fee === "bigint") {
      return new TxBuilder({ ...this.state, computeUnitPrice: fee, feeStrategy: undefined })
    }
    if (typeof fee === "string") {
      if (fee === "auto") {
        return new TxBuilder({ ...this.state, feeStrategy: "auto" })
      }
      return new TxBuilder({ ...this.state, feeStrategy: fee as FeeStrategy, computeUnitPrice: undefined })
    }
    if (fee.strategy === "explicit") {
      return new TxBuilder({ ...this.state, computeUnitPrice: fee.value, feeStrategy: undefined })
    }
    return new TxBuilder({ ...this.state, feeStrategy: fee.level as FeeStrategy, computeUnitPrice: undefined })
  }

  // ── Compute modifier ────────────────────────────────────────────────────────

  withCompute(units: number): TxBuilder {
    return new TxBuilder({ ...this.state, computeUnitLimit: units })
  }

  // ── Instructions ────────────────────────────────────────────────────────────

  withInstructions(instructions: Instruction[]): TxBuilder {
    return new TxBuilder({
      ...this.state,
      instructions: [...this.state.instructions, ...instructions],
    })
  }

  // ── Fee payer ───────────────────────────────────────────────────────────────

  signedBy(signer: TransactionSigner): TxBuilder {
    return new TxBuilder({ ...this.state, feePayer: signer })
  }

  // ── Blockhash ───────────────────────────────────────────────────────────────

  withBlockhash(latestBlockhash: LatestBlockhash): TxBuilder {
    return new TxBuilder({ ...this.state, latestBlockhash })
  }

  // ── Lookup tables ────────────────────────────────────────────────────────────

  withLookup(address: Address): TxBuilder {
    return new TxBuilder({
      ...this.state,
      lookupTables: [...this.state.lookupTables, address],
    })
  }

  // ── Jito tip ─────────────────────────────────────────────────────────────────

  withTip(microLamports: bigint): TxBuilder {
    return new TxBuilder({ ...this.state, jitoTip: microLamports })
  }

  withJitoEngine(url: string): TxBuilder {
    return new TxBuilder({ ...this.state, jitoEngine: url })
  }

  // ── Lifecycle hooks ─────────────────────────────────────────────────────────

  on(
    event: "simulate",
    fn: (data: { unitsConsumed: number; logs: string[] }) => void | Promise<void>,
  ): TxBuilder
  on(
    event: "sign",
    fn: (data: { message: unknown }) => boolean | Promise<boolean>,
  ): TxBuilder
  on(
    event: "send",
    fn: (data: { signature: string }) => void | Promise<void>,
  ): TxBuilder
  on(
    event: "confirm",
    fn: (data: { signature: string; slot: bigint }) => void | Promise<void>,
  ): TxBuilder
  on(
    event: "retry",
    fn: (data: { attempt: number; reason: string }) => void | Promise<void>,
  ): TxBuilder
  on(
    event: "error",
    fn: (data: { error: Error }) => void | Promise<void>,
  ): TxBuilder
  on(event: TxHook | string, fn: HookFn): TxBuilder {
    const hooks = new Map(this.state.hooks)
    const existing = hooks.get(event as TxHook) ?? []
    hooks.set(event as TxHook, [...existing, fn])
    return new TxBuilder({ ...this.state, hooks })
  }

  // ── Estimate ─────────────────────────────────────────────────────────────────

  async estimate(): Promise<{
    computeUnits: number
    computeUnitPrice: bigint | null
    estimatedFee: bigint
  }> {
    const sim = await this.simulate()
    let price = this.state.computeUnitPrice ?? null
    if (price === null && this.state.feeStrategy) {
      price = await this._resolveDynamicFee()
    }
    const cu = Math.ceil(sim.unitsConsumed * COMPUTE_UNIT_BUFFER)
    const estFee = price ? BigInt(cu) * price : 0n
    return {
      computeUnits: cu,
      computeUnitPrice: price,
      estimatedFee: estFee,
    }
  }

  // ── Simulate ─────────────────────────────────────────────────────────────────

  async simulate(): Promise<{ unitsConsumed: number; logs: string[] }> {
    const { rpc, instructions } = this.state

    const blockhash = this.state.latestBlockhash
      ? this.state.latestBlockhash
      : (await rpc.getLatestBlockhash({ commitment: "confirmed" }).send()).value

    const message = await this._buildMessage(
      blockhash,
      DEFAULT_COMPUTE_UNIT_LIMIT,
    )

    const compiled = compileTransaction(message)
    const encoded = getBase64EncodedWireTransaction(compiled)

    const result = await rpc
      .simulateTransaction(
        encoded as Parameters<typeof rpc.simulateTransaction>[0],
        {
          encoding: "base64",
          replaceRecentBlockhash: true,
          commitment: "confirmed",
        },
      )
      .send()

    const { value } = result
    const logs = (value.logs ?? []) as string[]

    if (value.err !== null) {
      const reason =
        parseSimulationLogs(logs) ??
        `Transaction simulation failed: ${JSON.stringify(value.err)}`
      throw new SimulationError(reason, logs)
    }

    const unitsConsumed = Number(value.unitsConsumed ?? DEFAULT_COMPUTE_UNIT_LIMIT)

    debug(() => `simulate: ${instructions.length} ix, ${unitsConsumed} CU consumed`, "debug")

    for (const fn of this.state.hooks.get("simulate") ?? []) {
      await (fn as (data: { unitsConsumed: number; logs: string[] }) => void)({ unitsConsumed, logs })
    }

    return { unitsConsumed, logs }
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  async send(options: SendOptions = {}): Promise<SendResult> {
    const {
      maxRetries = 3,
      commitment = "confirmed",
      skipPreflight = false,
    } = options

    const { rpc, rpcSubscriptions } = this.state

    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
      rpc: rpc as Parameters<typeof sendAndConfirmTransactionFactory>[0]["rpc"],
      rpcSubscriptions: rpcSubscriptions as Parameters<typeof sendAndConfirmTransactionFactory>[0]["rpcSubscriptions"],
    })

    let retries = 0

    while (retries <= maxRetries) {
      let latestBlockhash: LatestBlockhash
      if (this.state.latestBlockhash) {
        latestBlockhash = this.state.latestBlockhash
      } else {
        const { value } = await rpc
          .getLatestBlockhash({ commitment: "confirmed" })
          .send()
        latestBlockhash = value
      }

      let computeUnitLimit = this.state.computeUnitLimit

      if (computeUnitLimit === undefined && !skipPreflight) {
        const sim = await this.simulate()
        computeUnitLimit = Math.ceil(sim.unitsConsumed * COMPUTE_UNIT_BUFFER)
      }

      let resolvedPriorityFee = this.state.computeUnitPrice

      if (resolvedPriorityFee === undefined && this.state.feeStrategy !== undefined && this.state.feeStrategy !== "auto") {
        resolvedPriorityFee = await this._resolveDynamicFee()
        debug(() => `dynamic fee resolved: ${resolvedPriorityFee} microLamports (${this.state.feeStrategy})`, "debug")
      }

      const message = await this._buildMessage(latestBlockhash, computeUnitLimit, resolvedPriorityFee)

      for (const fn of this.state.hooks.get("sign") ?? []) {
        const shouldContinue = await (fn as (data: { message: unknown }) => boolean | Promise<boolean>)({ message })
        if (shouldContinue === false) {
          throw new Error("Transaction signing was aborted by a sign hook")
        }
      }

      const signed = await signTransactionMessageWithSigners(message)
      assertIsTransactionWithBlockhashLifetime(signed)
      const signature = getSignatureFromTransaction(signed)

      debug(() => `sending: ${signature.slice(0, 12)}...`, "info")

      for (const fn of this.state.hooks.get("send") ?? []) {
        await (fn as (data: { signature: string }) => void)({ signature })
      }

      try {
        if (this.state.jitoTip !== undefined) {
          let jitoUrl = this.state.jitoEngine
          if (!jitoUrl) {
            const cluster = this.state.cluster
            if (cluster === "mainnet") {
              jitoUrl = "https://mainnet.block-engine.jito.wtf/api/v1/transactions"
            } else if (cluster === "devnet") {
              jitoUrl = "https://dallas.mainnet.block-engine.jito.wtf/api/v1/transactions"
            } else {
              throw new Error(`Jito is not supported on cluster: ${cluster}.`)
            }
          }

          const encodedTx = getBase64EncodedWireTransaction(signed)
          const response = await fetch(jitoUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "sendTransaction",
              params: [encodedTx, { encoding: "base64" }]
            })
          })

          if (!response.ok) {
            throw new Error(`Jito Bundle Error: ${await response.text()}`)
          }

          let confirmed = false
          const targetStatuses: string[] = [commitment]
          if (commitment === "processed") {
            targetStatuses.push("confirmed", "finalized")
          } else if (commitment === "confirmed") {
            targetStatuses.push("finalized")
          }

          for (let i = 0; i < 30; i++) {
            await sleep(Math.min(1000 + i * 200, 5000))
            const sigStatus = await rpc.getSignatureStatuses([signature]).send()
            const status = sigStatus.value[0]
            if (status) {
              if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
              if (status.confirmationStatus && targetStatuses.includes(status.confirmationStatus)) {
                confirmed = true
                break
              }
            }
          }
          if (!confirmed) throw new Error("Jito transaction timeout")
        } else {
          await sendAndConfirmTransaction(signed, { commitment })
        }

        const sigStatus = await rpc
          .getSignatureStatuses([signature])
          .send()

        const slot = sigStatus.value[0]?.slot ?? 0n

        debug(() => `confirmed: ${signature.slice(0, 12)}... slot ${slot}`, "info")

        for (const fn of this.state.hooks.get("confirm") ?? []) {
          await (fn as (data: { signature: string; slot: bigint }) => void)({ signature, slot })
        }

        return {
          signature,
          slot,
          retries,
          commitment,
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)

        const isExpired =
          msg.includes("BlockhashNotFound") ||
          msg.includes("block height exceeded") ||
          msg.includes("Blockhash not found")

        const isTransient =
          isExpired ||
          msg.includes("429") ||
          msg.includes("503") ||
          msg.includes("timeout") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ECONNREFUSED") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("fetch failed")

        if (isTransient && retries < maxRetries) {
          retries++
          await sleep(500 * retries)

          debug(() => `retry ${retries}/${maxRetries}: ${isExpired ? "blockhash expired" : msg}`, "warn")

          if (isExpired) {
            for (const fn of this.state.hooks.get("retry") ?? []) {
              await (fn as (data: { attempt: number; reason: string }) => void)({ attempt: retries, reason: "blockhash expired" })
            }
          } else {
            for (const fn of this.state.hooks.get("retry") ?? []) {
              await (fn as (data: { attempt: number; reason: string }) => void)({ attempt: retries, reason: msg })
            }
          }
          continue
        }

        if (isExpired) {
          throw new BlockhashExpiredError({ cause: e })
        }

        for (const fn of this.state.hooks.get("error") ?? []) {
          await (fn as (data: { error: Error }) => void)({ error: e instanceof Error ? e : new Error(msg) })
        }

        throw e
      }
    }

    throw new BlockhashExpiredError()
  }

  // ── Internal: resolve dynamic fee ───────────────────────────────────────────

  private async _resolveDynamicFee(): Promise<bigint> {
    const { rpc, instructions, feeStrategy } = this.state
    try {
      const accounts = instructions.flatMap(ix => ix.accounts?.map(acc => acc.address) || [])
      const uniqueAccounts = [...new Set(accounts)]
      const fees = await (rpc as any).getRecentPrioritizationFees(uniqueAccounts).send()

      if (fees && fees.length > 0) {
        const prices = fees
          .map((f: any) => BigInt(f.prioritizationFee))
          .sort((a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0))
        const percentile =
          feeStrategy === "low" ? 0.25 :
          feeStrategy === "medium" ? 0.50 :
          feeStrategy === "high" ? 0.75 : 0.95
        const index = Math.min(prices.length - 1, Math.floor(prices.length * percentile))
        const fee = prices[index] as bigint
        return fee < 1000n ? 1000n : fee
      }
    } catch {
      // Fall through to floor
    }
    return 1000n
  }

  // ── Internal: build message ─────────────────────────────────────────────────

  private async _buildMessage(
    blockhash: { blockhash: string; lastValidBlockHeight: bigint },
    computeUnitLimit: number | undefined,
    dynamicFeeOverride?: bigint,
  ) {
    const { feePayer, instructions, computeUnitPrice, lookupTables, rpc } = this.state
    const finalPrice = dynamicFeeOverride !== undefined ? dynamicFeeOverride : computeUnitPrice

    let message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          blockhash as TransactionMessageWithBlockhashLifetime["lifetimeConstraint"],
          tx,
        ),
      (tx) => {
        if (computeUnitLimit !== undefined) {
          return appendTransactionMessageInstruction(
            getSetComputeUnitLimitInstruction({ units: computeUnitLimit }),
            tx,
          )
        }
        return tx
      },
      (tx) => {
        if (finalPrice !== undefined) {
          return appendTransactionMessageInstruction(
            getSetComputeUnitPriceInstruction({ microLamports: finalPrice }),
            tx,
          )
        }
        return tx
      },
      (tx) => appendTransactionMessageInstructions(instructions, tx),
      (tx) => {
        if (this.state.jitoTip !== undefined) {
          let tipAccounts: Address[]
          const cluster = this.state.cluster

          if (cluster === "devnet") {
            tipAccounts = [
              "2MCne6aF8UrwUeaZ1XSxt2ece9As5p1QZ8795G1Yt4rX",
              "3357rnCR5U4k18Ek2s5GmeeaQifXBnu4CjPcjzNq6pdx",
              "34M253jB7exA55K2g5jFfFphG16V39fDCL6Hwth2G1nZ",
              "35kZdfP5D4r6G8mG6P44jQ3s4n7G16fDCL6Hwth2G1na"
            ] as Address[]
          } else {
            tipAccounts = [
              "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
              "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
              "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
              "ADaUMid9yfUytqMBgopwjb2DTLSokTYR2xAWhqq2eBfe",
              "DfXygSm4jcyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjv",
              "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwTc53",
              "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeMgRwbb5Qz",
              "FKrPkTwrBGPUUe6bQ4r7UqD9E8N8VwP6E2qL6Fk121y",
            ] as Address[]
          }

          const randomTipAccount = tipAccounts[Math.floor(Math.random() * tipAccounts.length)]
          const tipIx = getTransferSolInstruction({
            source: feePayer,
            destination: randomTipAccount!,
            amount: this.state.jitoTip,
          })
          return appendTransactionMessageInstruction(tipIx, tx)
        }
        return tx
      }
    )

    if (lookupTables.length > 0) {
      const addressesByLookupTableAddress: Record<string, Address[]> = {}

      await Promise.all(
        lookupTables.map(async (address) => {
          const { data: { addresses } } = await fetchAddressLookupTable(rpc as any, address)
          addressesByLookupTableAddress[address] = addresses
        })
      )

      message = compressTransactionMessageUsingAddressLookupTables(
        message as any,
        addressesByLookupTableAddress as any
      ) as any
    }

    return message
  }
}

// ─── Standalone: build a transaction (builder-free) ───────────────────────────

export interface BuildTransactionOptions {
  feePayer: TransactionSigner
  instructions: Instruction[]
  latestBlockhash?: LatestBlockhash
  computeUnitLimit?: number
  computeUnitPrice?: bigint
  version?: 0 | "legacy"
}

/**
 * Build a transaction message without the fluent builder.
 * Returns raw kit types — you control signing, sending, everything.
 *
 * Unlike TxBuilder, this does NOT simulate or resolve fees.
 * Use prepareTransaction() for the auto-simulate step.
 *
 * @example
 * const tx = buildTransaction({ feePayer: kp.signer, instructions: [ix] })
 * const signed = await signTransactionMessageWithSigners(tx)
 */
export function buildTransaction(options: BuildTransactionOptions) {
  const { feePayer, instructions, latestBlockhash, computeUnitLimit, computeUnitPrice, version = 0 } = options

  return pipe(
    createTransactionMessage({ version }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => latestBlockhash
      ? setTransactionMessageLifetimeUsingBlockhash(latestBlockhash as TransactionMessageWithBlockhashLifetime["lifetimeConstraint"], tx)
      : tx,
    (tx) => computeUnitLimit !== undefined
      ? appendTransactionMessageInstruction(getSetComputeUnitLimitInstruction({ units: computeUnitLimit }), tx)
      : tx,
    (tx) => computeUnitPrice !== undefined
      ? appendTransactionMessageInstruction(getSetComputeUnitPriceInstruction({ microLamports: computeUnitPrice }), tx)
      : tx,
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  )
}

// ─── Standalone: prepare a transaction for sending ────────────────────────────

export interface PrepareOptions {
  rpc: RpcConnection
  computeUnitLimitMultiplier?: number
  computeUnitLimitReset?: boolean
  blockhashReset?: boolean
}

/**
 * Prepare a raw TransactionMessage for sending:
 * - Simulates to measure CU usage (if no compute limit set)
 * - Fetches fresh blockhash (if none set)
 * - Applies buffer on measured CUs
 *
 * Works on ANY TransactionMessage, not just ones from the builder.
 * Use this when you built the tx yourself with kit primitives.
 *
 * @example
 * const prepared = await prepareTransaction(rawTx, { rpc: client.rpc })
 */
export async function prepareTransaction(
  tx: ReturnType<typeof createTransactionMessage>,
  options: PrepareOptions,
) {
  const { rpc, computeUnitLimitMultiplier = 1.1, computeUnitLimitReset = false, blockhashReset = true } = options

  let current: any = tx

  // Ensure blockhash
  if (blockhashReset || !("lifetimeConstraint" in current)) {
    debug("preparing: fetching fresh blockhash", "debug")
    const { value: bh } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send()
    if (!("lifetimeConstraint" in current)) {
      current = setTransactionMessageLifetimeUsingBlockhash(bh, current)
    } else {
      current = Object.freeze({ ...current, lifetimeConstraint: bh })
    }
  }

  // Ensure compute limit via simulation
  const existingLimit = current.instructions?.some?.((ix: Instruction) => ix.programAddress === "ComputeBudget111111111111111111111111111111") ?? false

  if (!existingLimit || computeUnitLimitReset) {
    debug("preparing: simulating for CU estimation", "debug")
    const simMsg = compileTransaction(current)
    const simEncoded = getBase64EncodedWireTransaction(simMsg)
    const simResult = await (rpc as any).simulateTransaction(simEncoded, {
      encoding: "base64",
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    }).send()

    const units = Number(simResult.value?.unitsConsumed ?? DEFAULT_COMPUTE_UNIT_LIMIT)
    const withBuffer = Math.ceil(units * computeUnitLimitMultiplier)
    debug(() => `prepared: ${units} CU measured → ${withBuffer} with ${computeUnitLimitMultiplier}x buffer`, "debug")

    current = appendTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units: withBuffer }),
      current,
    )
  }

  return current
}

