import { getTransferSolInstruction } from "@solana-program/system";
import type { Instruction, TransactionSigner, Address } from "@solana/kit";

export interface TransferSolOptions {
  from: TransactionSigner;
  to: Address;
  amount: bigint; // lamports
}

/**
 * Build instructions to transfer native SOL between wallets.
 *
 * @example
 * const { instructions } = transferSol({
 *   from: senderSigner,
 *   to: recipientAddress,
 *   amount: 1_000_000_000n, // 1 SOL
 * })
 */
export function transferSol(options: TransferSolOptions): { instructions: Instruction[] } {
  const { from, to, amount } = options;

  const instructions: Instruction[] = [
    getTransferSolInstruction({
      source: from,
      destination: to,
      amount,
    }),
  ];

  return { instructions };
}
