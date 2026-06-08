<p align="center">
  <img src="./inosuke.png" alt="Inosuke" width="320" />
</p>

<p align="center">
  <strong>Solana, but it feels like you.</strong><br>
  A TypeScript library that makes building on Solana feel inevitable.
</p>

<p align="center">
  <a href="https://github.com/nanasi/inosuke/actions"><img src="https://img.shields.io/github/actions/workflow/status/nanasi/inosuke/.github/workflows/ci.yml?logo=github&label=ci" /></a>
  <a href="https://www.npmjs.com/package/inosuke"><img src="https://img.shields.io/npm/v/inosuke?logo=npm&color=377CC0" /></a>
  <a href="#"><img src="https://img.shields.io/badge/built%20on-@solana/kit%20v2-9945FF?logo=solana" /></a>
  <a href="#"><img src="https://img.shields.io/badge/runtime-Node%20·%20Browser%20·%20Deno%20·%20Bun-black" /></a>
</p>

---

## The Philosophy

Solana tooling gives you **pieces**. Inosuke gives you **paths**.

`@solana/kit` (Web3.js v2) is architecturally brilliant — a functional, pipe-based, modular foundation. But brilliance at the instruction level doesn't translate to productivity at the application level. You spend cycles on ceremony: wiring RPC transformers, fetching blockhashes, estimating compute, retrying expirations, calculating fees, deriving ATAs.

Inosuke doesn't replace kit. It *completes* it. Every piece of kit is still there, still reachable. Inosuke just handles the decisions you shouldn't have to make, so you can focus on the ones you should.

**What Inosuke believes:**

- **Simulation should be the default, not an afterthought.** Every transaction runs against the validator *before* it spends gas. You catch errors, you measure compute, you set accurate budgets.
- **Fees should adapt, not be guessed.** Inosuke queries the localized fee market for the accounts your transaction touches — not network-wide averages — and picks the right percentile for your urgency.
- **The builder should be immutable.** Every `.withFee()` call returns a new `TxBuilder`. Branch, compose, fork — no shared state to corrupt.
- **Tokens should not require a manual.** Legacy SPL, Token-2022 — same API, one `tokenProgram` parameter. ATAs are derived, created, and verified automatically.
- **Anchors should load at runtime, not at build time.** Drop in a JSON IDL. Inosuke builds the client, validates discriminators, and decodes accounts on the fly.
- **Errors should tell you what to do.** Seven typed error classes with codes, not just strings. `SimulationError` carries logs. `InsufficientFundsError` carries the exact lamport shortfall.
- **You should see what's happening.** `INOSUKE_DEBUG=true` lights up the entire send pipeline — simulate CU, fee resolution, retry reasons, confirmation slots.

---

## Why now?

Solana is shipping. Blinks, Firedancer, token extensions, institutional custody — the network is ready for production. But the gap between *running a transaction* and *shipping an application* is still measured in boilerplate.

Inosuke closes that gap. It's the piece that turns `@solana/kit` from a sharp tool into a complete workshop. You get V0 transactions by default, Jito MEV protection, dynamic priority fees, Token-2022 support, and a runtime Anchor client — none of which `@solana/kit` gives you out of the box.

If you're building on Solana today, you're writing the Inosuke logic yourself — just scattered across helper files and retry loops. Inosuke centralizes it, tests it, and gives it back to you as a clean API.

---

## Quick start

```bash
npm install inosuke
```

```typescript
import { connect, Keypair, transferSol, LAMPORTS_PER_SOL } from 'inosuke'

const client = connect('mainnet')
const kp = await Keypair.generate()

const { instructions } = transferSol({
  from: kp.signer,
  to: recipient,
  amount: LAMPORTS_PER_SOL,
})

await client.send(instructions).signedBy(kp.signer).withFee('high')
```

---

## What's inside

### `TxBuilder` — the fluent transaction engine

Every send auto-simulates, measures compute, applies a 10% buffer, resolves fees, retries on blockhash expiry, and confirms. You just say what you want.

```typescript
await client
  .send(myIx)
  .signedBy(kp.signer)
  .withFee('veryHigh')          // dynamic percentile (low | medium | high | veryHigh | auto)
  .withCompute(200_000)         // explicit compute limit
  .withTip(10_000n)             // Jito MEV tip
  .withLookup(jupAlt)           // Address Lookup Table compression
```

### Priority fees that know the neighborhood

`.withFee('high')` doesn't guess. It queries `getRecentPrioritizationFees` for the specific read/written accounts in your transaction, sorts historic fees, and picks the 75th percentile. A 1,000 microLamport floor prevents zero-fee drops.

### Lifecycle hooks

Observe every phase without subclassing or monkey-patching:

```typescript
await client.send(myIx).signedBy(kp)
  .on('simulate', ({ unitsConsumed }) => log(`Will use ~${unitsConsumed} CU`))
  .on('send', ({ signature }) => notifyUser(signature))
  .on('confirm', ({ signature, slot }) => analytics.track('landed', { slot }))
  .on('retry', ({ attempt, reason }) => metrics.inc('tx_retry'))
  .on('error', ({ error }) => sentry.capture(error))
```

