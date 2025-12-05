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
	/** Optional error handler for subscriber errors */
	onError?: (error: Error) => void;
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
export const createStore = <T>(
	initial?: T,
	options: CreateStoreOptions<T> | null = null,
): StoreLike<T> => {
	const _maybePersist = (v: T) => {
		if (options?.persist) {
			try {
				options.persist(v);
			} catch (e) {
				if (options.onPersistError) {
					options.onPersistError(e);
				} else {
					console.warn('Store persistence failed:', e);
				}
			}
		}
	};
	const _pubsub = createPubSub(
		options?.onError ? { onError: (e) => options.onError!(e) } : undefined
	);
	let _value: T = initial as T;

	// (maybe) persist now, even if no subscription
	_maybePersist(_value);

	const get = (): T => _value;

	// `set` is a method that takes one argument which is the value to be set. The store value
	// gets set to the value of the argument if the store value is not already equal to it.
	const set = (value: T) => {
		// shallow strict compare
		if (_value !== value) {
			_value = value;
			_maybePersist(_value);
			_pubsub.publish("change", _value);
		}
	};

	// `update` is a method that takes one argument which is a callback. The callback takes
	// the existing store value as its argument and returns the new value to be set to the store.
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
		return _pubsub.subscribe("change", cb);
	};

	return { set, get, update, subscribe };
};

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
 * @param stores - Array of source stores to derive from
 * @param deriveFn - Function to compute the derived value. Takes an array of source values
 *                   and optionally a set callback for async updates
 * @param options - Optional configuration for initial value and persistence
 * @returns A readable store with get() and subscribe() methods
 *
 * @example
 * ```ts
 * // Synchronous derivation
 * const a = createStore(2);
 * const b = createStore(3);
 * const sum = createDerivedStore([a, b], ([aVal, bVal]) => aVal + bVal);
 * console.log(sum.get()); // 5
 *
 * // Asynchronous derivation
 * const async = createDerivedStore([a], ([val], set) => {
 *   setTimeout(() => set(val * 2), 100);
 * });
 * ```
 */
export const createDerivedStore = <T>(
	// deno-lint-ignore no-explicit-any -- allows composing stores of different types
	stores: StoreReadable<any>[],
	// deno-lint-ignore no-explicit-any -- matches stores array (mixed types)
	deriveFn: (storesValues: any[], set?: CallableFunction) => T,
	options: CreateDerivedStoreOptions<T> | null = null,
): StoreReadable<T> => {
	const _maybePersist = (v: T) => {
		if (options?.persist) {
			try {
				options.persist(v);
			} catch (e) {
				if (options.onPersistError) {
					options.onPersistError(e);
				} else {
					console.warn('Derived store persistence failed:', e);
				}
			}
		}
	};
	const derived = createStore<T>(options?.initialValue);
	const _values: unknown[] = [];

	// save initial values first...
	stores.forEach((s) => {
		if (!isStoreLike(s)) {
			throw new TypeError("Expecting array of StoreLike objects");
		}
		// sub & immediately unsub (we could use _values.push(s.get()) but that wouldn't
		// be native Svelte store compatible)
		s.subscribe((v) => _values.push(v))();
	});

	if (!isFn(deriveFn)) {
		throw new TypeError(
			"Expecting second argument to be the derivative function",
		);
	}

	if (!deriveFn.length || deriveFn.length > 2) {
		throw new TypeError(
			"Expecting the derivative function to have exactly 1 or 2 arguments",
		);
	}

	//
	let _subsCounter = 0;
	let _internalUnsubs: CallableFunction[] = [];

	//
	const _maybeInternalSubscribe = () => {
		if (!_subsCounter++) {
			// subscribe to each individually and call deriveFn with all values
			stores.forEach((s, idx) => {
				_internalUnsubs.push(
					s.subscribe((value) => {
						_values[idx] = value;
						if (deriveFn.length === 1) {
							derived.set(deriveFn(_values));
							_maybePersist(derived.get());
						} else {
							deriveFn(_values, (v: T) => {
								derived.set(v);
								_maybePersist(derived.get());
							});
						}
					}),
				);
			});
		}
	};

	//
	const _maybeInternalUnsubscribe = () => {
		if (!--_subsCounter) {
			_internalUnsubs.forEach((u) => u());
			_internalUnsubs = [];
		}
	};

	//
	const subscribe = (cb: Subscribe<T>) => {
		assertFn(cb, "[derived.subscribe]");
		_maybeInternalSubscribe();
		const unsub = derived.subscribe(cb);
		return () => {
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
};

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
	__raw: () => Storage | Map<string, unknown>;
}

const _memoryStorage = new Map<string, unknown>();

const _createMemoryPersistor = <T>(key: string): Persistor<T> => {
	// prettier-ignore
	return {
		remove: () => {
			_memoryStorage.delete(key);
		},
		set: (v: T) => {
			_memoryStorage.set(key, v);
		},
		get: (): T | undefined => {
			return _memoryStorage.get(key) as T | undefined;
		},
		clear: () => {
			_memoryStorage.clear();
		},
		__raw: () => _memoryStorage, // for tests
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
 * @param key - The storage key to use
 * @param type - Storage type: "local", "session", or "memory"
 * @returns A persistor object with get/set/remove/clear methods
 *
 * @example
 * ```ts
 * const persistor = createStoragePersistor("user", "local");
 * const store = createStore(persistor.get() || { name: "Guest" }, {
 *   persist: persistor.set
 * });
 * ```
 */
export const createStoragePersistor = <T>(
	key: string,
	type: "session" | "local" | "memory" = "session",
): Persistor<T> => {
	// memory special case
	if (type === "memory") return _createMemoryPersistor(key);

	const storage: Storage | undefined = type === "session"
		? globalThis?.sessionStorage
		: globalThis?.localStorage;
	// prettier-ignore
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
				storage?.setItem(key, JSON.stringify(v));
			} catch (e) {
				console.warn(`Failed to persist to storage key '${key}':`, e);
			}
		},
		get: (): T | undefined => {
			try {
				const item = storage?.getItem(key);
				return item ? JSON.parse(item) : undefined;
			} catch (e) {
				console.warn(`Failed to read from storage key '${key}':`, e);
				return undefined;
			}
		},
		clear: () => {
			try {
				storage?.clear();
			} catch (e) {
				console.warn('Failed to clear storage:', e);
			}
		},
		__raw: () => storage, // for tests
	};
};

/**
 * Creates a writable store with automatic storage persistence.
 *
 * This is a convenience wrapper that combines createStore and createStoragePersistor.
 * The store will automatically persist its value to the specified storage on every change.
 * On creation, it attempts to restore the value from storage, falling back to the initial value.
 *
 * @param key - The storage key to use
 * @param storageType - Storage type: "local", "session", or "memory" (default: "session")
 * @param initial - Initial value if nothing is found in storage
 * @returns A writable store that automatically persists to storage
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
	return createStore<T>(persistor.get() || initial, { persist: persistor.set });
};
