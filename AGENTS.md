# @marianmeres/store — Agent Guide

## Quick Reference

- **Stack**: TypeScript reactive state library
- **Runtime**: Deno, Node.js, Browser
- **Entry point**: `src/mod.ts` (re-exports from `src/store.ts`)
- **Dependencies**: `@marianmeres/pubsub`
- **Test**: `deno test`
- **Build**: `deno task npm:build`
- **Publish**: `deno task publish`

## Project Structure

```
src/
  mod.ts          # Public entry point (re-exports store.ts)
  store.ts        # All implementation and types
tests/
  store.test.ts   # Test suite
scripts/
  build-npm.ts    # NPM build script
```

## Public API

| Export | Type | Purpose |
|--------|------|---------|
| `createStore` | Function | Create writable store with `get`, `set`, `update`, `subscribe` |
| `createDerivedStore` | Function | Create read-only computed store from a single source or array of sources |
| `createStoragePersistor` | Function | Create localStorage/sessionStorage/memory adapter |
| `createStorageStore` | Function | Convenience: store with automatic persistence |
| `isStoreLike` | Function | Type guard for store interface |
| `Subscribe<T>` | Type | Callback: `(value: T) => void` |
| `Unsubscribe` | Type | Return of subscribe: `() => void` |
| `Update<T>` | Type | Update callback: `(value: T) => T` |
| `StoreReadable<T>` | Interface | `subscribe` + `get` methods |
| `StoreLike<T>` | Interface | Extends StoreReadable with `set` + `update` |
| `CreateStoreOptions<T>` | Interface | `persist`, `onPersistError`, `onError`, `eagerPersist`, `equal` |
| `CreateStoragePersistorOptions` | Interface | `shared` (memory only), `serialize`, `deserialize` (local/session only) |
| `CreateStorageStoreOptions<T>` | Interface | Forwards persistor options + `onError`, `equal`, `onPersistError` |

## Key Behaviors

### Store Contract (Svelte-compatible)
1. `subscribe(cb)` calls `cb` immediately with current value
2. `subscribe(cb)` returns an unsubscribe function (idempotent, supports `Symbol.dispose` for `using` statements)
3. `set(value)` notifies only if value changed (strict equality `===` by default; override via `options.equal`)
4. All notifications are synchronous
5. **Re-entrant writes queued:** a `set` called from inside a subscriber is deferred until the current publish finishes. Subscribers observe a single ordered sequence (last-write-wins within a batch).
6. **Initial-call errors routed to `onError`:** a throwing immediate call during `subscribe(cb)` no longer propagates to the caller of `subscribe` — it goes to `options.onError` (or `console.error` if none). The subscription remains active.
7. `createStore<T>()` (no initial) returns `StoreLike<T | undefined>`; `createStore<T>(initial)` returns `StoreLike<T>`

### Derived Store
1. Accepts a single store **or** an array of stores. Single → `deriveFn(value, set?)`; array → `deriveFn(values, set?)` with per-source tuple typing
2. Subscribes to sources only when derived has subscribers (lazy) — construction does **not** subscribe
3. Unsubscribes from sources when all subscribers removed
4. Sync: `deriveFn.length === 1` → return value used
5. Async: `deriveFn.length >= 2` → must call `set(value)` (default-parameter values do **not** count toward `length`)
6. **`onError` / `persist` / `onPersistError` / `equal` are forwarded to the inner writable store.** `persist` therefore fires only on an actual value change (matches `createStore`'s contract), not on every source notification.
7. `get()` on inactive derived stores:
   - Sync deriveFn with sources exposing `get()` → evaluate directly from `source.get()`, no subscribe/unsubscribe churn (fast path).
   - Async deriveFn → return last cached value (no throwaway scheduling).
   - Svelte-style source without `get()` → fallback to subscribe/unsub cycle.
8. Returned unsubscribe is **idempotent** and **`Symbol.dispose`-compatible** (safe to call multiple times; usable with `using`)
9. Subscribe-path throws (user cb throwing on initial call, or `deriveFn` throwing) **roll back** `_subsCounter` and source subscriptions before the error surfaces — no counter leaks, no dangling source subscriptions.
10. Stale async `set` calls from a previous subscribe-cycle are discarded via a generation counter

### Persistence
- `createStoragePersistor` adapter: `get/set/remove/clear/__raw`
- localStorage/sessionStorage: JSON serialized by default. Pass `{ serialize, deserialize }` for custom codecs (Date, Map, Set, BigInt, encryption).
- Memory storage: `Map<string, unknown>` (not serialized). Default shared module-level Map; pass `{ shared: false }` for an isolated Map (useful for tests).
- `set(undefined)` removes the key in all three storage types.
- `get()` returns `undefined` only when the key is absent — falsy stored values (`0`, `false`, `""`, `null`) round-trip.
- Errors: caught and logged (or custom `onPersistError`)
- `createStoragePersistor` and `createStorageStore` use `stored !== undefined ? stored : initial` to choose between persisted state and the initial fallback (avoids the `||` falsy-clobber pitfall)
- `eagerPersist: false` on `CreateStoreOptions` skips the initial constructor-time persist call
- `createStorageStore` **skips** the eager persist when the value was restored from storage (no redundant round-trip write); it still fires when the key was absent so `initial` is installed.

## Critical Conventions

1. Store values compared with strict equality (`===`) by default before notify; override with `options.equal` for structural comparison
2. Derived stores validate: source must be a StoreLike (or array of them), deriveFn must have arity `>= 1` (`>= 2` triggers async branch)
3. `subscribe` and `update` throw `TypeError` if callback not a function
4. Persistence errors are caught—never thrown to caller
5. Memory storage shares module-level `Map` across all memory persistors **by default** (opt out with `{ shared: false }`)
6. `onError` from `CreateStoreOptions` receives `(error, topic?, isWildcard?)` — full pubsub context. Also used for initial-call (`subscribe(cb)` → immediate `cb(value)`) errors.
7. Re-entrant `set` inside a subscriber is queued (not nested-published) so every subscriber sees the same ordered value history.
8. `Unsubscribe` is an interface `{ (): void; [Symbol.dispose](): void }` — callable as a function *and* usable with the `using` statement.

## Before Making Changes

- [ ] Read `src/store.ts` — all implementation in one file
- [ ] Check existing patterns for similar functionality
- [ ] Run `deno test` before and after changes
- [ ] Maintain Svelte store contract compatibility
- [ ] Keep error handling consistent (catch persist errors, throw on invalid args)

## Documentation Index

- [API.md](API.md) — Complete API reference with examples
- [CHANGELOG.md](CHANGELOG.md) — Version history and migration notes (breaking changes)
