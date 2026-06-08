import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system"
import type { Instruction, TransactionSigner, Address, KeyPairSigner } from "@solana/kit"

export interface TransferSolOptions {
  from: TransactionSigner
  to: Address
  amount: bigint
}

export function transferSol(options: TransferSolOptions): { instructions: Instruction[] } {
  const { from, to, amount } = options
  const instructions: Instruction[] = [
    getTransferSolInstruction({ source: from, destination: to, amount }),
  ]
  return { instructions }
}

// ─── SystemProgram namespace ──────────────────────────────────────────────────

export interface CreateAccountOptions {
  from: TransactionSigner
  newAccount: KeyPairSigner
  lamports: bigint
  space: bigint
  programId: Address
}

export const SystemProgram = {
  /**
   * Transfer native SOL between wallets.
   */
  transfer(options: TransferSolOptions): Instruction {
    return getTransferSolInstruction({
      source: options.from,
      destination: options.to,
      amount: options.amount,
    })
  },

  /**
   * Create a new account owned by a program.
   * The classic rent deposit + account allocation in one instruction.
   */
  createAccount(options: CreateAccountOptions): Instruction {
    return getCreateAccountInstruction({
      payer: options.from,
      newAccount: options.newAccount,
      lamports: options.lamports,
      space: options.space,
      programAddress: options.programId,
    })
  },
}
