# @marianmeres/store

Lightweight reactive store implementation with subscriptions and persistence support.
[Svelte store contract](https://svelte.dev/docs#component-format-script-4-prefix-stores-with-$-to-access-their-values-store-contract)
compatible.

**Features:**
- Reactive state management with subscriptions
- Derived stores for computed values (sync and async)
- Optional persistence to localStorage, sessionStorage, or memory
- TypeScript support with full type safety
- Zero dependencies (except pubsub)

## Install

```sh
deno add jsr:@marianmeres/store
```

```sh
npm install @marianmeres/store
```

## Usage

```typescript
const store = createStore("foo");

// always able to `get` current value
assert("foo" === store.get());

// from now on, console.log changes
let unsub = store.subscribe(console.log); // log: foo

store.set("bar"); // logs: bar
store.update((old) => old + "baz"); // logs: barbaz

unsub(); // stop console.log changes for `store`

// derived example
const store2 = createStore(123);
const derived = createDerivedStore([store, store2], ([a, b]) => [a, b].join());

// derived stores compute on-demand via get() or reactively via subscribe()
assert(derived.get() === "barbaz,123"); // computes immediately

// once subscribed, derived reactively updates when dependencies change
unsub = derived.subscribe(console.log); // logs: barbaz,123

store2.set(456); // logs: barbaz,456

unsub();
store.set(789); // no log (unsubscribed, so no reactive updates)

// derived async example (the deriveFn accepts second 'set' argument)
const derivedAsync = createDerivedStore([store, store2], ([a, b], set) => {
	setTimeout(() => {
		set([a, b].join());
	}, 1000);
});
```

## API Reference

### Types

```typescript
type Subscribe<T> = (value: T) => void;
type Unsubscribe = () => void;
type Update<T> = (value: T) => T;

interface StoreReadable<T> {
	subscribe(cb: Subscribe<T>): Unsubscribe;
	get(): T;
}

interface StoreLike<T> extends StoreReadable<T> {
	set(value: T): void;
	update(cb: Update<T>): void;
}

interface CreateStoreOptions<T> {
	persist?: (v: T) => void;
	onPersistError?: (error: unknown) => void;
}
```

### `createStore<T>(initial?, options?): StoreLike<T>`

Creates a writable store with reactive subscriptions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `initial` | `T` | Initial value of the store |
| `options.persist` | `(v: T) => void` | Callback to persist value on change |
| `options.onPersistError` | `(error: unknown) => void` | Error handler for persistence failures |

**Returns:** `StoreLike<T>` with methods:
- `get()` - Returns current value
- `set(value)` - Sets new value (notifies subscribers if changed)
- `update(fn)` - Updates value using a function
- `subscribe(cb)` - Subscribes to changes, returns unsubscribe function

---

### `createDerivedStore<T>(stores, deriveFn, options?): StoreReadable<T>`

Creates a derived store that computes its value from source stores.

| Parameter | Type | Description |
|-----------|------|-------------|
| `stores` | `StoreReadable<any>[]` | Array of source stores |
| `deriveFn` | `(values: any[], set?) => T` | Derivation function |
| `options.initialValue` | `any` | Initial value before first computation |
| `options.persist` | `(v: T) => void` | Callback to persist value on change |
| `options.onPersistError` | `(error: unknown) => void` | Error handler for persistence failures |

**Returns:** `StoreReadable<T>` with methods:
- `get()` - Returns current derived value (computes on-demand)
- `subscribe(cb)` - Subscribes to changes, returns unsubscribe function

**Note:** For async derivation, use the second `set` argument in `deriveFn`.

---

### `createStoragePersistor<T>(key, type?): Persistor<T>`

Creates a storage adapter for persisting store values.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | - | Storage key |
| `type` | `"local" \| "session" \| "memory"` | `"session"` | Storage type |

**Returns:** `Persistor<T>` with methods:
- `get()` - Retrieve stored value
- `set(value)` - Store a value
- `remove()` - Remove stored value
- `clear()` - Clear all storage

---

### `createStorageStore<T>(key, storageType?, initial?): StoreLike<T>`

Convenience function that creates a store with automatic storage persistence.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | - | Storage key |
| `storageType` | `"local" \| "session" \| "memory"` | `"session"` | Storage type |
| `initial` | `T` | - | Initial value if nothing in storage |

**Returns:** `StoreLike<T>` - A writable store that auto-persists to storage.

---

### `isStoreLike(value): boolean`

Checks if a value implements the store interface (duck typing).

## Package Identity

- **Name:** @marianmeres/store
- **Author:** Marian Meres
- **Repository:** https://github.com/marianmeres/store
- **License:** MIT
