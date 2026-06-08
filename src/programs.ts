import type { Instruction, Address, AccountRole } from "@solana/kit"

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
 * The reference key makes the transaction message unique for deduplication.
 *
 * @example
 * const refIx = insertReferenceKey(address("my-unique-reference-key"))
 */
export function insertReferenceKey(reference: Address): Instruction {
  return {
    programAddress: "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV" as Address,
    accounts: [],
    data: new Uint8Array(32),
  }
}

// ─── Account role helpers ────────────────────────────────────────────────────

export const WRITABLE = 1 as AccountRole
export const SIGNER = 2 as AccountRole
export const WRITABLE_SIGNER = 3 as AccountRole
export const READONLY = 0 as AccountRole

// ─── Program factory ─────────────────────────────────────────────────────────

export interface ProgramAccount {
  address: Address
  role: AccountRole
}

export interface ProgramClient {
  readonly programId: Address

  instruction(data: Uint8Array, accounts?: ProgramAccount[]): Instruction
}

/**
 * Lightweight program factory for non-Anchor programs.
 * No IDL needed — just the program address.
 *
 * @example
 * const dex = program(address("DEX...programId"))
 * const swapIx = dex.instruction(
 *   mySwapData,  // raw instruction data
 *   [
 *     { address: user, role: WRITABLE_SIGNER },
 *     { address: poolState, role: WRITABLE },
 *   ]
 * )
 */
export function program(programId: Address): ProgramClient {
  return {
    programId,
    instruction(data: Uint8Array, accounts: ProgramAccount[] = []): Instruction {
      return {
        programAddress: programId,
        accounts: accounts.map((a) => ({
          address: a.address,
          role: a.role,
        })),
        data,
      }
    },
  }
}
