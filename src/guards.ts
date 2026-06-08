import type { Address, TransactionSigner } from "@solana/kit"
import {
  assertIsTransactionSigner,
  createNoopSigner,
  isTransactionSigner,
} from "@solana/kit"

/**
 * Sanitize an Address-or-Signer input to a plain Address.
 * If a TransactionSigner is passed, its `.address` is extracted.
 */
export function asAddress<T extends string = string>(
  input: Address<T> | TransactionSigner<T>,
): Address<T> {
  return typeof input === "string" ? input : input.address
}

/**
 * Sanitize an Address-or-Signer input to a TransactionSigner.
 * If a plain Address is passed, a noop signer (signs nothing) is created.
 * Throws if the result is not a valid TransactionSigner.
 */
export function asSigner<T extends string = string>(
  input: Address<T> | TransactionSigner<T>,
): TransactionSigner<T> {
  if (typeof input === "string" || ("address" in (input as any)) === false) {
    input = createNoopSigner(input as Address<T>)
  }
  if (!isTransactionSigner(input)) {
    throw new Error("A signer or address is required")
  }
  assertIsTransactionSigner(input)
  return input
}
