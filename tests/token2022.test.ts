import { describe, it, expect } from "vitest"
import {
  mintToken,
  mintMore,
  transferToken,
  burnToken,
  getAta,
  TOKEN_2022_PROGRAM_ADDRESS
} from "../src/token.js"
import { generateKey } from "../src/keypair.js"
import { Address, TOKEN_PROGRAM_ADDRESS } from "@solana/kit"

describe("Token-2022 Support", () => {
  it("mintToken uses TOKEN_2022_PROGRAM_ADDRESS", async () => {
    const authority = await generateKey()

    const { instructions } = await mintToken({
      decimals: 9,
      authority,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      rentFor: async () => 1_461_600n,
    })

    expect(instructions).toHaveLength(2)
    // createAccount instruction programAddress is the System Program
    expect(instructions[0].programAddress).toBe("11111111111111111111111111111111")
    // initializeMint instruction programAddress should be TOKEN_2022_PROGRAM_ADDRESS
    expect(instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS)
  })

  it("getAta derives with TOKEN_2022_PROGRAM_ADDRESS", async () => {
    const mint = "So11111111111111111111111111111111111111112" as Address
    const owner = "11111111111111111111111111111112" as Address

    const ataLegacy = await getAta(mint, owner)
    const ata2022 = await getAta(mint, owner, TOKEN_2022_PROGRAM_ADDRESS)

    // They must be different because seed derivation uses different token program ID
    expect(ataLegacy).not.toBe(ata2022)
  })

  it("mintMore uses TOKEN_2022_PROGRAM_ADDRESS", async () => {
    const authority = await generateKey()
    const recipient = await generateKey()
    const mint = "So11111111111111111111111111111111111111112" as Address

    const { instructions } = await mintMore({
      mint,
      authority,
      recipient: recipient.address,
      amount: 1_000_000_000n,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })

    expect(instructions).toHaveLength(2)
    // createAssociatedTokenAccountIdempotent should have tokenProgram set to TOKEN_2022_PROGRAM_ADDRESS in its accounts
    const ataInstruction = instructions[0]
    const tokenProgramMeta = ataInstruction.accounts?.find(
      (acc) => acc.address === TOKEN_2022_PROGRAM_ADDRESS
    )
    expect(tokenProgramMeta).toBeDefined()

    // mintTo instruction programAddress should be TOKEN_2022_PROGRAM_ADDRESS
    expect(instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS)
  })

  it("transferToken uses TOKEN_2022_PROGRAM_ADDRESS", async () => {
    const from = await generateKey()
    const to = await generateKey()
    const mint = "So11111111111111111111111111111111111111112" as Address

    const { instructions } = await transferToken({
      mint,
      from,
      to: to.address,
      amount: 500_000_000n,
      decimals: 9,
      payer: from,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })

    expect(instructions).toHaveLength(2)
    // TransferChecked programAddress should be TOKEN_2022_PROGRAM_ADDRESS
    expect(instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS)
  })

  it("burnToken uses TOKEN_2022_PROGRAM_ADDRESS", async () => {
    const owner = await generateKey()
    const mint = "So11111111111111111111111111111111111111112" as Address

    const { instructions } = await burnToken({
      mint,
      owner,
      amount: 100_000_000n,
      decimals: 9,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })

    expect(instructions).toHaveLength(1)
    // BurnChecked programAddress should be TOKEN_2022_PROGRAM_ADDRESS
    expect(instructions[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS)
  })

  it("InosukeClient.getTokenBalanceByOwner derives ATA under TOKEN_2022_PROGRAM_ADDRESS", async () => {
    const { connect } = await import("../src/client.js")
    const mint = "So11111111111111111111111111111111111111112" as Address
    const owner = "11111111111111111111111111111112" as Address
    const expectedAta = await getAta(mint, owner, TOKEN_2022_PROGRAM_ADDRESS)

    // Mock RPC and client
    const mockRpc = {
      getTokenAccountBalance: (ata: Address) => {
        expect(ata).toBe(expectedAta) // Verifies that the correct Token-2022 ATA was derived!
        return {
          send: async () => ({
            value: { amount: "1500000000", decimals: 9, uiAmount: 1.5 }
          })
        }
      }
    }

    const client = new (await import("../src/client.js")).InosukeClient(mockRpc as any, {} as any, "devnet")
    const balance = await client.getTokenBalanceByOwner(mint, owner, TOKEN_2022_PROGRAM_ADDRESS)
    expect(balance).toBe(1_500_000_000n)
  })
})
