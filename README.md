# @marianmeres/store

Basic store. __Should__ be Svelte store contract compatible.

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
store.subscribe(console.log); // log: foo

store.set('bar'); // logs: bar
store.update((old) => old + 'baz'); // logs: barbaz

unsub(); // cleanup

// derived example
const store2 = createStore(123);
const derived = createDerivedStore([store, store2], ([a, b]) => [a, b].join());

// derived store value is intially `undefined` until subscription exists
assert(derived.get() === undefined);

unsub = derived.subscribe(console.log); // logs: barbaz,123

store2.set(456); // logs: barbaz,456

unsub();
store.set(789); // no log
```