### Estimate before paying

Same fluent API, no gas spent:

```typescript
const { computeUnits, estimatedFee } = await client
  .send(myIx).signedBy(kp).withFee('high')
  .estimate()
// Show the user before they sign
```

### Token client — wallets, not token accounts

You pass **wallet addresses**. Inosuke derives ATAs, creates them if missing, and handles both legacy SPL and Token-2022 through the same API:

```typescript
const usdc = await client.token(mint)
await usdc.transfer(sender, recipient, amount)
await usdc.mintTo(recipient, authority, amount)
await usdc.balance(owner)
await usdc.info()   // { supply, decimals }

// Token-2022 — just pass the program
const token22 = await client.token(mint, '2022')
```

### Dynamic Anchor client — no codegen

```typescript
const program = client.loadProgram(programId, idl)
const ix = await program.instruction.initialize({ args, accounts })
const state = await program.account.userProfile.fetch(address)
// Discriminator validated. Borsh decoded. Zero build step.
```

### Builder-free path

Don't want the builder? `buildTransaction()` and `prepareTransaction()` work on raw kit types:

```typescript
import { buildTransaction, prepareTransaction } from 'inosuke'

const tx = buildTransaction({ feePayer: kp.signer, instructions: [ix] })
const ready = await prepareTransaction(tx, { rpc: client.rpc })
// ready has fresh blockhash, measured compute limit, ready to sign
```

or via the client:

```typescript
const ready = await client.prepare(tx)
```

### Debug logging

```bash
INOSUKE_DEBUG=true node my-script.js
# [inosuke] simulate: 3 ix, 1200 CU consumed
# [inosuke] dynamic fee resolved: 5000 microLamports (high)
# [inosuke] sending: 4xK2abc...def
# [inosuke] confirmed: 4xK2abc...def slot 298412312
# [inosuke] retry 1/3: 503 Service Unavailable
```

### Keypair management

```typescript
import { Keypair } from 'inosuke'

const kp = await Keypair.generate()              // non-extractable (most secure)
const kp = await Keypair.generateExtractable()   // exportable
const kp = await Keypair.fromFile('~/.config/solana/id.json')
const kp = await Keypair.fromBytes(bytes)
const secret = await kp.toBase58()
await kp.saveTo('./key.json')
```

### PublicKey class

```typescript
const pk = new PublicKey('HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH')
pk.toBase58()          // full address
pk.toBytes()           // Uint8Array(32)
pk.equals(other)       // boolean
PublicKey.isValid(str) // true/false
```

### Runtime guards

```typescript
import { asAddress, asSigner } from 'inosuke'

const addr = asAddress(signerOrAddress)   // always Address
const signer = asSigner(signerOrAddress)  // always TransactionSigner (noop if plain address)
```

### Genesis hash verification

```typescript
import { getClusterFromGenesis } from 'inosuke'

getClusterFromGenesis('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')
// → "mainnet"
```

### Display-formatted SOL

```typescript
import { toSolDisplay } from 'inosuke'

toSolDisplay(1_500_000_000n)       // "1.5"
toSolDisplay(123_456_789n, 3)      // "0.123"
```

### Typed errors

```typescript
import { SimulationError, InsufficientFundsError, isInosukeError, hasErrorCode } from 'inosuke'

try { await client.buildTx(...).send() } catch (e) {
  if (e instanceof SimulationError)      console.log(e.logs)
  if (e instanceof InsufficientFundsError) airdrop(e.required - e.available)
  if (hasErrorCode(e, 'BLOCKHASH_EXPIRED')) retry()
}
```

### Constants

```typescript
import { LAMPORTS_PER_SOL, Programs } from 'inosuke'

LAMPORTS_PER_SOL           // 1_000_000_000n
Programs.SYSTEM             // 11111111111111111111111111111111
Programs.TOKEN              // Tokenkeg...
Programs.TOKEN_2022         // Tokenz...
Programs.ASSOCIATED_TOKEN   // AToken...
Programs.MEMO               // Memo...
Programs.METAPLEX            // meta...
```

### RPC queries — everything you'd expect, nothing you don't

```typescript
// Account state
const sol = await client.balance(address)
const info = await client.accountInfo(address)
const many = await client.multipleAccounts([addr1, addr2])

// Network
const bh = await client.blockhash()           // { blockhash, lastValidBlockHeight }
const height = await client.blockHeight()
const rent = await client.rentFor(165)        // lamports for 165-byte account

// Devnet / localnet
await client.airdrop(address, LAMPORTS_PER_SOL)

// Tokens
const tb = await client.tokenBalance(tokenAccount)
const tbOwner = await client.tokenBalanceByOwner(mint, owner)
const mi = await client.mintInfo(mint)        // { supply, decimals }
const meta = await client.tokenMetadata(mint) // { name, symbol, uri }

// Transactions
const statuses = await client.signatureStatuses([sig1, sig2])
const tx = await client.transaction(sig)       // parsed result
await client.confirm(sig)                       // wait for confirmation
```

