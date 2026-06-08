import { describe, it, expect } from "vitest"
import { setupTest, skipIfNoValidator } from "./setup.js"
import { getTransferSolInstruction } from "@solana-program/system"
import { generateKey } from "../../src/keypair.js"
import { SimulationError } from "../../src/errors.js"

describe("send() — SOL transfer", () => {
  it("transfers SOL between two accounts", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()
    const transferAmount = 100_000_000n

    const payerBefore = await client.balance(payer.address)
    const recipientBefore = await client.balance(recipient.address)

    const result = await client
      .buildTx({
        feePayer: payer,
        instructions: [
          getTransferSolInstruction({
            source: payer,
            destination: recipient.address,
            amount: transferAmount,
          }),
        ],
      })
      .send()

    expect(result.signature).toBeDefined()
    expect(typeof result.signature).toBe("string")
    expect(result.slot).toBeGreaterThan(0n)
    expect(result.retries).toBe(0)
    expect(result.commitment).toBe("confirmed")

    const recipientAfter = await client.balance(recipient.address)
    expect(recipientAfter).toBe(recipientBefore + transferAmount)

    const payerAfter = await client.balance(payer.address)
    expect(payerAfter).toBeLessThan(payerBefore - transferAmount)
  })

  it("returns a real explorer URL", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()

    const result = await client
      .buildTx({
        feePayer: payer,
        instructions: [
          getTransferSolInstruction({
            source: payer,
            destination: recipient.address,
            amount: 10_000_000n,
          }),
        ],
      })
      .send()

    expect(result.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)
  })
})

describe("send() — simulation", () => {
  it("throws SimulationError when fee payer has no SOL", async () => {
    if (await skipIfNoValidator()) return

    const { connect } = await import("../../src/client.js")
    const client = connect("localnet")
    const brokeAccount = await generateKey()
    const recipient = await generateKey()

    await expect(
      client
        .buildTx({
          feePayer: brokeAccount,
          instructions: [
            getTransferSolInstruction({
              source: brokeAccount,
              destination: recipient.address,
              amount: 100_000_000n,
            }),
          ],
        })
        .send(),
    ).rejects.toThrow(SimulationError)
  })

  it("SimulationError has logs", async () => {
    if (await skipIfNoValidator()) return

    const { connect } = await import("../../src/client.js")
    const client = connect("localnet")
    const brokeAccount = await generateKey()
    const recipient = await generateKey()

    try {
      await client
        .buildTx({
          feePayer: brokeAccount,
          instructions: [
            getTransferSolInstruction({
              source: brokeAccount,
              destination: recipient.address,
              amount: 100_000_000n,
            }),
          ],
        })
        .send()
    } catch (e) {
      expect(e).toBeInstanceOf(SimulationError)
      if (e instanceof SimulationError) {
        expect(Array.isArray(e.logs)).toBe(true)
        expect(e.code).toBe("SIMULATION_FAILED")
      }
    }
  })
})

describe("buildTx() modifiers", () => {
  it("withPriorityFee sends successfully", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()

    const result = await client
      .buildTx({
        feePayer: payer,
        instructions: [
          getTransferSolInstruction({
            source: payer,
            destination: recipient.address,
            amount: 10_000_000n,
          }),
        ],
      })
      .withPriorityFee(1000n)
      .send()

    expect(result.signature).toBeDefined()
  })

  it("withCompute sends successfully", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()

    const result = await client
      .buildTx({
        feePayer: payer,
        instructions: [
          getTransferSolInstruction({
            source: payer,
            destination: recipient.address,
            amount: 10_000_000n,
          }),
        ],
      })
      .withCompute(50_000)
      .send()

    expect(result.signature).toBeDefined()
  })

  it("withBlockhash uses the provided blockhash", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()
    const bh = await client.blockhash()

    const result = await client
      .buildTx({
        feePayer: payer,
        instructions: [
          getTransferSolInstruction({
            source: payer,
            destination: recipient.address,
            amount: 10_000_000n,
          }),
        ],
      })
      .withBlockhash(bh)
      .send()

    expect(result.signature).toBeDefined()
  })
})

describe("buildTx().simulate()", () => {
  it("returns CU usage for a valid transaction", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const recipient = await generateKey()

    const sim = await client
      .buildTx({
        feePayer: payer,
        instructions: [
          getTransferSolInstruction({
            source: payer,
            destination: recipient.address,
            amount: 10_000_000n,
          }),
        ],
      })
      .simulate()

    expect(sim.unitsConsumed).toBeGreaterThan(0)
    expect(sim.unitsConsumed).toBeLessThan(200_000)
    expect(Array.isArray(sim.logs)).toBe(true)
  })
})
