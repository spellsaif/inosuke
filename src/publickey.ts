import { getAddressDecoder, getAddressEncoder } from "@solana/kit"
import type { Address } from "@solana/kit"

const base58Decoder = getAddressDecoder()
const base58Encoder = getAddressEncoder()

export function addressToBytes(address: Address): Uint8Array {
  return new Uint8Array(base58Encoder.encode(address))
}

export function addressFromBytes(bytes: Uint8Array): Address {
  if (bytes.length !== 32) {
    throw new Error(`Invalid public key bytes: expected 32 bytes, got ${bytes.length}`)
  }
  return base58Decoder.decode(bytes) as unknown as Address
}

export function validateAddress(value: unknown, label = "address"): Address {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) {
    throw new Error(`Invalid ${label}: expected a base58-encoded Solana address`)
  }
  try {
    (base58Encoder.encode as (v: string) => Uint8Array)(value)
    return value as unknown as Address
  } catch {
    throw new Error(`Invalid ${label}: not a valid base58 string`)
  }
}
