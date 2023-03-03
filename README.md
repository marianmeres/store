# @marianmeres/store

Basic store. Svelte store contract compatible.

## Install
```shell
$ npm i @marianmeres/store
```

## Usage

```typescript
const store = createStore('foo');
assert('foo' === store.get());

store.set('bar');
assert('bar' === store.get());

store.update((old) => old + 'baz');
assert('barbaz' === store.get());

const store2 = createStore(123);
const derived = createDerivedStore([store, store2], ([a, b]) => [a, b].join());

assert(derived.get() === undefined);

store2.set(456);
assert(derived.get() === 'barbaz,456');
```
