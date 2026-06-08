import {
  airdropFactory,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  lamports,
} from "@solana/kit"
import type { Instruction, TransactionSigner, Address, Signature, RpcDevnet, SolanaRpcApiDevnet, RpcSubscriptionsDevnet, SolanaRpcSubscriptionsApi } from "@solana/kit"
import { InvalidClusterError } from "./errors.js"
import { TxBuilder, prepareTransaction } from "./transaction.js"
import type { PrepareOptions } from "./transaction.js"
import { IdlProgram } from "./idl.js"
import { rpcUrl, wsUrl } from "./utils.js"
import type {
  ClusterInput,
  ClusterMoniker,
  LatestBlockhash,
  SendOptions,
  SendResult,
} from "./types.js"

// URL resolution

const VALID_MONIKERS = new Set<ClusterMoniker>([
  "mainnet", "devnet", "testnet", "localnet",
])

function isClusterMoniker(value: string): value is ClusterMoniker {
  return VALID_MONIKERS.has(value as ClusterMoniker)
}

function resolveUrls(input: ClusterInput): {
  httpUrl: string
  wsEndpoint: string
} {
  if (isClusterMoniker(input)) {
    return {
      httpUrl: rpcUrl(input),
      wsEndpoint: wsUrl(input),
    }
  }

  try {
    const url = new URL(input)
    if (!url.protocol.match(/^https?:/i)) {
      throw new InvalidClusterError(input)
    }
    const wsUrl = new URL(input)
    wsUrl.protocol = wsUrl.protocol.replace("http", "ws")
    return {
      httpUrl: url.toString(),
      wsEndpoint: wsUrl.toString(),
    }
  } catch (e) {
    if (e instanceof InvalidClusterError) throw e
    throw new InvalidClusterError(input)
  }
}

// InosukeClient

export class InosukeClient {
  readonly rpc: ReturnType<typeof createSolanaRpc>
  readonly rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>
  readonly cluster: ClusterInput

  constructor(
    rpc: ReturnType<typeof createSolanaRpc>,
    rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
    cluster: ClusterInput,
  ) {
    this.rpc = rpc
    this.rpcSubscriptions = rpcSubscriptions
    this.cluster = cluster
  }

  // Transaction entry points

  /**
   * Start building a transaction with the fluent builder.
   */
  buildTx(options: {
    feePayer: TransactionSigner
    instructions: Instruction[]
    computeUnitLimit?: number
    computeUnitPrice?: bigint
    latestBlockhash?: LatestBlockhash
  }): TxBuilder {
    return new TxBuilder({
      feePayer: options.feePayer,
      instructions: options.instructions,
      computeUnitLimit: options.computeUnitLimit,
      computeUnitPrice: options.computeUnitPrice,
      latestBlockhash: options.latestBlockhash,
      lookupTables: [],
      jitoTip: undefined,
      jitoEngine: undefined,
      feeStrategy: undefined,
      hooks: new Map(),
      cluster: this.cluster,
      rpc: this.rpc,
      rpcSubscriptions: this.rpcSubscriptions,
    })
  }

  /**
   * Send instructions with a fast one-liner. For simple cases.
   */
  send(
    ...instructions: (Instruction | Instruction[])[]
  ): {
    signedBy(signer: TransactionSigner): TxBuilder
  } {
    const flat: Instruction[] = []
    for (const item of instructions) {
      if (Array.isArray(item)) flat.push(...item)
      else flat.push(item)
    }
    const self = this
    return {
      signedBy(signer: TransactionSigner): TxBuilder {
        return new TxBuilder({
          feePayer: signer,
          instructions: flat,
          computeUnitLimit: undefined,
          computeUnitPrice: undefined,
          latestBlockhash: undefined,
          lookupTables: [],
          jitoTip: undefined,
          jitoEngine: undefined,
          feeStrategy: undefined,
          hooks: new Map(),
          cluster: self.cluster,
          rpc: self.rpc,
          rpcSubscriptions: self.rpcSubscriptions,
        })
      }
    }
  }

