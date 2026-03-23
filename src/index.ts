/**
 * Aura — Solana TypeScript library
 *
 * @example
 * import { connect, loadKeyFile, toSol, explorerUrl } from 'aura'
 *
 * const client = connect("devnet")
 * const signer = await loadKeyFile("~/.config/solana/id.json")
 *
 * const result = await client
 *   .buildTx({ feePayer: signer, instructions: [...] })
 *   .withPriorityFee(1000n)
 *   .send()
 *
 * console.log(explorerUrl(result.signature, "devnet"))
 */


export { connect, AuraClient } from "./client.js"


export { TxBuilder } from "./transaction.js"

export {
  generateKey,
  loadKey,
  loadKeyFile,
  saveKeyFile,
  keyFromBytes,
  toBase58,
} from "./keypair.js"

// Token 
export {
  mintToken,
  mintMore,
  transferToken,
  burnToken,
  getAta,
  toRawAmount,
  toUiAmount,
  MINT_SIZE,
  TOKEN_ACCOUNT_SIZE,
} from "./token.js"

// Utils
export {
  toSol,
  toLamports,
  explorerUrl,
  rpcUrl,
  wsUrl,
  truncate,
  // parseSimulationLogs and sleep are internal — not exported
} from "./utils.js"

// Errors
export {
  AuraError,
  SimulationError,
  ConfirmationError,
  BlockhashExpiredError,
  InsufficientFundsError,
  ComputeExceededError,
  InvalidClusterError,
  KeypairLoadError,
  isAuraError,
  hasErrorCode,
} from "./errors.js"

//  Types
export type {
  ClusterInput,
  ClusterMoniker,
  Commitment,
  SendResult,
  SendOptions,
  LatestBlockhash,
  MintTokenOptions,
  TransferTokenOptions,
  BurnTokenOptions,
} from "./types.js"