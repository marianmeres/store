import { createPubSub } from "@marianmeres/pubsub";

const isFn = (v: unknown): v is CallableFunction => typeof v === "function";

const assertFn = (v: unknown, prefix = "") => {
	if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};

const strictEqual = <T>(a: T, b: T): boolean => a === b;

/** Subscription callback function that receives the current store value */
export type Subscribe<T> = (value: T) => void;

/**
 * Unsubscribe function returned by subscribe() to stop receiving updates.
 *
 * Implements `Symbol.dispose`, so the subscription can be used with the `using`
 * statement (TypeScript ES2024 / explicit resource management):
 *
 * ```ts
 * using sub = store.subscribe(v => console.log(v));
 * // sub is automatically disposed at the end of the enclosing block.
 * ```
 *
 * Calling the function directly is still supported and is idempotent —
 * calling it more than once is a safe no-op.
 */
export interface Unsubscribe {
	(): void;
	[Symbol.dispose](): void;
}

/**
 * Wraps a teardown function in an idempotent {@link Unsubscribe} that also
 * responds to `Symbol.dispose`. Calling the returned value more than once is
 * a no-op.
 */
const makeUnsubscribe = (fn: () => void): Unsubscribe => {
	let done = false;
	const u = (() => {
		if (done) return;
		done = true;
		fn();
	}) as Unsubscribe;
	(u as unknown as { [Symbol.dispose]: () => void })[Symbol.dispose] = u;
	return u;
};

/** Update function that receives the current value and returns the new value */
export type Update<T> = (value: T) => T;

/** Readable store interface with subscribe and get methods */
export interface StoreReadable<T> {
	subscribe(cb: Subscribe<T>): Unsubscribe;
	get: () => T;
}

/** Writable store interface extending readable with set and update methods */
export interface StoreLike<T> extends StoreReadable<T> {
	set(value: T): void;
	update(cb: Update<T>): void;
}

/**
 * Check whether a value implements the store interface.
 *
 * Intentionally loose: duck-types on the presence of a `subscribe` method only,
 * so Svelte-style stores (which do not expose a `get()`) also satisfy the guard.
 * Consumers that specifically require `get()` should narrow further at the
 * call-site.
 */
export const isStoreLike = (v: unknown): v is StoreReadable<unknown> =>
	v !== null &&
	typeof v === "object" &&
	"subscribe" in v &&
	isFn((v as { subscribe: unknown }).subscribe);

/** Configuration options for store creation */
export interface CreateStoreOptions<T> {
	/** Optional callback to persist store values (e.g., to localStorage) */
	persist?: (v: T) => void;
	/** Optional callback to handle persistence errors */
	onPersistError?: (error: unknown) => void;
	/**
	 * Optional error handler for subscriber errors.
	 *
	 * Receives the error plus pubsub context (`topic`, `isWildcard`) when available.
	 * Errors thrown from the *initial* immediate call to a subscriber (on
	 * `subscribe`) are also routed here — they do **not** propagate to the caller
	 * of `subscribe`.
	 */
	onError?: (error: Error, topic?: string, isWildcard?: boolean) => void;
	/**
	 * Whether to call `persist` once at construction time with the initial value.
	 * Defaults to `true` for backwards compatibility. Set to `false` if `persist`
	 * is expensive (e.g., a network call) and you only want to persist on changes.
	 */
	eagerPersist?: boolean;
	/**
	 * Custom equality used to decide whether `set`/`update` should notify
	 * subscribers. Defaults to strict equality (`===`). A common use is
	 * `(a, b) => JSON.stringify(a) === JSON.stringify(b)` for shallow/deep
	 * structural comparison.
	 */
	equal?: (a: T, b: T) => boolean;
}

