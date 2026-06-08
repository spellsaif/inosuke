/**
 * Inosuke — Solana TypeScript library
 *
 * @example
 * import { connect, Keypair, LAMPORTS_PER_SOL } from 'inosuke'
 *
 * const client = connect("devnet")
 * const kp = await Keypair.generate()
 *
 * await client
 *   .send([myIx])
 *   .signedBy(kp.signer)
 *   .withFee('high')
 */

export { connect, InosukeClient, TokenClient } from "./client.js"
export { address } from "@solana/kit"
export type { Address, KeyPairSigner, Signature, Instruction } from "@solana/kit"

export { TxBuilder, buildTransaction, prepareTransaction } from "./transaction.js"
export type { TxHook, BuildTransactionOptions, PrepareOptions } from "./transaction.js"
export { IdlProgram, getEncoderForIdlType, getDecoderForIdlType, getInstructionDiscriminator, getAccountDiscriminator } from "./idl.js"
export type { IdlInstructionOptions } from "./idl.js"

export { addressToBytes, addressFromBytes, validateAddress } from "./publickey.js"
export { Keypair } from "./keypair.js"
export { asAddress, asSigner } from "./guards.js"
export { debug, isDebugEnabled } from "./debug.js"
export {
  generateKey,
  generateExtractableKey,
  loadKey,
  loadKeyFile,
  saveKeyFile,
  keyFromBytes,
  toBase58,
} from "./keypair.js"

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
  TOKEN_2022_PROGRAM_ADDRESS,
} from "./token.js"

export { transferSol, SystemProgram } from "./system.js"
export type { TransferSolOptions, CreateAccountOptions } from "./system.js"

export { addMemo, insertReferenceKey, program, WRITABLE, SIGNER, WRITABLE_SIGNER, READONLY } from "./programs.js"
export type { ProgramAccount, ProgramClient } from "./programs.js"

export {
  toSol,
  toLamports,
  toSolDisplay,
  explorerUrl,
  rpcUrl,
  wsUrl,
  truncate,
  findPda,
  LAMPORTS_PER_SOL,
  getClusterFromGenesis,
} from "./utils.js"

export { Programs } from "./constants.js"

export {
  InosukeError,
  SimulationError,
  ConfirmationError,
  BlockhashExpiredError,
  InsufficientFundsError,
  ComputeExceededError,
  InvalidClusterError,
  KeypairLoadError,
  KeypairSaveError,
  isInosukeError,
  hasErrorCode,
} from "./errors.js"

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
