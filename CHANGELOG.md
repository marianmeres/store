# Changelog

## Unreleased (3.0.0 candidate)

A thorough re-analysis of the package surfaced several real bugs and design gaps. This release fixes all of them and adds a handful of frequently-requested configuration hooks. Most fixes are behaviorally backward compatible; the ones that aren't are called out explicitly below.

### Bug fixes

- **Derived store no longer leaks `_subsCounter` / source subscriptions** when a subscribe-path throw occurs. Previously, a throwing initial callback or a throwing `deriveFn` on first computation would leave the counter at `1` and keep sources subscribed forever — future subscribers would observe a store in a corrupted state. The subscribe path now rolls back all partial state on failure. (`src/store.ts` — `_maybeInternalSubscribe` try/catch; tests `BUG-7`, `BUG-8`.)
- **`createDerivedStore` honors `options.onError`.** Previously, `onError` passed to `createDerivedStore` was silently dropped — the inner writable store was constructed with no options, so subscriber errors in a derived store fell through to pubsub's default `console.error`. (`src/store.ts` — options forwarded to inner `createStore`; test `BUG-9`.)
- **Derived `persist` fires only on actual value change.** Previously, `_maybePersist` was called unconditionally after every source notification, even when the resulting derived value was unchanged. This was inconsistent with `createStore.set` (which short-circuits on `===`) and caused redundant writes for remote / expensive persistors. Persistence is now routed through the inner store, which applies the same equality gate. (`src/store.ts` — `persist` forwarded; test `BUG-10`.)
- **`createStorageStore` no longer re-writes the value it just read back.** Previously, the default `eagerPersist: true` on the inner store caused a serialize-and-write of the exact value just loaded from storage, on every construction — wasteful for large serialized objects and repeated on every page load. `eagerPersist` is now set automatically based on whether the key was present in storage. (`src/store.ts` — `eagerPersist: stored === undefined`; test `BUG-11`.)

### Design improvements

- **`get()` on derived stores is much cheaper when inactive.**
  - Sync deriveFn + sources exposing `.get()` → evaluated directly from `source.get()`, no subscribe/unsubscribe cycle (tested: `DF-9`).
  - Async deriveFn → returns last cached value; no longer schedules throwaway async work that the generation guard would discard anyway (tested: `DF-10`).
  - Svelte-style source without `.get()` → falls back to the original subscribe/unsubscribe cycle for correctness.
- **Re-entrant `set` is now consistent.** When a subscriber calls `set` during an in-flight publish, the new value is *queued* and applied after the current publish finishes — instead of triggering a nested publish that reorders notifications for remaining subscribers. All subscribers observe the same ordered sequence of values (last-write-wins within a batch). (Test: `DF-11`.)
- **Custom equality (`options.equal`).** Override the strict-equality (`===`) check used to decide whether `set`/`update` should notify. Applies to `createStore`, `createDerivedStore`, and `createStorageStore`. Common idiom: `(a, b) => JSON.stringify(a) === JSON.stringify(b)` for structural comparison. (Test: `DF-12`.)
- **Custom `serialize` / `deserialize` for storage persistors** (`local` / `session` only; memory storage keeps values as-is). Enables `Date`, `Map`, `Set`, `BigInt`, custom schemas, or encryption. (Test: `DF-16`.)
- **`Unsubscribe` supports `Symbol.dispose`.** The subscribe return value is now an interface `{ (): void; [Symbol.dispose](): void }`, so subscriptions work with the TypeScript `using` statement:
  ```ts
  {
    using sub = store.subscribe(v => console.log(v));
  } // sub automatically disposed here
  ```
  Calling it directly as a function continues to work and remains idempotent. (Tests: `DF-15`.)
- **Initial subscriber errors are routed through `onError`** instead of propagating out of `subscribe()`. Previously, if the subscriber callback threw during its immediate first invocation, the throw escaped the caller and the subscription was never registered — easy to lose subscriptions silently. Now the error goes to `options.onError` (or `console.error` if none), and the subscription remains active. (Tests: `DF-13`, `DF-14`.)
- **`createStorageStore` accepts options as a 4th argument** for forwarding `onError`, `equal`, `onPersistError`, `serialize`, `deserialize`, and `shared` through to the underlying persistor + store.

### Breaking changes

The changes below are technically BC-visible. For most users, the new behavior is what you already expected — but each is documented in case you relied on the old quirk.

1. **`Unsubscribe` type gains `[Symbol.dispose]`.** The runtime value returned by `subscribe()` is still callable as a function, so the vast majority of code keeps working unchanged. The only BC-visible shape change is at the type level: user code that declared `const u: Unsubscribe = () => {};` now fails to type-check because the assigned arrow function lacks `[Symbol.dispose]`. Fix: either cast with `as Unsubscribe` after wiring up the dispose method, or simply let the type be inferred from `store.subscribe(...)`.
2. **Derived `persist` is no longer called when the derived value is unchanged.** If you relied on `persist` firing on every source change (e.g., as an "any-activity" audit log), you now need to attach that behavior directly to the source store or to a passthrough derive that never short-circuits.
3. **Derived `onError` now fires.** Code that silently absorbed subscriber errors in a derived store (because `onError` was dropped and the error ended up on `console.error`) will now see that handler invoked. Usually a pure improvement; adjust if your `onError` assumed it would only be called by non-derived stores.
4. **`createStorageStore` does not persist on construction when the key already exists in storage.** Previously, construction always called `persist(currentValue)` — including the no-op round-trip of writing back what was just read. If you had side effects attached to that initial persist call, move them to an explicit `store.set(store.get())` or use `createStore` directly with `eagerPersist: true`.
5. **Initial subscriber errors are caught (BC-visible for callers without `onError`).** Code that expected `store.subscribe(cb)` to *throw* when `cb` throws on its immediate first invocation will no longer see the throw. The subscription is registered (not lost), and the error is reported via `options.onError` (or `console.error`). If you relied on the throw, add an `onError` handler.
6. **Re-entrant `set` no longer publishes nested.** If a subscriber calls `set(V2)` while processing a publish of `V1`, remaining subscribers in the current publish still see `V1`, then everybody sees `V2` in a fresh publish. Previously the nested publish would cause the "later" subscribers in the outer snapshot to see `V1` *after* `V2` — inconsistent ordering. The new behavior is last-write-wins-per-batch with globally consistent ordering. Code that depended on the old interleaving (rare) needs to be restructured.
7. **Derived `get()` side effects removed on inactive stores.** The previous implementation ran a full subscribe/unsubscribe cycle on every `get()` — which meant source sub/unsub callbacks fired, `persist` ran, and (for async deriveFns) an async computation was scheduled and then discarded. These side effects no longer occur on the fast / cached paths. If any of them were load-bearing in your code, add an explicit subscribe.

### Non-breaking additions

- `CreateStoreOptions.equal`
- `CreateStoragePersistorOptions.serialize` / `CreateStoragePersistorOptions.deserialize`
- `CreateStorageStoreOptions<T>` interface and 4th parameter to `createStorageStore`
- Regression tests `BUG-7`..`BUG-11` and feature tests `DF-9`..`DF-17`

---

## 2.5.0

Previous release. See git history for details.