/**
 * Creates a writable store with reactive subscriptions.
 *
 * The store is Svelte store contract compatible:
 * - Subscriptions are called synchronously with the current value on subscribe
 * - All active subscriptions are notified synchronously when the value changes
 * - Values are compared using the `equal` option (default strict equality `===`)
 *   before notifying subscribers
 *
 * Re-entrant writes (calling `set` / `update` from inside a subscriber callback)
 * are **queued** and applied after the current publish finishes, so every
 * subscriber observes the same, consistent sequence of values.
 *
 * @param initial - The initial value of the store
 * @param options - Optional configuration for persistence and error handling
 * @returns A writable store with get(), set(), update(), and subscribe() methods
 *
 * @example
 * ```ts
 * const count = createStore(0);
 * const unsub = count.subscribe(val => console.log(val)); // logs: 0
 * count.set(1); // logs: 1
 * count.update(n => n + 1); // logs: 2
 * unsub();
 * ```
 */
export function createStore<T>(
	initial: T,
	options?: CreateStoreOptions<T> | null,
): StoreLike<T>;
export function createStore<T>(
	initial?: T | undefined,
	options?: CreateStoreOptions<T | undefined> | null,
): StoreLike<T | undefined>;
export function createStore<T>(
	initial?: T,
	options: CreateStoreOptions<T> | null = null,
): StoreLike<T> {
	const _equal = (options?.equal ?? strictEqual) as (a: T, b: T) => boolean;

	const _maybePersist = (v: T) => {
		if (options?.persist) {
			try {
				options.persist(v);
			} catch (e) {
				if (options.onPersistError) {
					options.onPersistError(e);
				} else {
					console.warn("Store persistence failed:", e);
				}
			}
		}
	};

	const _handleInitialSubscriberError = (e: unknown) => {
		const err = e instanceof Error ? e : new Error(String(e));
		if (options?.onError) {
			options.onError(err, "change", false);
		} else {
			console.error(`Error in subscriber for topic "change":`, err);
		}
	};

	const _pubsub = createPubSub(
		options?.onError
			? {
				onError: (e, topic, isWildcard) =>
					options.onError!(e, topic, isWildcard),
			}
			: undefined,
	);

	let _value: T = initial as T;

	// (maybe) persist now, even if no subscription
	if (options?.eagerPersist !== false) {
		_maybePersist(_value);
	}

	const get = (): T => _value;

	// Re-entrant publish safety:
	// if a subscriber calls set() during an in-flight publish, defer the new
	// value until the current publish finishes. This keeps every subscriber on
	// the same ordered view of value history (last-write-wins within a batch),
	// instead of letting a nested publish reorder notifications.
	let _notifying = false;
	let _hasPending = false;
	let _pendingValue: T;

	const _applyChange = (value: T) => {
		_value = value;
		_maybePersist(_value);
		_pubsub.publish("change", _value);
	};

	const set = (value: T) => {
		if (_equal(_value, value)) return;
		if (_notifying) {
			_hasPending = true;
			_pendingValue = value;
			return;
		}
		_notifying = true;
		try {
			_applyChange(value);
			while (_hasPending) {
				const next = _pendingValue;
				_hasPending = false;
				if (!_equal(_value, next)) _applyChange(next);
			}
		} finally {
			_notifying = false;
			_hasPending = false;
		}
	};

	const update = (cb: Update<T>) => {
		assertFn(cb, "[update]");
		set(cb(get()));
	};

	// 1. A store must contain a .subscribe method, which must accept as its argument a subscription
	// function. This subscription function must be immediately and synchronously called with the
	// store's current value upon calling .subscribe.
	// 2. The .subscribe method must return an unsubscribe function. Calling an unsubscribe
	// function must stop its subscription, and its corresponding subscription function must not
	// be called again by the store.
	const subscribe = (cb: Subscribe<T>): Unsubscribe => {
		assertFn(cb, "[subscribe]");
		// Initial-call errors are routed to the same error path as subsequent
		// notifications, so a throwing initial call no longer (a) propagates to
		// the caller of subscribe, nor (b) leaves the subscription unregistered.
		try {
			cb(_value);
		} catch (e) {
			_handleInitialSubscriberError(e);
		}
		return _pubsub.subscribe("change", cb) as unknown as Unsubscribe;
	};

	return { set, get, update, subscribe };
}

