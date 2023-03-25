# @marianmeres/store

Basic store (arbitrary data with the ability to subscribe to changes) utility.
[Svelte store contract](https://svelte.dev/docs#component-format-script-4-prefix-stores-with-$-to-access-their-values-store-contract) compatible.

## Install
```shell
$ npm i @marianmeres/store
```

## Usage

```typescript
const store = createStore('foo');

// always able to `get` current value
assert('foo' === store.get());

// from now on, console.log changes
let unsub = store.subscribe(console.log); // log: foo

store.set('bar'); // logs: bar
store.update((old) => old + 'baz'); // logs: barbaz

unsub(); // stop console.log changes for `store`

// derived example
const store2 = createStore(123);
const derived = createDerivedStore([store, store2], ([a, b]) => [a, b].join());

// derived store value is intially `undefined` until subscription exists
assert(derived.get() === undefined);

unsub = derived.subscribe(console.log); // logs: barbaz,123

store2.set(456); // logs: barbaz,456

unsub();
store.set(789); // no log

// derived async example (the deriveFn accepts second 'set' argument)
const derivedAsync = createDerivedStore([store, store2], ([a, b], set) => {
    setTimeout(() => { set([a, b].join()) }, 1000)
});
```