  /**
   * Send a transaction directly with options. For simple cases.
   */
  async sendTransaction(
    instructions: Instruction[],
    options: {
      feePayer: TransactionSigner
      signers?: TransactionSigner[]
      dynamicPriorityFee?: "low" | "medium" | "high" | "veryHigh"
      priorityFee?: bigint
      computeLimit?: number
      jitoTip?: bigint
      lookupTables?: Address[]
      skipPreflight?: boolean
      maxRetries?: number
      commitment?: "processed" | "confirmed" | "finalized"
    }
  ): Promise<SendResult> {
    let builder = new TxBuilder({
      feePayer: options.feePayer,
      instructions,
      computeUnitLimit: options.computeLimit,
      computeUnitPrice: options.priorityFee,
      latestBlockhash: undefined,
      lookupTables: options.lookupTables ?? [],
      jitoTip: options.jitoTip,
      jitoEngine: undefined,
      feeStrategy: options.dynamicPriorityFee,
      hooks: new Map(),
      cluster: this.cluster,
      rpc: this.rpc,
      rpcSubscriptions: this.rpcSubscriptions,
    })

    const sendOpts: SendOptions = {}
    if (options.maxRetries !== undefined) sendOpts.maxRetries = options.maxRetries
    if (options.commitment !== undefined) sendOpts.commitment = options.commitment
    if (options.skipPreflight !== undefined) sendOpts.skipPreflight = options.skipPreflight
    return builder.send(sendOpts)
  }

  // ─── RPC query methods ─────────────────────────────────────────────────────

  async balance(address: Address): Promise<bigint> {
    const result = await this.rpc
      .getBalance(address, { commitment: "confirmed" })
      .send()
    return result.value
  }

  async blockhash(): Promise<LatestBlockhash> {
    const result = await this.rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send()
    return result.value
  }

  async rentFor(dataSize: number): Promise<bigint> {
    const result = await this.rpc
      .getMinimumBalanceForRentExemption(BigInt(dataSize), {
        commitment: "confirmed",
      })
      .send()
    return result
  }

  async tokenBalance(tokenAccount: Address): Promise<bigint> {
    const result = await this.rpc
      .getTokenAccountBalance(tokenAccount, { commitment: "confirmed" })
      .send()
    return BigInt(result.value.amount)
  }

  async tokenBalanceByOwner(mint: Address, owner: Address, tokenProgram?: Address): Promise<bigint> {
    const { getAta } = await import("./token.js")
    const ata = await getAta(mint, owner, tokenProgram)
    try {
      return await this.tokenBalance(ata)
    } catch {
      return 0n
    }
  }

  async mintInfo(mint: Address): Promise<{ supply: bigint; decimals: number }> {
    const result = await this.rpc
      .getTokenSupply(mint, { commitment: "confirmed" })
      .send()
    return {
      supply: BigInt(result.value.amount),
      decimals: result.value.decimals
    }
  }

  async tokenMetadata(mint: Address): Promise<{ name: string; symbol: string; uri: string } | null> {
    const { findPda } = await import("./utils.js")
    const { getAddressEncoder, getBase64Encoder } = await import("@solana/kit")

    const metaplexProgramId = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" as Address
    const pda = await findPda(metaplexProgramId, [
      "metadata",
      getAddressEncoder().encode(metaplexProgramId),
      getAddressEncoder().encode(mint)
    ])

    const account = await this.rpc.getAccountInfo(pda, { encoding: "base64" }).send()
    if (!account.value) return null

    const rawBytes = getBase64Encoder().encode(account.value.data[0])
    const textDecoder = new TextDecoder()

    const name = textDecoder.decode(rawBytes.subarray(69, 69 + 32)).replace(/\0/g, "").trim()
    const symbol = textDecoder.decode(rawBytes.subarray(105, 105 + 10)).replace(/\0/g, "").trim()
    const uri = textDecoder.decode(rawBytes.subarray(119, 119 + 200)).replace(/\0/g, "").trim()

    return { name, symbol, uri }
  }

