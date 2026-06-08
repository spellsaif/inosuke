import type { Address } from "@solana/kit"

export const LAMPORTS_PER_SOL = 1_000_000_000n

export const Programs = {
  SYSTEM: "11111111111111111111111111111111" as Address,
  TOKEN: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address,
  TOKEN_2022: "TokenzQdBNbLqP5xxRZr67BG6RcrJtJC451X449n5cM" as Address,
  ASSOCIATED_TOKEN: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address,
  MEMO: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address,
  METAPLEX: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" as Address,
  COMPUTE_BUDGET: "ComputeBudget111111111111111111111111111111" as Address,
  ADDRESS_LOOKUP_TABLE: "AddressLookupTab1e1111111111111111111111111" as Address,
} as const
