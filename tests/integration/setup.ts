import { KeyPairSigner } from "@solana/kit"
import { InosukeClient, connect } from "../../src/client.js"
import { generateKey } from "../../src/keypair.js"
import { toLamports } from "../../src/utils.js"

export async function setupTest(): Promise<{
  client: InosukeClient
  payer: KeyPairSigner
}> {
  const client = connect("localnet")
  const payer = await generateKey()
  await client.airdrop(payer.address, toLamports(2))
  return { client, payer }
}

let _validatorRunning: boolean | null = null

export async function isValidatorRunning(): Promise<boolean> {
  if (_validatorRunning !== null) return _validatorRunning
  try {
    const client = connect("localnet")
    await client.rpc.getHealth().send()
    _validatorRunning = true
  } catch {
    _validatorRunning = false
  }
  return _validatorRunning
}

export async function skipIfNoValidator(): Promise<boolean> {
  const running = await isValidatorRunning()
  if (!running) {
    // @ts-ignore - vitest's skipIf-like pattern
    return true
  }
  return false
}
