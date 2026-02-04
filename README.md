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

Create computed values from other stores:

```typescript
const firstName = createStore("John");
const lastName = createStore("Doe");

// Synchronous derivation
const fullName = createDerivedStore(
  [firstName, lastName],
  ([first, last]) => `${first} ${last}`
);

fullName.subscribe(console.log); // logs: "John Doe"
firstName.set("Jane");           // logs: "Jane Doe"
```

Asynchronous derivation (use the `set` callback):

```typescript
const search = createStore("");
const results = createDerivedStore([search], ([query], set) => {
  // Async operation
  fetchResults(query).then(data => set(data));
}, { initialValue: [] });
```

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

## API

See [API.md](API.md) for complete API documentation.

## License

[MIT](LICENSE)