  async signatureStatuses(signatures: Signature[]): Promise<Array<{ slot: bigint; confirmationStatus: string; err: any } | null>> {
    const result = await this.rpc.getSignatureStatuses(signatures).send()
    return result.value.map((v: any) => v ? {
      slot: v.slot ?? 0n,
      confirmationStatus: v.confirmationStatus ?? "processed",
      err: v.err,
    } : null)
  }

  async accountInfo(address: Address): Promise<{ data: Uint8Array; owner: Address; lamports: bigint } | null> {
    const result = await this.rpc.getAccountInfo(address, { encoding: "base64" }).send()
    if (!result.value) return null
    const { getBase64Encoder } = await import("@solana/kit")
    const raw = getBase64Encoder().encode(result.value.data[0])
    return {
      data: new Uint8Array(raw),
      owner: result.value.owner as Address,
      lamports: result.value.lamports,
    }
  }

  async multipleAccounts(addresses: Address[]): Promise<Array<{ data: Uint8Array; owner: Address; lamports: bigint } | null>> {
    const result = await (this.rpc as any).getMultipleAccounts(addresses, { encoding: "base64" }).send()
    const { getBase64Encoder } = await import("@solana/kit")
    return result.value.map((v: any) => {
      if (!v) return null
      const raw = getBase64Encoder().encode(v.data[0])
      return {
        data: new Uint8Array(raw),
        owner: v.owner as Address,
        lamports: v.lamports,
      }
    })
  }

  async blockHeight(): Promise<bigint> {
    const result = await this.rpc.getBlockHeight({ commitment: "confirmed" }).send()
    return result
  }

  async transaction(signature: Signature): Promise<any | null> {
    const result = await (this.rpc as any).getTransaction(signature, {
      commitment: "confirmed",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    }).send()
    return result
  }

  async confirm(signature: Signature, commitment?: "processed" | "confirmed" | "finalized"): Promise<void> {
    const target = commitment ?? "confirmed"
    const { sleep } = await import("./utils.js")
    for (let i = 0; i < 30; i++) {
      const statuses = await this.signatureStatuses([signature])
      const status = statuses[0]
      if (status && status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
      if (status && (
        (target === "processed") ||
        (target === "confirmed" && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) ||
        (target === "finalized" && status.confirmationStatus === "finalized")
      )) {
        return
      }
      await sleep(1000)
    }
    throw new Error(`Confirmation timeout for ${signature}`)
  }

  async airdrop(address: Address, lamports_amount: bigint): Promise<void> {
    const airdrop = airdropFactory({
      rpc: this.rpc as RpcDevnet<SolanaRpcApiDevnet>,
      rpcSubscriptions: this.rpcSubscriptions as RpcSubscriptionsDevnet<SolanaRpcSubscriptionsApi>,
    })
    await airdrop({
      recipientAddress: address,
      lamports: lamports(lamports_amount),
      commitment: "confirmed",
    })
  }

  // ─── Anchor IDL ─────────────────────────────────────────────────────────────

  loadProgram(address: Address, idl: any): IdlProgram {
    return new IdlProgram(address, idl, this.rpc)
  }

  // ─── Prepare (standalone) ───────────────────────────────────────────────────

  /**
   * Prepare a raw transaction for sending — simulates CUs, fetches blockhash.
   * The builder-free path. Works on any TransactionMessage.
   */
  async prepare(tx: ReturnType<typeof import("@solana/kit").createTransactionMessage>, opts?: {
    computeUnitLimitMultiplier?: number
    computeUnitLimitReset?: boolean
    blockhashReset?: boolean
  }) {
    const { prepareTransaction } = await import("./transaction.js")
    const config: PrepareOptions = { rpc: this.rpc as any }
    if (opts?.computeUnitLimitMultiplier !== undefined) config.computeUnitLimitMultiplier = opts.computeUnitLimitMultiplier
    if (opts?.computeUnitLimitReset !== undefined) config.computeUnitLimitReset = opts.computeUnitLimitReset
    if (opts?.blockhashReset !== undefined) config.blockhashReset = opts.blockhashReset
    return prepareTransaction(tx, config)
  }

  // ─── Token factory ──────────────────────────────────────────────────────────

  async token(mint: Address, tokenProgram?: Address | "legacy" | "2022"): Promise<TokenClient> {
    let program: Address
    if (typeof tokenProgram === "string" && tokenProgram !== "2022" && tokenProgram !== "legacy") {
      program = tokenProgram
    } else if (tokenProgram === "2022") {
      program = await resolveToken2022ProgramAddress()
    } else {
      program = await resolveTokenProgramAddress()
    }
    return new TokenClient(this, mint, program)
  }
}

// ─── Module-level cache for program addresses ────────────────────────────────

let _tokenProgramAddress: Address | null = null

async function resolveTokenProgramAddress(): Promise<Address> {
  if (_tokenProgramAddress) return _tokenProgramAddress
  const mod = await import("@solana-program/token")
  _tokenProgramAddress = mod.TOKEN_PROGRAM_ADDRESS
  return _tokenProgramAddress
}

let _token2022ProgramAddress: Address | null = null

async function resolveToken2022ProgramAddress(): Promise<Address> {
  if (_token2022ProgramAddress) return _token2022ProgramAddress
  _token2022ProgramAddress = (await import("./token.js")).TOKEN_2022_PROGRAM_ADDRESS
  return _token2022ProgramAddress
}

// ─── TokenClient ──────────────────────────────────────────────────────────────

export class TokenClient {
  readonly client: InosukeClient
  readonly mint: Address
  readonly programAddress: Address

