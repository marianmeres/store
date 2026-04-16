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
| `CreateStoreOptions<T>` | Interface | `persist`, `onPersistError`, `onError`, `eagerPersist` |
| `CreateStoragePersistorOptions` | Interface | `shared` (memory only) |

## Key Behaviors

### Store Contract (Svelte-compatible)
1. `subscribe(cb)` calls `cb` immediately with current value
2. `subscribe(cb)` returns an unsubscribe function (idempotent)
3. `set(value)` notifies only if value changed (strict equality `===`)
4. All notifications are synchronous
5. `createStore<T>()` (no initial) returns `StoreLike<T | undefined>`; `createStore<T>(initial)` returns `StoreLike<T>`

### Derived Store
1. Accepts a single store **or** an array of stores. Single → `deriveFn(value, set?)`; array → `deriveFn(values, set?)` with per-source tuple typing
2. Subscribes to sources only when derived has subscribers (lazy) — construction does **not** subscribe
3. Unsubscribes from sources when all subscribers removed
4. Sync: `deriveFn.length === 1` → return value used
5. Async: `deriveFn.length >= 2` → must call `set(value)` (default-parameter values do **not** count toward `length`)
6. `get()` forces computation via temp subscribe/unsubscribe
7. Returned unsubscribe is **idempotent** (safe to call multiple times — guarded internally)
8. Stale async `set` calls from a previous subscribe-cycle are discarded via a generation counter

### Persistence
- `createStoragePersistor` adapter: `get/set/remove/clear/__raw`
- localStorage/sessionStorage: JSON serialized
- Memory storage: `Map<string, unknown>` (not serialized). Default shared module-level Map; pass `{ shared: false }` for an isolated Map (useful for tests).
- `set(undefined)` removes the key in all three storage types.
- `get()` returns `undefined` only when the key is absent — falsy stored values (`0`, `false`, `""`, `null`) round-trip.
- Errors: caught and logged (or custom `onPersistError`)
- `createStoragePersistor` and `createStorageStore` use `stored !== undefined ? stored : initial` to choose between persisted state and the initial fallback (avoids the `||` falsy-clobber pitfall)
- `eagerPersist: false` on `CreateStoreOptions` skips the initial constructor-time persist call

## Critical Conventions

1. Store values compared with strict equality (`===`) before notify
2. Derived stores validate: source must be a StoreLike (or array of them), deriveFn must have arity `>= 1` (`>= 2` triggers async branch)
3. `subscribe` and `update` throw `TypeError` if callback not a function
4. Persistence errors are caught—never thrown to caller
5. Memory storage shares module-level `Map` across all memory persistors **by default** (opt out with `{ shared: false }`)
6. `onError` from `CreateStoreOptions` receives `(error, topic?, isWildcard?)` — full pubsub context

## Before Making Changes

- [ ] Read `src/store.ts` — all implementation in one file
- [ ] Check existing patterns for similar functionality
- [ ] Run `deno test` before and after changes
- [ ] Maintain Svelte store contract compatibility
- [ ] Keep error handling consistent (catch persist errors, throw on invalid args)

## Documentation Index

- [API.md](API.md) — Complete API reference with examples