/** Configuration options for derived store creation */
interface CreateDerivedStoreOptions<T> extends CreateStoreOptions<T> {
	/** Initial value for the derived store before first computation */
	// deno-lint-ignore no-explicit-any -- allows flexible initial values before T is computed
	initialValue?: any;
}

/**
 * Creates a derived store that computes its value from one or more source stores.
 *
 * The derived store:
 * - Automatically subscribes to source stores only when it has active subscribers
 * - Unsubscribes from sources when all subscribers are removed
 * - Can compute values synchronously or asynchronously (using the set callback)
 * - Supports on-demand computation via `get()` even without active subscriptions.
 *   For sync `deriveFn`s, `get()` reads sources via their own `get()` (fast path,
 *   no source subscribe/unsubscribe churn); for async `deriveFn`s, it returns
 *   the last cached value.
 *
 * Accepts either a single source store or an array of source stores. When a single
 * store is passed, the deriveFn receives its value directly; when an array is passed,
 * the deriveFn receives an array of values (matching Svelte's `derived` semantics).
 *
 * Errors thrown from a subscribe attempt (either by the user-supplied callback
 * on its initial call or by `deriveFn` during initial computation) do **not**
 * leak internal state — the subscription counter and source subscriptions are
 * rolled back before the error is re-thrown.
 *
 * @example
 * ```ts
 * // Single source
 * const doubled = createDerivedStore(count, n => n * 2);
 *
 * // Multiple sources
 * const sum = createDerivedStore([a, b], ([aVal, bVal]) => aVal + bVal);
 *
 * // Async derivation
 * const fetched = createDerivedStore([query], ([q], set) => {
 *   fetch(`/search?q=${q}`).then(r => r.json()).then(set);
 * }, { initialValue: null });
 * ```
 */
export function createDerivedStore<T, S = unknown>(
	store: StoreReadable<S>,
	deriveFn: (value: S, set?: (value: T) => void) => T | void,
	options?: CreateDerivedStoreOptions<T> | null,
): StoreReadable<T>;
export function createDerivedStore<
	T,
	S extends StoreReadable<unknown>[] = StoreReadable<unknown>[],
