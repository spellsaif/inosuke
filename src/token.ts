import {
  generateKeyPairSigner
} from "@solana/kit"
import type { Address, Instruction, TransactionSigner } from "@solana/kit"
import {
  TOKEN_PROGRAM_ADDRESS,
  getInitializeMintInstruction,
  getMintToInstruction,
  getTransferCheckedInstruction,
  getBurnCheckedInstruction,
  getMintSize,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync
} from "@solana-program/token"
import { getCreateAccountInstruction } from "@solana-program/system"
import type {
  MintTokenOptions,
  TransferTokenOptions,
  BurnTokenOptions,
} from "./types.js"

// Constants 

/**
 * Size of a Mint account in bytes.
 *
 * Why do we need this? When creating an account on Solana,
 * you must tell the runtime how many bytes to allocate.
 * The Token Program defines mint accounts as exactly 82 bytes.
 * We use this to calculate the rent deposit required.
 */
export const MINT_SIZE = getMintSize();

/**
 * Size of a Token account in bytes.
 *
 * Token accounts (including ATAs) are always 165 bytes.
 * Used to calculate rent for new token accounts.
 */
export const TOKEN_ACCOUNT_SIZE = 165

// mintToken

/**
 * Build instructions to create a new SPL token mint.
 *
 * Returns TWO instructions that must go in the same transaction:
 * 1. createAccount  — allocates space and deposits rent on-chain
 * 2. initializeMint — tells the Token Program this is a mint
 *
 * Why two instructions? Creating an account and initializing it
 * are separate operations on Solana. The runtime creates raw
 * account space — the Token Program then stamps it as a mint.
 * Both in the same transaction means they either both succeed
 * or both fail — you never get a created-but-uninitialized mint.
 *
 * @example
 * const { instructions, mint } = await mintToken({
 *   decimals: 9,
 *   authority: signer,
 *   rentFor: (size) => client.rentFor(size),
 * })
 *
 * const result = await client
 *   .buildTx({ feePayer: signer, instructions })
 *   .send()
 *
 * console.log(mint.address) // your new mint address
 */

export async function mintToken(
  options: MintTokenOptions & {
    rentFor: (dataSize: number) => Promise<bigint>
  },
): Promise<{ instructions: Instruction[]; mint: TransactionSigner }> {
  const { decimals, authority, freezeAuthority, rentFor } = options
  const mint = options.mint ?? (await generateKeyPairSigner())
  const lamports = await rentFor(MINT_SIZE)

  const instructions: Instruction[] = [
    getCreateAccountInstruction({
      payer: authority,
      newAccount: mint,
      lamports,
      space: MINT_SIZE,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction({
      mint: mint.address,
      decimals,
      mintAuthority: authority.address,
      freezeAuthority: freezeAuthority ?? null,
    }),
  ]

  return { instructions, mint }
}

// mintMore 

/**
 * Build instructions to mint tokens to a recipient.
 *
 * "mintMore" = increase supply by creating new tokens.
 * Only the mint authority can call this.
 *
 * Automatically creates the recipient's ATA if it doesn't exist.
 * Safe to call even if the ATA already exists (idempotent).
 *
 * @example
 * const { instructions } = await mintMore({
 *   mint: mint.address,
 *   authority: signer,
 *   recipient: recipientAddress,
 *   amount: 1_000_000_000n, // 1 token with 9 decimals
 * })
 */
export async function mintMore(options: {
  mint: Address
  authority: TransactionSigner
  recipient: Address
  amount: bigint
}): Promise<{ instructions: Instruction[] }> {
  const { mint, authority, recipient, amount } = options

  const instructions: Instruction[] = [
    await getCreateAssociatedTokenInstructionAsync({
      payer: authority,
      owner: recipient,
      mint,
    }),
    getMintToInstruction({
      mint,
      token: (await findAssociatedTokenPda({  mint,
  owner: recipient,
  tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0],
      mintAuthority: authority,
      amount,
    }),
  ]

  return { instructions }
}


// transferToken 
/**
 * Build instructions to transfer tokens between wallets.
 *
 * You pass WALLET addresses (not token account addresses).
 * We derive the ATAs automatically.
 *
 * Creates the recipient's ATA if it doesn't exist.
 *
 * Why transferChecked instead of transfer?
 * transferChecked requires you to specify the decimals.
 * This prevents accidentally sending the wrong amount due to
 * a decimals mismatch. It's the safer, recommended instruction.
 *
 * @example
 * const { instructions } = await transferToken({
 *   mint: mintAddress,
 *   from: senderSigner,
 *   to: recipientWalletAddress,
 *   amount: 500_000_000n,   // 0.5 tokens with 9 decimals
 *   decimals: 9,
 *   payer: senderSigner,
 * })
 */
export async function transferToken(
  options: TransferTokenOptions & {
    payer: TransactionSigner
    // Skip ATA creation if you know it already exists
    skipAtaCreation?: boolean
  },
): Promise<{ instructions: Instruction[] }> {
  const { mint, from, to, amount, decimals, payer, skipAtaCreation } = options

  const [sourceAta]      = await findAssociatedTokenPda({
    mint, owner: from.address, tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const [destinationAta] = await findAssociatedTokenPda({
    mint, owner: to, tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })

  const instructions: Instruction[] = []

  // Only add ATA creation if not explicitly skipped
  if (!skipAtaCreation) {
    instructions.push(
      await getCreateAssociatedTokenInstructionAsync({
        payer,
        owner: to,
        mint,
      }),
    )
  }

  instructions.push(
    getTransferCheckedInstruction({
      source: sourceAta,
      mint,
      destination: destinationAta,
      authority: from,
      amount,
      decimals,
    }),
  )

  return { instructions }
}

// burnToken

/**
 * Build instructions to burn tokens.
 *
 * Burning permanently removes tokens from circulation.
 * Decreases the owner's balance and the mint's total supply.
 * Cannot be undone.
 *
 * @example
 * const { instructions } = await burnToken({
 *   mint: mintAddress,
 *   owner: signer,
 *   amount: 100_000_000n,  // 0.1 tokens with 9 decimals
 *   decimals: 9,
 * })
 */
export async function burnToken(
  options: BurnTokenOptions,
): Promise<{ instructions: Instruction[] }> {
  const { mint, owner, amount, decimals } = options

  const [tokenAccount] = await findAssociatedTokenPda({ mint, owner: owner.address, tokenProgram: TOKEN_PROGRAM_ADDRESS })

  const instructions: Instruction[] = [
    getBurnCheckedInstruction({
      account: tokenAccount,
      mint,
      authority: owner,
      amount,
      decimals,
    }),
  ]

  return { instructions }
}


export async function getAta(mint: Address, owner: Address): Promise<Address> {
  const [address] = await findAssociatedTokenPda({ mint, owner, tokenProgram: TOKEN_PROGRAM_ADDRESS })
  return address
}

export function toRawAmount(uiAmount: number, decimals: number): bigint {
  return BigInt(Math.round(uiAmount * 10 ** decimals))
}

export function toUiAmount(rawAmount: bigint, decimals: number): number {
  return Number(rawAmount) / 10 ** decimals
}