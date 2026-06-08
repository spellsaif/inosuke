import { describe, expect, it } from "vitest"
import { connect } from "../../src/client.js"
import { InvalidClusterError } from "../../src/errors.js"
import { generateKey } from "../../src/keypair.js"
import { setupTest, isValidatorRunning, skipIfNoValidator } from "./setup.js"
import { toLamports, toSol } from "../../src/utils.js"

describe("connect() integration", () => {
  it("connects to localnet and fetches blockhash", async () => {
    if (await skipIfNoValidator()) return

    const client = connect("localnet")
    const bh = await client.blockhash()

    expect(typeof bh.blockhash).toBe("string")
    expect(bh.blockhash.length).toBeGreaterThan(30)
    expect(typeof bh.lastValidBlockHeight).toBe("bigint")
    expect(bh.lastValidBlockHeight).toBeGreaterThan(0n)
  })

  it("shows InvalidClusterError for bad cluster", () => {
    expect(() => connect("wrongcluster")).toThrow(InvalidClusterError)
  })
})

describe("client.balance()", () => {
  it("returns 0 for fresh account", async () => {
    if (await skipIfNoValidator()) return

    const client = connect("localnet")
    const fresh = await generateKey()
    const balance = await client.balance(fresh.address)
    expect(balance).toBe(0n)
  })

  it("returns correct balance after airdrop", async () => {
    if (await skipIfNoValidator()) return

    const { client, payer } = await setupTest()
    const balance = await client.balance(payer.address)
    expect(toSol(balance)).toBe(2)
  })
})

describe("client.airdrop()", () => {
  it("funds the account with request amount", async () => {
    if (await skipIfNoValidator()) return

    const client = connect("localnet")
    const wallet = await generateKey()
    await client.airdrop(wallet.address, toLamports(1))
    const balance = await client.balance(wallet.address)
    expect(balance).toBe(toLamports(1))
  })
})

describe("client.rentFor()", () => {
  it("returns a positive lamport amount", async () => {
    if (await skipIfNoValidator()) return

    const client = connect("localnet")
    const rent = await client.rentFor(165)

    expect(rent).toBeGreaterThan(0n)
    expect(rent).toBeGreaterThan(1_000_000n)
    expect(rent).toBeLessThan(10_000_000n)
  })

  it("larger accounts cost more rent", async () => {
    if (await skipIfNoValidator()) return

    const client = connect("localnet")
    const smallRent = await client.rentFor(82)
    const largeRent = await client.rentFor(165)

    expect(largeRent).toBeGreaterThan(smallRent)
  })
})