>(
	stores: [...S],
	deriveFn: (
		values: { [K in keyof S]: S[K] extends StoreReadable<infer V> ? V : never },
		set?: (value: T) => void,
	) => T | void,
	options?: CreateDerivedStoreOptions<T> | null,
): StoreReadable<T>;
export function createDerivedStore<T>(
	// deno-lint-ignore no-explicit-any -- runtime accepts either form
	storesOrStore: any,
	// deno-lint-ignore no-explicit-any -- arity validated at runtime
	deriveFn: any,
	options: CreateDerivedStoreOptions<T> | null = null,
): StoreReadable<T> {
	const _isSingle = !Array.isArray(storesOrStore);
	const stores: StoreReadable<unknown>[] = _isSingle
		? [storesOrStore]
		: storesOrStore;

	// Validate sources without eagerly subscribing — sources are only subscribed
	// to once the derived store itself gains its first subscriber (lazy contract).
	stores.forEach((s) => {
		if (!isStoreLike(s)) {
			throw new TypeError(
				_isSingle
					? "Expecting a StoreLike object"
					: "Expecting array of StoreLike objects",
			);
		}
	});

	if (!isFn(deriveFn)) {
		throw new TypeError(
			"Expecting second argument to be the derivative function",
		);
	}

	if (deriveFn.length < 1) {
		throw new TypeError(
			"Expecting the derivative function to accept at least 1 argument",
		);
	}

	// Forward persistence, error handling and equality into the inner writable
	// store so every code path (sync set, async set, re-entrant set, …) runs
	// through the same normalized machinery. `eagerPersist: false` because
	// `initialValue` is a placeholder for "not yet derived" — persistence only
	// fires when a real derivation produces a value that differs from it.
	const derived = createStore<T>(options?.initialValue, {
		onError: options?.onError,
		persist: options?.persist,
		onPersistError: options?.onPersistError,
		equal: options?.equal,
		eagerPersist: false,
	});

	const _values: unknown[] = new Array(stores.length);
	let _subsCounter = 0;
	let _internalUnsubs: CallableFunction[] = [];
	// Bumped on every subscribe AND every full unsubscribe. Captured by each
	// subscription closure so stale async `set` calls (or stale source notifications)
	// from a previous subscribe-cycle are silently dropped instead of mutating the
	// derived value seen by future subscribers.
	let _generation = 0;

	const _teardownSources = () => {
		for (const u of _internalUnsubs) {
			try {
				u();
			} catch {
				// best-effort teardown; swallow individual source unsubscribe failures
			}
		}
		_internalUnsubs = [];
	};

	const _maybeInternalSubscribe = () => {
		if (_subsCounter++ !== 0) return;
		_generation++;
		const myGen = _generation;
		let initialized = false;
		const valuesArg = () => (_isSingle ? _values[0] : _values);

		const callDerive = () => {
			if (myGen !== _generation) return;
			if (deriveFn.length === 1) {
				derived.set(deriveFn(valuesArg()));
			} else {
				deriveFn(valuesArg(), (v: T) => {
					if (myGen !== _generation) return;
					derived.set(v);
				});
			}
		};

		// Rollback guard: any throw during source subscription or initial derive
		// must restore the counter and tear down whatever was partially wired up,
		// otherwise future subscribers see a corrupted state (counter stuck > 0,
		// sources subscribed forever). See BUG-7 regression tests.
		try {
			for (let idx = 0; idx < stores.length; idx++) {
				const s = stores[idx];
				_internalUnsubs.push(
					s.subscribe((value) => {
						if (myGen !== _generation) return;
						_values[idx] = value;
						if (initialized) callDerive();
					}),
				);
			}
			initialized = true;
			callDerive();
		} catch (e) {
			_generation++; // invalidate the failed cycle
			_teardownSources();
			_subsCounter = 0;
			throw e;
		}
	};

	const _maybeInternalUnsubscribe = () => {
		if (--_subsCounter !== 0) return;
		// Invalidate any in-flight async work from this subscription cycle.
		_generation++;
		_teardownSources();
	};

	const subscribe = (cb: Subscribe<T>): Unsubscribe => {
		assertFn(cb, "[derived.subscribe]");
		_maybeInternalSubscribe();
		let innerUnsub: Unsubscribe;
		try {
			// `derived.subscribe` now catches initial-cb throws internally (see
			// createStore), but rolling back here is still the right safeguard for
			// any unexpected synchronous failure from the inner subscribe path.
			innerUnsub = derived.subscribe(cb);
		} catch (e) {
			_maybeInternalUnsubscribe();
			throw e;
		}
		// Idempotent: defensive double-call patterns (React/Svelte teardown, Promise
		// races) must not corrupt _subsCounter and silently break the store.
		return makeUnsubscribe(() => {
			_maybeInternalUnsubscribe();
			innerUnsub();
		});
	};

	// Decided once at construction: can we compute `get()` synchronously from
	// sources without a subscribe/unsubscribe dance? We need a sync deriveFn
	// AND every source must expose a `get()` method (Svelte-style stores
	// satisfy isStoreLike but do not always expose `get`).
	const _canFastGet = deriveFn.length === 1 &&
		stores.every((s) => typeof (s as { get?: unknown }).get === "function");

	// On-demand computation for callers without active subscriptions:
	// - Fast path: sync deriveFn + every source has `get()` → evaluate directly.
	// - Async deriveFn: return the last cached value. Invoking the async
	//   deriveFn here would only schedule work that the generation guard
	//   discards anyway, so we skip it entirely.
	// - Sync deriveFn without source `get()`: fall back to subscribe/unsub cycle.
	const get = (): T => {
		if (_subsCounter > 0) return derived.get();
		if (_canFastGet) {
			const vals = _isSingle
				? stores[0].get()
				: stores.map((s) => s.get());
			return deriveFn(vals) as T;
		}
		if (deriveFn.length >= 2) {
			return derived.get();
		}
		let v: T;
		const u = subscribe((_v) => (v = _v));
		u();
		return v!;
	};

	// omitting set (makes no sense for derived)
	return { get, subscribe };
}

