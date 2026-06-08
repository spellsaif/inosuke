import type { Instruction, Address } from "@solana/kit"

/**
 * Build a Memo instruction — attach a human-readable note to a transaction.
 * Uses the SPL Memo Program (MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr).
 *
 * @example
 * const memoIx = addMemo("Payment for invoice #42")
 */
export function addMemo(message: string): Instruction {
  const data = new TextEncoder().encode(message)
  return {
    programAddress: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address,
    accounts: [],
    data,
  }
}

/**
 * Attach a unique reference key to a transaction.
 * Transaction message deduplication — Solana won't process the same tx twice
 * if no other fields changed, but a reference key makes uniqueness unambiguous.
 *
 * Uses a noop instruction that writes the key into an account not owned by any program.
 * The reference key itself is the instruction data.
 *
 * @example
 * const refIx = insertReferenceKey(address("my-unique-reference-key"))
 */
export function insertReferenceKey(reference: Address): Instruction {
  return {
    programAddress: "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV" as Address,
    accounts: [],
    data: new Uint8Array(32), // zero-filled — the reference IS the account key
  }
}
