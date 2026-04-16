import { createPubSub } from "@marianmeres/pubsub";

const isFn = (v: unknown): v is CallableFunction => typeof v === "function";

const assertFn = (v: unknown, prefix = "") => {
	if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};

/** Subscription callback function that receives the current store value */
export type Subscribe<T> = (value: T) => void;

/** Unsubscribe function returned by subscribe() to stop receiving updates */
export type Unsubscribe = () => void;

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
 * Uses duck typing to check for the presence of a subscribe method.
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
	 * Receives the error plus pubsub context (`topic`, `isWildcard`) when available.
	 */
	onError?: (error: Error, topic?: string, isWildcard?: boolean) => void;
	/**
	 * Whether to call `persist` once at construction time with the initial value.
	 * Defaults to `true` for backwards compatibility. Set to `false` if `persist`
	 * is expensive (e.g., a network call) and you only want to persist on changes.
	 */
	eagerPersist?: boolean;
}

/**
 * Creates a writable store with reactive subscriptions.
 *
 * The store is Svelte store contract compatible, which means:
 * - Subscriptions are called synchronously with the current value on subscribe
 * - All active subscriptions are notified synchronously when the value changes
 * - Values are compared using strict equality (===) before notifying subscribers
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

	const set = (value: T) => {
		// shallow strict compare
		if (_value !== value) {
			_value = value;
			_maybePersist(_value);
			_pubsub.publish("change", _value);
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
	const subscribe = (cb: Subscribe<T>) => {
		assertFn(cb, "[subscribe]");
		cb(_value);
		return _pubsub.subscribe("change", cb) as Unsubscribe;
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
 * - Supports on-demand computation via get() even without active subscriptions
 *
 * Accepts either a single source store or an array of source stores. When a single
 * store is passed, the deriveFn receives its value directly; when an array is passed,
 * the deriveFn receives an array of values (matching Svelte's `derived` semantics).
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

	const _maybePersist = (v: T) => {
		if (options?.persist) {
			try {
				options.persist(v);
			} catch (e) {
				if (options.onPersistError) {
					options.onPersistError(e);
				} else {
					console.warn("Derived store persistence failed:", e);
				}
			}
		}
	};
	const derived = createStore<T>(options?.initialValue);

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

	const _values: unknown[] = new Array(stores.length);
	let _subsCounter = 0;
	let _internalUnsubs: CallableFunction[] = [];
	// Bumped on every subscribe AND every full unsubscribe. Captured by each
	// subscription closure so stale async `set` calls (or stale source notifications)
	// from a previous subscribe-cycle are silently dropped instead of mutating the
	// derived value seen by future subscribers.
	let _generation = 0;

	const _maybeInternalSubscribe = () => {
		if (!_subsCounter++) {
			_generation++;
			const myGen = _generation;
			let initialized = false;
			const valuesArg = () => (_isSingle ? _values[0] : _values);

			const callDerive = () => {
				if (myGen !== _generation) return;
				if (deriveFn.length === 1) {
					derived.set(deriveFn(valuesArg()));
					_maybePersist(derived.get());
				} else {
					deriveFn(valuesArg(), (v: T) => {
						if (myGen !== _generation) return;
						derived.set(v);
						_maybePersist(derived.get());
					});
				}
			};

			stores.forEach((s, idx) => {
				_internalUnsubs.push(
					s.subscribe((value) => {
						if (myGen !== _generation) return;
						_values[idx] = value;
						if (initialized) callDerive();
					}),
				);
			});

			// Now that all sources are subscribed and _values is populated by the
			// immediate-callback contract, run deriveFn exactly once.
			initialized = true;
			callDerive();
		}
	};

	const _maybeInternalUnsubscribe = () => {
		if (!--_subsCounter) {
			// Invalidate any in-flight async work from this subscription cycle.
			_generation++;
			_internalUnsubs.forEach((u) => u());
			_internalUnsubs = [];
		}
	};

	const subscribe = (cb: Subscribe<T>) => {
		assertFn(cb, "[derived.subscribe]");
		_maybeInternalSubscribe();
		const unsub = derived.subscribe(cb);
		// Idempotent: defensive double-call patterns (React/Svelte teardown, Promise
		// races) must not corrupt _subsCounter and silently break the store.
		let done = false;
		return () => {
			if (done) return;
			done = true;
			_maybeInternalUnsubscribe();
			unsub();
		};
	};

	// Note: get() triggers on-demand computation by temporarily subscribing and unsubscribing.
	// This ensures fresh values are always available, even without active subscriptions.
	// For performance-critical code with frequent reads, maintain an active subscription instead.
	const get = (): T => {
		let v: T;
		subscribe((_v) => (v = _v))(); // sub + unsub
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
 * Values are automatically serialized/deserialized using JSON.
 * Errors are logged to console as warnings.
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
					storage?.setItem(key, JSON.stringify(v));
				}
			} catch (e) {
				console.warn(`Failed to persist to storage key '${key}':`, e);
			}
		},
		get: (): T | undefined => {
			try {
				const item = storage?.getItem(key);
				// Distinguish "not found" (null) from a legitimately stored "" or "0" etc.
				return item == null ? undefined : JSON.parse(item);
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

/**
 * Creates a writable store with automatic storage persistence.
 *
 * This is a convenience wrapper that combines createStore and createStoragePersistor.
 * The store will automatically persist its value to the specified storage on every change.
 * On creation, it attempts to restore the value from storage, falling back to the initial value.
 *
 * Storage retrieval uses nullish coalescing (`??`), so falsy persisted values
 * (`0`, `false`, `""`, `null`) are correctly restored instead of being overridden by `initial`.
 *
 * @example
 * ```ts
 * const preferences = createStorageStore("prefs", "local", { theme: "dark" });
 * preferences.set({ theme: "light" }); // automatically saved to localStorage
 * ```
 */
export const createStorageStore = <T>(
	key: string,
	storageType: "local" | "session" | "memory" = "session",
	initial?: T,
): StoreLike<T> => {
	if (!["local", "session", "memory"].includes(storageType)) {
		console.warn(
			`Ignoring invalid storageType '${storageType}', using 'session' instead.`,
		);
		storageType = "session";
	}
	const persistor = createStoragePersistor<T>(key, storageType);
	// Distinguish "key not present" (undefined) from a legitimately stored falsy
	// value like 0, false, "", or null — all of which must round-trip correctly.
	const stored = persistor.get();
	return createStore<T>(stored !== undefined ? stored : initial as T, {
		persist: persistor.set,
	});
};