/** Storage persistor interface for storing and retrieving values */
interface Persistor<T> {
	/** Remove the stored value for this key */
	remove: () => void;
	/** Store a value */
	set: (v: T) => void;
	/** Retrieve the stored value, or undefined if not found */
	get: () => T | undefined;
	/** Clear all stored values (affects entire storage) */
	clear: () => void;
	/** Access the underlying storage mechanism (for testing) */
	__raw: () => Storage | Map<string, unknown> | undefined;
}

/** Options for createStoragePersistor */
export interface CreateStoragePersistorOptions {
	/**
	 * For `"memory"` type only. When `false`, the persistor uses its own private
	 * `Map` instead of the module-level shared one. Defaults to `true` for
	 * backwards compatibility.
	 */
	shared?: boolean;
	/**
	 * Custom serializer for `"local"` / `"session"` storage. Defaults to
	 * `JSON.stringify`. Ignored for `"memory"` (values are stored as-is).
	 *
	 * Useful for values that don't round-trip through JSON cleanly (Date, Map,
	 * Set, BigInt, etc.), or for custom schemas / encryption.
	 */
	serialize?: (v: unknown) => string;
	/**
	 * Custom deserializer for `"local"` / `"session"` storage. Defaults to
	 * `JSON.parse`. Ignored for `"memory"`.
	 */
	deserialize?: (s: string) => unknown;
}

const _memoryStorage = new Map<string, unknown>();

const _createMemoryPersistor = <T>(
	key: string,
	shared = true,
): Persistor<T> => {
	const storage = shared ? _memoryStorage : new Map<string, unknown>();
	return {
		remove: () => {
			storage.delete(key);
		},
		set: (v: T) => {
			// Treat undefined as "remove" for consistency with the localStorage adapter.
			if (v === undefined) {
				storage.delete(key);
			} else {
				storage.set(key, v);
			}
		},
		get: (): T | undefined => {
			return storage.get(key) as T | undefined;
		},
		clear: () => {
			storage.clear();
		},
		__raw: () => storage,
	};
};

/**
 * Creates a storage persistence adapter for use with stores.
 *
 * Supports three storage types:
 * - "local": Uses localStorage (persists across browser sessions)
 * - "session": Uses sessionStorage (persists for the current session)
 * - "memory": Uses in-memory Map (clears on page reload)
 *
 * Values are serialized with `JSON.stringify` / `JSON.parse` by default for
 * localStorage / sessionStorage; pass custom `serialize` / `deserialize` for
 * non-JSON-safe values. Memory storage keeps values as-is.
 *
 * Errors during storage operations are caught and logged to console as
 * warnings.
 *
 * @example
 * ```ts
 * const persistor = createStoragePersistor("user", "local");
 * const store = createStore(persistor.get() ?? { name: "Guest" }, {
 *   persist: persistor.set
 * });
 *
 * // Memory persistor with isolated storage (useful for tests):
 * const isolated = createStoragePersistor("k", "memory", { shared: false });
 *
 * // Custom serializer for Date values:
 * const datePersistor = createStoragePersistor<Date>("when", "local", {
 *   serialize: (v) => (v as Date).toISOString(),
 *   deserialize: (s) => new Date(s),
 * });
 * ```
 */
