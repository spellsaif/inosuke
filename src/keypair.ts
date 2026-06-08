import {
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase58Encoder,
  createSignerFromKeyPair,
} from "@solana/kit"
import type { KeyPairSigner } from "@solana/kit"
import { KeypairLoadError, KeypairSaveError } from "./errors.js"
import { PublicKey } from "./publickey.js"

// ─── Keypair class ────────────────────────────────────────────────────────────

export class Keypair {
  readonly signer: KeyPairSigner
  readonly publicKey: PublicKey
  private _extractable: boolean

  private constructor(signer: KeyPairSigner, extractable: boolean) {
    this.signer = signer
    this.publicKey = new PublicKey(signer.address)
    this._extractable = extractable
  }

  get address(): string {
    return this.signer.address
  }

  get secretKey(): Uint8Array | null {
    if (!this._extractable) return null
    return this._exportBytes()
  }

  private _exportBytes(): Uint8Array {
    const subtle = (this.signer.keyPair as any)._cryptoKey
      ? crypto.subtle
      : null
    return new Uint8Array(64)
  }

  static async generate(): Promise<Keypair> {
    const kp = await generateKeyPairSigner()
    return new Keypair(kp, false)
  }

  static async generateExtractable(): Promise<Keypair> {
    const cryptoKeyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair
    const signer = await Promise.resolve(createSignerFromKeyPair(cryptoKeyPair))
    return new Keypair(signer, true)
  }

  static async fromFile(path: string): Promise<Keypair> {
    const signer = await loadKeyFile(path)
    return new Keypair(signer, true)
  }

  static async fromBytes(bytes: Uint8Array): Promise<Keypair> {
    const signer = await keyFromBytes(bytes)
    return new Keypair(signer, true)
  }

  static async fromBase58(secretKey: string): Promise<Keypair> {
    const signer = await loadKey(secretKey)
    return new Keypair(signer, true)
  }

  async toBase58(): Promise<string> {
    return toBase58(this.signer)
  }

  async saveTo(path: string): Promise<void> {
    await saveKeyFile(this.signer, path)
  }
}

// ─── Standalone functions (backward compatible) ────────────────────────────────

export async function generateKey(): Promise<KeyPairSigner> {
  return generateKeyPairSigner()
}

export async function generateExtractableKey(): Promise<KeyPairSigner> {
  const cryptoKeyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair
  return createSignerFromKeyPair(cryptoKeyPair)
}

export async function loadKey(base58SecretKey: string): Promise<KeyPairSigner> {
  try {
    const bytes = getBase58Encoder().encode(base58SecretKey)
    return await createKeyPairSignerFromBytes(bytes)
  } catch (e) {
    throw new KeypairLoadError("<base58 string>", e)
  }
}

export async function loadKeyFile(path: string): Promise<KeyPairSigner> {
  try {
    const { readFile } = await import("node:fs/promises")
    const { resolve, normalize } = await import("node:path")
    const resolvedPath = resolve(normalize(path.replace(
      /^~/,
      (typeof process !== "undefined" ? (process.env["HOME"] ?? process.env["USERPROFILE"]) : undefined) ?? "~",
    )))
    const raw = await readFile(resolvedPath, "utf-8")
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Keypair file must contain a JSON array of numbers, got: ${typeof parsed}`,
      )
    }
    const bytes = new Uint8Array(parsed as number[])
    return await createKeyPairSignerFromBytes(bytes)
  } catch (e) {
    if (e instanceof KeypairLoadError) throw e
    throw new KeypairLoadError(path, e)
  }
}

export async function saveKeyFile(
  signer: KeyPairSigner,
  filePath: string,
): Promise<void> {
  try {
    const { writeFile, mkdir } = await import("node:fs/promises")
    const { resolve, normalize, dirname } = await import("node:path")
    const resolvedPath = resolve(normalize(filePath.replace(
      /^~/,
      (typeof process !== "undefined" ? (process.env["HOME"] ?? process.env["USERPROFILE"]) : undefined) ?? "~",
    )))

    const pkcs8 = await crypto.subtle.exportKey("pkcs8", signer.keyPair.privateKey)
    const privateKeyBytes = new Uint8Array(pkcs8, pkcs8.byteLength - 32, 32)
    const publicKeyBytes = await crypto.subtle.exportKey("raw", signer.keyPair.publicKey)

    const combined = new Uint8Array(64)
    combined.set(privateKeyBytes, 0)
    combined.set(new Uint8Array(publicKeyBytes), 32)

    await mkdir(dirname(resolvedPath), { recursive: true })
    await writeFile(resolvedPath, JSON.stringify(Array.from(combined)))
  } catch (cause) {
    throw new KeypairSaveError(filePath, cause)
  }
}

export async function keyFromBytes(bytes: Uint8Array): Promise<KeyPairSigner> {
  try {
    return await createKeyPairSignerFromBytes(bytes)
  } catch (e) {
    throw new KeypairLoadError("<bytes>", e)
  }
}

export async function toBase58(signer: KeyPairSigner): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", signer.keyPair.privateKey)
  const privateKeyBytes = new Uint8Array(pkcs8, pkcs8.byteLength - 32, 32)
  const publicKeyBytes = await crypto.subtle.exportKey("raw", signer.keyPair.publicKey)

  const combined = new Uint8Array(64)
  combined.set(privateKeyBytes, 0)
  combined.set(new Uint8Array(publicKeyBytes), 32)

  return getBase58Decoder().decode(combined)
}
