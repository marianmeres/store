# AGENTS.md - AI Assistant Context

Machine-readable documentation for `@marianmeres/store`.

## Package Overview

- **Name**: `@marianmeres/store`
- **Type**: Reactive state management library
- **Runtime**: Deno, Node.js, Browser
- **Language**: TypeScript
- **Entry Point**: `src/mod.ts` (re-exports from `src/store.ts`)
- **Dependencies**: `@marianmeres/pubsub` (internal pub/sub mechanism)

## Purpose

Lightweight reactive store implementation compatible with the Svelte store contract. Provides:
- Writable stores with `get`, `set`, `update`, `subscribe` methods
- Derived (computed) stores from one or more source stores
- Optional persistence to localStorage, sessionStorage, or in-memory storage

## File Structure

```
src/
  mod.ts          # Public entry point (re-exports store.ts)
  store.ts        # All implementation and types
tests/
  store.test.ts   # Test suite (22 tests)
scripts/
  build-npm.ts    # NPM build script
```

## Public API

### Exported Types

| Type | Purpose |
|------|---------|
| `Subscribe<T>` | Callback signature: `(value: T) => void` |
| `Unsubscribe` | Return type of subscribe: `() => void` |
| `Update<T>` | Update callback: `(value: T) => T` |
| `StoreReadable<T>` | Interface with `subscribe` and `get` methods |
| `StoreLike<T>` | Extends StoreReadable with `set` and `update` methods |
| `CreateStoreOptions<T>` | Options: `persist`, `onPersistError`, `onError` |

### Exported Functions

| Function | Signature | Returns |
|----------|-----------|---------|
| `createStore` | `<T>(initial?: T, options?: CreateStoreOptions<T>)` | `StoreLike<T>` |
| `createDerivedStore` | `<T>(stores: StoreReadable<any>[], deriveFn, options?)` | `StoreReadable<T>` |
| `createStoragePersistor` | `<T>(key: string, type?: "session"\|"local"\|"memory")` | `Persistor<T>` |
| `createStorageStore` | `<T>(key: string, type?, initial?: T)` | `StoreLike<T>` |
| `isStoreLike` | `(v: unknown)` | `v is StoreReadable<unknown>` |

## Key Behaviors

### Store Contract (Svelte-compatible)
1. `subscribe(cb)` calls `cb` immediately with current value
2. `subscribe(cb)` returns an unsubscribe function
3. `set(value)` only notifies if value changed (strict equality `===`)
4. All notifications are synchronous

### Derived Store Behavior
1. Lazy subscription: subscribes to sources only when derived has subscribers
2. Auto-cleanup: unsubscribes from sources when all subscribers removed
3. Sync derivation: `deriveFn(values) => T`
4. Async derivation: `deriveFn(values, set) => void` where `set(value)` updates
5. `get()` forces computation via temporary subscribe/unsubscribe

### Persistence
- `createStoragePersistor` creates adapter with `get/set/remove/clear/__raw`
- Values serialized via `JSON.stringify/parse` for localStorage/sessionStorage
- Memory storage uses `Map<string, unknown>` (not serialized)
- Errors caught and logged to console (or custom `onPersistError` handler)

## Common Patterns

### Basic Store
```typescript
const store = createStore<number>(0);
store.subscribe(v => console.log(v)); // immediate: 0
store.set(1);    // logs: 1
store.update(n => n + 1); // logs: 2
```

### Derived Store
```typescript
const a = createStore(1);
const b = createStore(2);
const sum = createDerivedStore([a, b], ([x, y]) => x + y);
```

### Persisted Store
```typescript
const store = createStorageStore("key", "local", defaultValue);
// or manually:
const p = createStoragePersistor("key", "local");
const store = createStore(p.get() ?? default, { persist: p.set });
```

## Testing

```bash
deno test              # Run tests
deno test --watch      # Watch mode
deno lint              # Lint check
```

## Build

```bash
deno task npm:build    # Build for NPM
deno task npm:publish  # Build and publish to NPM
deno publish           # Publish to JSR
```

## Implementation Notes

### Internal Design
- Uses `@marianmeres/pubsub` for subscription management
- Internal `_memoryStorage` is a module-level `Map` shared across memory persistors
- Derived stores track subscription count to manage source subscriptions

### Type Safety
- Generic type `T` flows through store creation
- `createDerivedStore` uses `any` for stores array to allow mixed types
- `isStoreLike` is a type guard returning `v is StoreReadable<unknown>`

### Error Handling
- `subscribe` and `update` validate callback is a function (throws `TypeError`)
- `createDerivedStore` validates stores array and deriveFn arity
- Persistence errors caught and either logged or passed to `onPersistError`
- Subscriber errors can be handled via `onError` option (passed to pubsub)

## Version History

- **v2.3.x**: Added `onError` support for subscriber error handling
- **v2.x**: Current stable API with persistence support