### Standalone utilities

```typescript
import {
  toSol, toLamports, toSolDisplay,
  transferSol, mintToken, mintMore, transferToken, burnToken, getAta,
  toRawAmount, toUiAmount,
  findPda, explorerUrl, truncate, validateAddress,
} from 'inosuke'

// SOL math
toSol(1_000_000_000n)     // 1
toLamports(1.5)           // 1_500_000_000n
toSolDisplay(1_500_000n)  // "0.0015"

// SYSTEM
const { instructions } = transferSol({ from: signer, to: recipient, amount: 1_000_000_000n })

// TOKEN (functional style — no client needed)
const { instructions, mint } = await mintToken({ decimals: 9, authority: signer, rentFor: (s) => client.rentFor(s) })
const { instructions } = await mintMore({ mint: mint.address, authority: signer, recipient, amount })
const { instructions } = await transferToken({ mint, from: sender, to: recipient, amount, decimals: 9, payer: sender })
const { instructions } = await burnToken({ mint, owner: signer, amount, decimals: 9 })
const ata = await getAta(mint, owner)         // derive associated token account

// TOKEN math
toRawAmount(1.5, 9)       // 1_500_000_000n
toUiAmount(1_500_000n, 6) // 1.5

// PDA
const pda = await findPda(programId, ['seed', signerBytes])

// Display
explorerUrl(signature)               // https://explorer.solana.com/tx/...
explorerUrl(address, 'devnet')       // ?cluster=devnet
truncate('HN7cABqL...e4YWrH')       // HN7c...YWrH
validateAddress('some-string')       // Address | throws
```

---

## Architecture

```
connect('mainnet')
  └── InosukeClient
        ├── .send(ix).signedBy(kp).withFee('high')  // fluent builder
        ├── .sendTransaction(ix, { ... })            // one-liner
        ├── .buildTx({ ... })                        // classic entry point
        ├── .prepare(tx)                             // builder-free path
        ├── .token(mint)                             // TokenClient factory
        ├── .loadProgram(addr, idl)                  // Anchor client factory
        ├── .balance() .blockhash() .rentFor()       // RPC queries
        ├── .airdrop() .accountInfo()                // RPC queries
        ├── .tokenBalance() .tokenBalanceByOwner()   // token queries
        ├── .mintInfo() .tokenMetadata()             // token queries
        ├── .signatureStatuses() .blockHeight()      // chain info
        ├── .transaction() .confirm()                // txn lookup
        └── .multipleAccounts()                      // batch reads

TxBuilder
  ├── .withFee(1000n | 'high' | 'auto')    // one method, three modes
  ├── .withCompute(units)                  // set compute limit
  ├── .withLookup(alt)                     // ALT compression
  ├── .withTip(lamports)                   // Jito MEV
  ├── .withBlockhash(bh)                   // pre-fetched blockhash
  ├── .withInstructions(ixs)              // append instructions
  ├── .signedBy(signer)                   // set fee payer
  ├── .on(event, fn)                       // lifecycle hooks
  ├── .estimate()                          // cost preview
  ├── .simulate()                          // simulate without sending
  └── .send()                              // sign → send → confirm → retry

Standalone exports
  ├── buildTransaction(opts)               // raw kit types
  ├── prepareTransaction(tx, { rpc })      // simulate + set compute + fetch blockhash
  ├── asAddress() asSigner()               // runtime guards
  ├── getClusterFromGenesis()              // RPC verification
  └── debug()                              // structured logging
```

---

## Runtimes

Inosuke works everywhere JavaScript runs:

| Runtime | RPC | Keypair generation | File I/O (load/save) |
|---|---|---|---|
| Node.js | ✓ | ✓ | ✓ |
| Browser | ✓ | ✓ | — (dynamic import guarded) |
| Deno | ✓ | ✓ | — |
| Bun | ✓ | ✓ | ✓ |

File operations (`loadKeyFile`, `saveKeyFile`) use dynamic `import("node:fs")` — bundlers won't crash them in browser contexts.

---

## Peer dependency

Inosuke runs on `@solana/kit` ^6.5.0. It bundles `@solana-program/*` packages but keeps kit external so you control the version.

```json
{
  "dependencies": {
    "inosuke": "^0.1.0",
    "@solana/kit": "^6.5.0"
  }
}
```

---

## Contributing

```bash
git clone https://github.com/nanasi/inosuke.git
cd inosuke
npm install
npm run lint       # typecheck
npm run test       # 153 tests (unit + integration)
npm run build      # ESM + CJS + DTS via tsup
```

Integration tests require a running localnet validator (`solana-test-validator`). They skip gracefully when one isn't available.

---

## License

MIT
