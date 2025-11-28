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
