# @marianmeres/store

[![NPM version](https://img.shields.io/npm/v/@marianmeres/store.svg)](https://www.npmjs.com/package/@marianmeres/store)
[![JSR version](https://jsr.io/badges/@marianmeres/store)](https://jsr.io/@marianmeres/store)
[![License](https://img.shields.io/npm/l/@marianmeres/store)](LICENSE)

Lightweight reactive store implementation with subscriptions and persistence support.
Svelte store contract compatible.

**Features:**
- Reactive state management with subscriptions
- Derived stores for computed values (sync and async)
- Optional persistence to localStorage, sessionStorage, or memory
- Custom equality (`equal`) and custom serializers for non-JSON-safe values
- Re-entrancy-safe `set` (consistent notification ordering across subscribers)
- `Symbol.dispose` support — subscriptions work with `using`
- TypeScript support with full type safety
- Zero dependencies (except pubsub)

## Install

```sh
deno add jsr:@marianmeres/store
```

```sh
npm install @marianmeres/store
```

## Quick Start

```typescript
import { createStore, createDerivedStore } from "@marianmeres/store";

// Create a writable store
const count = createStore(0);

// Subscribe to changes (callback is called immediately with current value)
const unsub = count.subscribe(val => console.log(val)); // logs: 0

// Update the store
count.set(1);              // logs: 1
count.update(n => n + 1);  // logs: 2

// Get current value without subscribing
console.log(count.get()); // 2

unsub(); // stop receiving updates
```

## Derived Stores

Create computed values from other stores. A derived store accepts either a single source store or an array of sources:

```typescript
const firstName = createStore("John");
const lastName = createStore("Doe");

// Single source
const upper = createDerivedStore(firstName, (name) => name.toUpperCase());

// Multiple sources
const fullName = createDerivedStore(
  [firstName, lastName],
  ([first, last]) => `${first} ${last}`
);

fullName.subscribe(console.log); // logs: "John Doe"
firstName.set("Jane");           // logs: "Jane Doe"
```

Asynchronous derivation (use the `set` callback — the deriveFn must declare two explicit parameters):

```typescript
const search = createStore("");
const results = createDerivedStore<Result[]>([search], ([query], set) => {
  fetchResults(query).then(data => set!(data));
}, { initialValue: [] });
```

Derived stores are **lazy**: source stores are only subscribed once the derived store itself gains a subscriber. The unsubscribe function returned by `subscribe()` is **idempotent** — safe to call multiple times.

## Persistence

Automatically persist store values to storage:

```typescript
import { createStorageStore, createStoragePersistor, createStore } from "@marianmeres/store";

// Simple: auto-persisted store
const prefs = createStorageStore("preferences", "local", { theme: "dark" });
prefs.set({ theme: "light" }); // automatically saved to localStorage

// Advanced: manual persistor with error handling
const persistor = createStoragePersistor<number>("counter", "local");
const counter = createStore(persistor.get() ?? 0, {
  persist: persistor.set,
  onPersistError: (e) => console.error("Storage failed:", e)
});
```

Storage types: `"local"` (localStorage), `"session"` (sessionStorage), `"memory"` (in-memory Map).

Custom serializers are supported for non-JSON-safe values (`Date`, `Map`, `Set`, `BigInt`, encrypted payloads, etc.):

```typescript
const persistor = createStoragePersistor<Date>("when", "local", {
  serialize: (v) => (v as Date).toISOString(),
  deserialize: (s) => new Date(s),
});
```

## Custom equality

By default, `set`/`update` notify subscribers only when the new value differs by strict equality (`===`). Pass a custom `equal` comparator when you want structural comparison:

```typescript
const store = createStore({ count: 0 }, {
  equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});
store.set({ count: 0 }); // no notification — same shape
store.set({ count: 1 }); // notifies
```

## Resource disposal (`using`)

The unsubscribe function returned by `subscribe()` implements `Symbol.dispose`, so subscriptions can be tied to a block with the `using` statement (TypeScript ES2024):

```typescript
{
  using sub = store.subscribe(v => console.log(v));
  // ...work...
} // sub is automatically disposed here
```

Calling the unsubscribe directly (as a function) continues to work and remains idempotent.

## API

See [API.md](API.md) for complete API documentation. See [CHANGELOG.md](CHANGELOG.md) for migration notes between versions.

## License

[MIT](LICENSE)
