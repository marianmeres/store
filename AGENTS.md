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
| `createDerivedStore` | Function | Create read-only computed store from sources |
| `createStoragePersistor` | Function | Create localStorage/sessionStorage/memory adapter |
| `createStorageStore` | Function | Convenience: store with automatic persistence |
| `isStoreLike` | Function | Type guard for store interface |
| `Subscribe<T>` | Type | Callback: `(value: T) => void` |
| `Unsubscribe` | Type | Return of subscribe: `() => void` |
| `Update<T>` | Type | Update callback: `(value: T) => T` |
| `StoreReadable<T>` | Interface | `subscribe` + `get` methods |
| `StoreLike<T>` | Interface | Extends StoreReadable with `set` + `update` |
| `CreateStoreOptions<T>` | Interface | `persist`, `onPersistError`, `onError` |

## Key Behaviors

### Store Contract (Svelte-compatible)
1. `subscribe(cb)` calls `cb` immediately with current value
2. `subscribe(cb)` returns an unsubscribe function
3. `set(value)` notifies only if value changed (strict equality `===`)
4. All notifications are synchronous

### Derived Store
1. Subscribes to sources only when derived has subscribers (lazy)
2. Unsubscribes from sources when all subscribers removed
3. Sync: `deriveFn(values) => T`
4. Async: `deriveFn(values, set) => void`
5. `get()` forces computation via temp subscribe/unsubscribe

### Persistence
- `createStoragePersistor` adapter: `get/set/remove/clear/__raw`
- localStorage/sessionStorage: JSON serialized
- Memory storage: `Map<string, unknown>` (not serialized)
- Errors: caught and logged (or custom `onPersistError`)

## Critical Conventions

1. Store values compared with strict equality (`===`) before notify
2. Derived stores validate: stores must be array, deriveFn must have 1 or 2 args
3. `subscribe` and `update` throw `TypeError` if callback not a function
4. Persistence errors are caught—never thrown to caller
5. Memory storage shares module-level `Map` across all memory persistors

## Before Making Changes

- [ ] Read `src/store.ts` — all implementation in one file
- [ ] Check existing patterns for similar functionality
- [ ] Run `deno test` before and after changes
- [ ] Maintain Svelte store contract compatibility
- [ ] Keep error handling consistent (catch persist errors, throw on invalid args)

## Documentation Index

- [API.md](API.md) — Complete API reference with examples
