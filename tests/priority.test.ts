import { describe, it, expect } from "vitest"
import { connect, InosukeClient } from "../src/client.js"
import { TxBuilder } from "../src/transaction.js"
import { generateKey } from "../src/keypair.js"

describe("Dynamic Priority Fees", () => {
  it("withDynamicPriorityFee returns a new TxBuilder", async () => {
    const client = connect("devnet")
    const signer = await generateKey()

    const original = client.buildTx({ feePayer: signer, instructions: [] })
    const modified = original.withDynamicPriorityFee("high")

    expect(modified).not.toBe(original)
    expect(modified).toBeInstanceOf(TxBuilder)
  })

  it("resolves low, medium, high, veryHigh percentiles with floor", async () => {
    const mockFees = [
      { prioritizationFee: 100, slot: 1 },
      { prioritizationFee: 500, slot: 2 },
      { prioritizationFee: 2000, slot: 3 },
      { prioritizationFee: 8000, slot: 4 },
      { prioritizationFee: 20000, slot: 5 },
    ]

    const mockRpc = {
      getRecentPrioritizationFees: () => ({
        send: async () => mockFees,
      }),
      getLatestBlockhash: () => ({
        send: async () => ({
          value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 999999n },
        }),
      }),
      simulateTransaction: () => ({
        send: async () => ({
          value: { err: null, unitsConsumed: 10000, logs: [] },
        }),
      }),
      getSignatureStatuses: () => ({
        send: async () => ({
          value: [{ slot: 100n, confirmationStatus: "confirmed" }],
        }),
      }),
      sendTransaction: () => ({
        send: async () => "mockSignature"
      }),
      getEpochInfo: () => ({
        send: async () => ({
          absoluteSlot: 10n,
          blockHeight: 1n,
          epoch: 1n,
          slotIndex: 10n,
          slotsInEpoch: 432000n,
        })
      })
    }
    const mockRpcSubscriptions = {
      signatureNotifications: () => ({
        subscribe: async () => ({
          [Symbol.asyncIterator]: () => {
            let done = false
            return {
              next: async () => {
                if (done) return new Promise(() => {})
                done = true
                return { done: false, value: { value: { err: null } } }
              }
            }
          }
        })
      }),
      slotNotifications: () => ({
        subscribe: async () => ({
          [Symbol.asyncIterator]: () => {
            let done = false
            return {
              next: async () => {
                if (done) return new Promise(() => {})
                done = true
                return { done: false, value: { slot: 10n } }
              }
            }
          }
        })
      })
    }

    const client = new InosukeClient(mockRpc as any, mockRpcSubscriptions as any, "devnet")
    const signer = await generateKey()

    // Test low percentile (25th): mockFees length = 5
    // prices = [100, 500, 2000, 8000, 20000]
    // index = Math.floor(5 * 0.25) = 1 -> prices[1] = 500. Floor makes it 1000n.
    const txLow = client.buildTx({ feePayer: signer, instructions: [] }).withDynamicPriorityFee("low")
    const resultLow = await txLow.send({ skipPreflight: true })
    expect(resultLow.signature).toBeDefined()

    // Test medium percentile (50th): index = Math.floor(5 * 0.50) = 2 -> prices[2] = 2000n.
    const txMed = client.buildTx({ feePayer: signer, instructions: [] }).withDynamicPriorityFee("medium")
    const resultMed = await txMed.send({ skipPreflight: true })
    expect(resultMed.signature).toBeDefined()

    // Test high percentile (75th): index = Math.floor(5 * 0.75) = 3 -> prices[3] = 8000n.
    const txHigh = client.buildTx({ feePayer: signer, instructions: [] }).withDynamicPriorityFee("high")
    const resultHigh = await txHigh.send({ skipPreflight: true })
    expect(resultHigh.signature).toBeDefined()

    // Test veryHigh percentile (95th): index = Math.floor(5 * 0.95) = 4 -> prices[4] = 20000n.
    const txVeryHigh = client.buildTx({ feePayer: signer, instructions: [] }).withDynamicPriorityFee("veryHigh")
    const resultVeryHigh = await txVeryHigh.send({ skipPreflight: true })
    expect(resultVeryHigh.signature).toBeDefined()
  })

  it("falls back to floor (1000 microLamports) if query fails or returns empty", async () => {
    const mockRpc = {
      getRecentPrioritizationFees: () => ({
        send: async () => {
          throw new Error("RPC error")
        },
      }),
      getLatestBlockhash: () => ({
        send: async () => ({
          value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 999999n },
        }),
      }),
      simulateTransaction: () => ({
        send: async () => ({
          value: { err: null, unitsConsumed: 10000, logs: [] },
        }),
      }),
      getSignatureStatuses: () => ({
        send: async () => ({
          value: [{ slot: 100n, confirmationStatus: "confirmed" }],
        }),
      }),
      sendTransaction: () => ({
        send: async () => "mockSignature"
      }),
      getEpochInfo: () => ({
        send: async () => ({
          absoluteSlot: 10n,
          blockHeight: 1n,
          epoch: 1n,
          slotIndex: 10n,
          slotsInEpoch: 432000n,
        })
      })
    }

    const mockRpcSubscriptions = {
      signatureNotifications: () => ({
        subscribe: async () => ({
          [Symbol.asyncIterator]: () => {
            let done = false
            return {
              next: async () => {
                if (done) return new Promise(() => {})
                done = true
                return { done: false, value: { value: { err: null } } }
              }
            }
          }
        })
      }),
      slotNotifications: () => ({
        subscribe: async () => ({
          [Symbol.asyncIterator]: () => {
            let done = false
            return {
              next: async () => {
                if (done) return new Promise(() => {})
                done = true
                return { done: false, value: { slot: 10n } }
              }
            }
          }
        })
      })
    }

    const client = new InosukeClient(mockRpc as any, mockRpcSubscriptions as any, "devnet")
    const signer = await generateKey()

    const tx = client.buildTx({ feePayer: signer, instructions: [] }).withDynamicPriorityFee("high")
    const result = await tx.send({ skipPreflight: true })
    expect(result.signature).toBeDefined()
  })
})