export const createStoragePersistor = <T>(
	key: string,
	type: "session" | "local" | "memory" = "session",
	options?: CreateStoragePersistorOptions,
): Persistor<T> => {
	if (type === "memory") {
		return _createMemoryPersistor<T>(key, options?.shared !== false);
	}

	const serialize = options?.serialize ?? JSON.stringify;
	const deserialize = options?.deserialize ?? JSON.parse;
	const storage: Storage | undefined =
		type === "session" ? globalThis?.sessionStorage : globalThis?.localStorage;
	return {
		remove: () => {
			try {
				storage?.removeItem(key);
			} catch (e) {
				console.warn(`Failed to remove storage key '${key}':`, e);
			}
		},
		set: (v: T) => {
			try {
				if (v === undefined) {
					storage?.removeItem(key);
				} else {
					storage?.setItem(key, serialize(v));
				}
			} catch (e) {
				console.warn(`Failed to persist to storage key '${key}':`, e);
			}
		},
		get: (): T | undefined => {
			try {
				const item = storage?.getItem(key);
				// Distinguish "not found" (null) from a legitimately stored "" or "0" etc.
				return item == null ? undefined : (deserialize(item) as T);
			} catch (e) {
				console.warn(`Failed to read from storage key '${key}':`, e);
				return undefined;
			}
		},
		clear: () => {
			try {
				storage?.clear();
			} catch (e) {
				console.warn("Failed to clear storage:", e);
			}
		},
		__raw: () => storage,
	};
};

/** Options for createStorageStore */
export interface CreateStorageStoreOptions<T> extends CreateStoragePersistorOptions {
	/** Subscriber error handler — forwarded to the underlying `createStore`. */
	onError?: CreateStoreOptions<T>["onError"];
	/** Custom equality — forwarded to the underlying `createStore`. */
	equal?: CreateStoreOptions<T>["equal"];
	/** Persistence error handler — forwarded to the underlying `createStore`. */
	onPersistError?: CreateStoreOptions<T>["onPersistError"];
}

/**
 * Creates a writable store with automatic storage persistence.
 *
 * This is a convenience wrapper that combines createStore and createStoragePersistor.
 * The store will automatically persist its value to the specified storage on every change.
 * On creation, it attempts to restore the value from storage, falling back to the initial value.
 *
 * Storage retrieval distinguishes "key absent" (→ fall back to `initial`) from
 * "key present with falsy value" (`0`, `false`, `""`, `null` all round-trip
 * correctly).
 *
 * When the value is successfully restored from storage, the construction-time
 * persist is skipped automatically to avoid a redundant round-trip write.
 *
 * @example
 * ```ts
 * const preferences = createStorageStore("prefs", "local", { theme: "dark" });
 * preferences.set({ theme: "light" }); // automatically saved to localStorage
 *
 * // With custom serializer + subscriber error handler:
 * const store = createStorageStore("k", "local", initial, {
 *   serialize: customSerialize,
 *   deserialize: customDeserialize,
 *   onError: (e) => reportError(e),
 * });
 * ```
 */
export const createStorageStore = <T>(
	key: string,
	storageType: "local" | "session" | "memory" = "session",
	initial?: T,
	options?: CreateStorageStoreOptions<T>,
): StoreLike<T> => {
	if (!["local", "session", "memory"].includes(storageType)) {
		console.warn(
			`Ignoring invalid storageType '${storageType}', using 'session' instead.`,
		);
		storageType = "session";
	}
	const persistor = createStoragePersistor<T>(key, storageType, options);
	// Distinguish "key not present" (undefined) from a legitimately stored falsy
	// value like 0, false, "", or null — all of which must round-trip correctly.
	const stored = persistor.get();
	return createStore<T>(stored !== undefined ? stored : (initial as T), {
		persist: persistor.set,
		// Skip the redundant "write back what we just read" round-trip; only
		// eagerly persist when the key was absent and we're installing `initial`.
		eagerPersist: stored === undefined,
		equal: options?.equal,
		onError: options?.onError,
		onPersistError: options?.onPersistError,
	});
};
