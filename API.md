# API Reference

Complete API documentation for `@marianmeres/store`.

## Table of Contents

- [Types](#types)
  - [Subscribe\<T\>](#subscribet)
  - [Unsubscribe](#unsubscribe)
  - [Update\<T\>](#updatet)
  - [StoreReadable\<T\>](#storereadablet)
  - [StoreLike\<T\>](#storeliket)
  - [CreateStoreOptions\<T\>](#createstoreoptionst)
- [Functions](#functions)
  - [createStore](#createstore)
  - [createDerivedStore](#createderivedstore)
  - [createStoragePersistor](#createstoragepersistor)
  - [createStorageStore](#createstoragestore)
  - [isStoreLike](#isstorelike)

---

## Types

### Subscribe\<T\>

Subscription callback function that receives the current store value.

```typescript
type Subscribe<T> = (value: T) => void;
```

### Unsubscribe

Unsubscribe function returned by `subscribe()` to stop receiving updates.

```typescript
type Unsubscribe = () => void;
```

### Update\<T\>

Update function that receives the current value and returns the new value.

```typescript
type Update<T> = (value: T) => T;
```

### StoreReadable\<T\>

Readable store interface with subscribe and get methods.

```typescript
interface StoreReadable<T> {
  subscribe(cb: Subscribe<T>): Unsubscribe;
  get(): T;
}
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `subscribe` | `cb: Subscribe<T>` | `Unsubscribe` | Subscribe to value changes. Callback is called immediately with current value, then on every change. |
| `get` | - | `T` | Get the current value synchronously. |

### StoreLike\<T\>

Writable store interface extending `StoreReadable` with set and update methods.

```typescript
interface StoreLike<T> extends StoreReadable<T> {
  set(value: T): void;
  update(cb: Update<T>): void;
}
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `subscribe` | `cb: Subscribe<T>` | `Unsubscribe` | Subscribe to value changes. |
| `get` | - | `T` | Get the current value. |
| `set` | `value: T` | `void` | Set a new value. Notifies subscribers only if value changed (strict equality). |
| `update` | `cb: Update<T>` | `void` | Update value using a function that receives current value and returns new value. |

### CreateStoreOptions\<T\>

Configuration options for store creation.

```typescript
interface CreateStoreOptions<T> {
  persist?: (v: T) => void;
  onPersistError?: (error: unknown) => void;
  onError?: (error: Error, topic?: string, isWildcard?: boolean) => void;
  eagerPersist?: boolean;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `persist` | `(v: T) => void` | Optional callback to persist store values (e.g., to localStorage). Called on every value change. |
| `onPersistError` | `(error: unknown) => void` | Optional callback to handle persistence errors. If not provided, errors are logged to console. |
| `onError` | `(error, topic?, isWildcard?) => void` | Optional error handler for subscriber errors. Receives the underlying pubsub `topic` and `isWildcard` context. |
| `eagerPersist` | `boolean` | Default `true`. When `false`, the initial value is **not** passed to `persist` at construction time — useful when `persist` is expensive (e.g., a network call). |

---

## Functions

### createStore

Creates a writable store with reactive subscriptions.

```typescript
// With initial value — store is StoreLike<T>
function createStore<T>(
  initial: T,
  options?: CreateStoreOptions<T> | null
): StoreLike<T>;

// Without initial value — store is StoreLike<T | undefined>
function createStore<T>(
  initial?: undefined,
  options?: CreateStoreOptions<T | undefined> | null
): StoreLike<T | undefined>;
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `initial` | `T` | `undefined` | Initial value of the store. When omitted the return type widens to `StoreLike<T \| undefined>`. |
| `options` | `CreateStoreOptions<T> \| null` | `null` | Configuration for persistence and error handling. |

**Returns:** `StoreLike<T>` (or `StoreLike<T | undefined>` when `initial` is omitted) — a writable store with `get()`, `set()`, `update()`, and `subscribe()` methods.

**Behavior:**
- Subscriptions are called synchronously with the current value on subscribe.
- All active subscriptions are notified synchronously when the value changes.
- Values are compared using strict equality (`===`) before notifying subscribers.
- Compatible with [Svelte store contract](https://svelte.dev/docs#component-format-script-4-prefix-stores-with-$-to-access-their-values-store-contract).

**Example:**

```typescript
const count = createStore(0);

// Subscribe to changes
const unsub = count.subscribe(val => console.log(val)); // logs: 0

// Update the value
count.set(1);           // logs: 1
count.update(n => n + 1); // logs: 2

// Get current value without subscribing
console.log(count.get()); // 2

// Stop receiving updates
unsub();
```

**Example with persistence:**

```typescript
const persistor = createStoragePersistor<number>("count", "local");
const count = createStore(persistor.get() ?? 0, {
  persist: persistor.set,
  onPersistError: (e) => console.error("Failed to persist:", e)
});
```

---

### createDerivedStore

Creates a derived store that computes its value from a single source store or an array of source stores.

```typescript
// Single source — deriveFn receives the value directly
function createDerivedStore<T, S = unknown>(
  store: StoreReadable<S>,
  deriveFn: (value: S, set?: (value: T) => void) => T | void,
  options?: CreateDerivedStoreOptions<T> | null
): StoreReadable<T>;

// Multiple sources — deriveFn receives a tuple of values, with per-source typing
function createDerivedStore<T, S extends StoreReadable<unknown>[]>(
  stores: [...S],
  deriveFn: (
    values: { [K in keyof S]: S[K] extends StoreReadable<infer V> ? V : never },
    set?: (value: T) => void,
  ) => T | void,
  options?: CreateDerivedStoreOptions<T> | null
): StoreReadable<T>;
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `stores` | `StoreReadable<S>` or `StoreReadable<unknown>[]` | - | Single source store, or an array of source stores. |
| `deriveFn` | `(value(s), set?) => T \| void` | - | Function to compute the derived value. With `length === 1` it runs synchronously and its return value is used; with `length >= 2` it runs in async mode and must call `set(value)`. |
| `options` | `object \| null` | `null` | Configuration options. |
| `options.initialValue` | `any` | `undefined` | Initial value before first computation. |
| `options.persist` | `(v: T) => void` | - | Callback to persist value on change. |
| `options.onPersistError` | `(error: unknown) => void` | - | Error handler for persistence failures. |
| `options.eagerPersist` | `boolean` | `true` | Inherited from `CreateStoreOptions`. |

**Returns:** `StoreReadable<T>` - A readable store with `get()` and `subscribe()` methods.

**Behavior:**
- Lazy: source stores are only subscribed once the derived store itself gains its first subscriber. Construction alone does **not** subscribe to sources.
- Unsubscribes from sources when all subscribers are removed.
- Supports both synchronous and asynchronous derivation. The branch is chosen by `deriveFn.length` (matches Svelte: `> 1` → async). Default parameters do not count toward `length`, so prefer two explicit parameters for async deriveFns.
- The unsubscribe function returned by `subscribe` is **idempotent** — calling it multiple times is safe.
- `get()` triggers on-demand computation by temporarily subscribing/unsubscribing. For async deriveFns, `get()` returns whatever value is currently set (initially `options.initialValue`); subscribe and wait for the async result.
- Stale async `set` calls from a previous subscribe-cycle are silently dropped — they cannot leak into the value seen by future subscribers.

**Example (single source):**

```typescript
const count = createStore(3);
const doubled = createDerivedStore(count, (n) => n * 2);

console.log(doubled.get()); // 6
count.set(5);
console.log(doubled.get()); // 10
```

**Example (synchronous, multi-source):**

```typescript
const a = createStore(2);
const b = createStore(3);
const sum = createDerivedStore([a, b], ([aVal, bVal]) => aVal + bVal);

console.log(sum.get()); // 5

const unsub = sum.subscribe(val => console.log(val)); // logs: 5
a.set(10); // logs: 13
unsub();
```

**Example (asynchronous):**

```typescript
const input = createStore("hello");
const delayed = createDerivedStore<string>([input], ([val], set) => {
  // Use the set callback for async updates
  setTimeout(() => set!(val.toUpperCase()), 100);
}, { initialValue: "" });

delayed.subscribe(console.log);
// logs: "" (initial)
// logs: "HELLO" (after 100ms)
```

---

### createStoragePersistor

Creates a storage persistence adapter for use with stores.

```typescript
function createStoragePersistor<T>(
  key: string,
  type?: "session" | "local" | "memory",
  options?: { shared?: boolean }
): Persistor<T>
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | - | The storage key to use. |
| `type` | `"session" \| "local" \| "memory"` | `"session"` | Storage type. |
| `options.shared` | `boolean` | `true` | **Memory-only.** When `false`, the persistor uses its own private `Map` instead of the module-level shared one — useful for hermetic tests. |

**Storage Types:**

| Type | Description |
|------|-------------|
| `"local"` | Uses `localStorage`. Persists across browser sessions. |
| `"session"` | Uses `sessionStorage`. Persists for the current session only. |
| `"memory"` | Uses in-memory `Map`. Clears on page reload. Shared across all "memory" persistors by default; pass `{ shared: false }` for an isolated `Map`. |

**Notes on `set` / `get`:**

- `set(undefined)` removes the key (consistent across all three storage types).
- `get()` returns `undefined` only when the key is **not present**. A legitimately stored falsy value (`0`, `false`, `""`, `null`) is preserved on read.

**Returns:** `Persistor<T>` object with methods:

| Method | Type | Description |
|--------|------|-------------|
| `get` | `() => T \| undefined` | Retrieve stored value, or `undefined` if not found. |
| `set` | `(v: T) => void` | Store a value (JSON serialized for localStorage/sessionStorage). |
| `remove` | `() => void` | Remove the stored value for this key. |
| `clear` | `() => void` | Clear all stored values (affects entire storage). |
| `__raw` | `() => Storage \| Map` | Access underlying storage mechanism (for testing). |

**Example:**

```typescript
const persistor = createStoragePersistor<{ theme: string }>("settings", "local");

// Check for existing value
const existing = persistor.get();
console.log(existing); // undefined or previously saved value

// Save a value
persistor.set({ theme: "dark" });

// Use with createStore
const settings = createStore(persistor.get() ?? { theme: "light" }, {
  persist: persistor.set
});
```

---

### createStorageStore

Convenience function that creates a store with automatic storage persistence.

```typescript
function createStorageStore<T>(
  key: string,
  storageType?: "local" | "session" | "memory",
  initial?: T
): StoreLike<T>
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | - | The storage key to use. |
| `storageType` | `"local" \| "session" \| "memory"` | `"session"` | Storage type. |
| `initial` | `T` | `undefined` | Initial value if nothing is found in storage. |

**Returns:** `StoreLike<T>` - A writable store that automatically persists to storage.

**Behavior:**
- On creation, attempts to restore the value from storage.
- Falls back to `initial` only when the key is **not present** in storage. Falsy persisted values (`0`, `false`, `""`, `null`) round-trip correctly and are not replaced by `initial`.
- Automatically persists on every value change.
- Invalid storage types fall back to `"session"` with a console warning.

**Example:**

```typescript
// Simple usage
const preferences = createStorageStore("prefs", "local", { theme: "dark" });
preferences.set({ theme: "light" }); // automatically saved to localStorage

// Value persists across page reloads
const restored = createStorageStore("prefs", "local", { theme: "dark" });
console.log(restored.get()); // { theme: "light" }
```

---

### isStoreLike

Type guard that checks whether a value implements the store interface.

```typescript
function isStoreLike(v: unknown): v is StoreReadable<unknown>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `v` | `unknown` | Value to check. |

**Returns:** `boolean` - `true` if the value has a `subscribe` method (duck typing). Also acts as a TypeScript type guard.

**Example:**

```typescript
const store = createStore(42);
const notStore = { value: 42 };

console.log(isStoreLike(store));    // true
console.log(isStoreLike(notStore)); // false

// Type narrowing
function processStore(input: unknown) {
  if (isStoreLike(input)) {
    // TypeScript knows input is StoreReadable<unknown> here
    input.subscribe(console.log);
  }
}
```