  constructor(client: InosukeClient, mint: Address, programAddress: Address) {
    this.client = client
    this.mint = mint
    this.programAddress = programAddress
  }

  async info(): Promise<{ supply: bigint; decimals: number }> {
    return this.client.mintInfo(this.mint)
  }

  async balance(owner: Address): Promise<bigint> {
    return this.client.tokenBalanceByOwner(this.mint, owner, this.programAddress)
  }

  async transfer(sender: TransactionSigner, to: Address, amount: bigint, opts?: { payer?: TransactionSigner; decimals?: number; skipAtaCreation?: boolean }): Promise<Instruction[]> {
    const { transferToken } = await import("./token.js")
    const payer = opts?.payer ?? sender
    const decimals = opts?.decimals ?? (await this.info()).decimals
    const skipAta = opts?.skipAtaCreation === undefined ? undefined : opts.skipAtaCreation
    const { instructions } = await transferToken({
      mint: this.mint,
      from: sender,
      to,
      amount,
      decimals,
      payer,
      ...(skipAta !== undefined ? { skipAtaCreation: skipAta } : {}),
      tokenProgram: this.programAddress,
    } as any)
    return instructions
  }

  async mintTo(recipient: Address, authority: TransactionSigner, amount: bigint): Promise<Instruction[]> {
    const { mintMore } = await import("./token.js")
    const { instructions } = await mintMore({
      mint: this.mint,
      authority,
      recipient,
      amount,
      tokenProgram: this.programAddress,
    })
    return instructions
  }

  async burn(owner: TransactionSigner, amount: bigint, decimals?: number): Promise<Instruction[]> {
    const { burnToken } = await import("./token.js")
    const dec = decimals ?? (await this.info()).decimals
    const { instructions } = await burnToken({
      mint: this.mint,
      owner,
      amount,
      decimals: dec,
      tokenProgram: this.programAddress,
    })
    return instructions
  }
}

// connect

export function connect(cluster: ClusterInput): InosukeClient {
  if (!cluster) throw new InvalidClusterError(String(cluster))

  const { httpUrl, wsEndpoint } = resolveUrls(cluster)

  const rpc = createSolanaRpc(httpUrl)
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsEndpoint)

  return new InosukeClient(rpc, rpcSubscriptions, cluster)
}
