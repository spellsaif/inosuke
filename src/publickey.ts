import { getAddressDecoder, getAddressEncoder } from "@solana/kit"
import type { Address } from "@solana/kit"

const base58Decoder = getAddressDecoder()
const base58Encoder = getAddressEncoder()

export class PublicKey {
  readonly address: Address
  readonly _bytes: Uint8Array

  constructor(value: Address | Uint8Array | string) {
    if (value instanceof Uint8Array) {
      if (value.length !== 32) {
        throw new Error(`Invalid public key: expected 32 bytes, got ${value.length}`)
      }
      this._bytes = new Uint8Array(value)
      const decoded = base58Decoder.decode(this._bytes)
      this.address = decoded as unknown as Address
    } else if (typeof value === "string") {
      const encoded = (base58Encoder.encode as (v: string) => Uint8Array)(value)
      if (encoded.length !== 32) {
        throw new Error(`Invalid public key: "${value}" decodes to ${encoded.length} bytes, expected 32`)
      }
      this._bytes = new Uint8Array(encoded)
      this.address = value as unknown as Address
    } else {
      this._bytes = new Uint8Array((base58Encoder.encode as (v: string) => Uint8Array)(value as string))
      this.address = value
    }
  }

  toBase58(): string {
    return this.address as string
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this._bytes)
  }

  equals(other: PublicKey): boolean {
    return this.address === other.address
  }

  toString(): string {
    return this.address as string
  }

  static fromBase58(value: string): PublicKey {
    return new PublicKey(value)
  }

  static fromBytes(bytes: Uint8Array): PublicKey {
    return new PublicKey(bytes)
  }

  static isValid(value: string): boolean {
    try {
      (base58Encoder.encode as (v: string) => Uint8Array)(value)
      return value.length >= 32 && value.length <= 44
    } catch {
      return false
    }
  }
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
