import { describe, it, expect } from "vitest"
import { setupTest, skipIfNoValidator } from "./setup.js"
import {
  mintToken,
  mintMore,
  transferToken,
  burnToken,
  getAta,
  toRawAmount,
  toUiAmount,
} from "../../src/token.js"
import { generateKey } from "../../src/keypair.js"

async function getTokenBalance(
  client: Awaited<ReturnType<typeof setupTest>>["client"],
  ata: string,
): Promise<bigint> {
  try {
    return await client.tokenBalance(ata as never)
  } catch {
    return 0n
  }
}

describe("Full token lifecycle", () => {
  it("creates a mint, mints tokens, transfers, and burns", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()

    const { instructions: createMintIxs, mint } = await mintToken({
      decimals: 9,
      authority: payer,
      rentFor: (size) => client.rentFor(size),
    })

    const createMintResult = await client
      .buildTx({ feePayer: payer, instructions: createMintIxs })
      .send()

    expect(createMintResult.signature).toBeDefined()
    expect(createMintResult.slot).toBeGreaterThan(0n)

    const mintAmount = toRawAmount(1000, 9)

    const { instructions: mintMoreIxs } = await mintMore({
      mint: mint.address,
      authority: payer,
      recipient: payer.address,
      amount: mintAmount,
    })

    await client
      .buildTx({ feePayer: payer, instructions: mintMoreIxs })
      .send()

    const payerAta = await getAta(mint.address, payer.address)
    const payerBalance = await getTokenBalance(client, payerAta)

    expect(payerBalance).toBe(mintAmount)
    expect(toUiAmount(payerBalance, 9)).toBe(1000)

    const recipient = await generateKey()
    await client.airdrop(recipient.address, 100_000_000n)

    const transferAmount = toRawAmount(250, 9)

    const { instructions: transferIxs } = await transferToken({
      mint: mint.address,
      from: payer,
      to: recipient.address,
      amount: transferAmount,
      decimals: 9,
      payer,
    })

    await client
      .buildTx({ feePayer: payer, instructions: transferIxs })
      .send()

    const recipientAta = await getAta(mint.address, recipient.address)
    const recipientBalance = await getTokenBalance(client, recipientAta)
    const payerBalanceAfterTransfer = await getTokenBalance(client, payerAta)

    expect(recipientBalance).toBe(transferAmount)
    expect(toUiAmount(recipientBalance, 9)).toBe(250)
    expect(payerBalanceAfterTransfer).toBe(mintAmount - transferAmount)
    expect(toUiAmount(payerBalanceAfterTransfer, 9)).toBe(750)

    const burnAmount = toRawAmount(100, 9)

    const { instructions: burnIxs } = await burnToken({
      mint: mint.address,
      owner: payer,
      amount: burnAmount,
      decimals: 9,
    })

    await client
      .buildTx({ feePayer: payer, instructions: burnIxs })
      .send()

    const payerBalanceAfterBurn = await getTokenBalance(client, payerAta)
    expect(payerBalanceAfterBurn).toBe(mintAmount - transferAmount - burnAmount)
    expect(toUiAmount(payerBalanceAfterBurn, 9)).toBe(650)

    const recipientBalanceAfterBurn = await getTokenBalance(client, recipientAta)
    expect(recipientBalanceAfterBurn).toBe(transferAmount)
  })
})

describe("mintToken", () => {
  it("creates a valid mint account on-chain", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()

    const { instructions, mint } = await mintToken({
      decimals: 6,
      authority: payer,
      rentFor: (size) => client.rentFor(size),
    })

    const result = await client
      .buildTx({ feePayer: payer, instructions })
      .send()

    expect(result.signature).toBeDefined()

    const mintInfo = await client.rpc
      .getAccountInfo(mint.address, { encoding: "base64" })
      .send()

    expect(mintInfo.value).not.toBeNull()
    expect(mintInfo.value?.owner).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    )
    expect(mintInfo.value?.data).toBeDefined()
  })

  it("two mints at different addresses are independent", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()

    const { instructions: ix1, mint: mint1 } = await mintToken({
      decimals: 9,
      authority: payer,
      rentFor: (size) => client.rentFor(size),
    })

    const { instructions: ix2, mint: mint2 } = await mintToken({
      decimals: 6,
      authority: payer,
      rentFor: (size) => client.rentFor(size),
    })

    await client.buildTx({ feePayer: payer, instructions: ix1 }).send()
    await client.buildTx({ feePayer: payer, instructions: ix2 }).send()

    expect(mint1.address).not.toBe(mint2.address)
  })
})

describe("transferToken idempotent ATA creation", () => {
  it("works when recipient has never held the token", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()

    const { instructions: mintIxs, mint } = await mintToken({
      decimals: 9,
      authority: payer,
      rentFor: (size) => client.rentFor(size),
    })
    await client.buildTx({ feePayer: payer, instructions: mintIxs }).send()

    const { instructions: mintMoreIxs } = await mintMore({
      mint: mint.address,
      authority: payer,
      recipient: payer.address,
      amount: toRawAmount(100, 9),
    })
    await client.buildTx({ feePayer: payer, instructions: mintMoreIxs }).send()

    const newWallet = await generateKey()

    const { instructions: transferIxs } = await transferToken({
      mint: mint.address,
      from: payer,
      to: newWallet.address,
      amount: toRawAmount(10, 9),
      decimals: 9,
      payer,
    })

    const result = await client
      .buildTx({ feePayer: payer, instructions: transferIxs })
      .send()

    expect(result.signature).toBeDefined()

    const recipientAta = await getAta(mint.address, newWallet.address)
    const balance = await getTokenBalance(client, recipientAta)
    expect(balance).toBe(toRawAmount(10, 9))
  })

  it("transferring twice is fine — ATA already exists second time", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()

    const { instructions: mintIxs, mint } = await mintToken({
      decimals: 9,
      authority: payer,
      rentFor: (size) => client.rentFor(size),
    })
    await client.buildTx({ feePayer: payer, instructions: mintIxs }).send()

    const { instructions: mintMoreIxs } = await mintMore({
      mint: mint.address,
      authority: payer,
      recipient: payer.address,
      amount: toRawAmount(1000, 9),
    })
    await client.buildTx({ feePayer: payer, instructions: mintMoreIxs }).send()

    const { instructions: transfer1 } = await transferToken({
      mint: mint.address,
      from: payer,
      to: recipient.address,
      amount: toRawAmount(10, 9),
      decimals: 9,
      payer,
    })
    await client.buildTx({ feePayer: payer, instructions: transfer1 }).send()

    const { instructions: transfer2 } = await transferToken({
      mint: mint.address,
      from: payer,
      to: recipient.address,
      amount: toRawAmount(10, 9),
      decimals: 9,
      payer,
      skipAtaCreation: true,
    })
    await client.buildTx({ feePayer: payer, instructions: transfer2 }).send()

    const recipientAta = await getAta(mint.address, recipient.address)
    const balance = await getTokenBalance(client, recipientAta)
    expect(toUiAmount(balance, 9)).toBe(20)
  })
})
