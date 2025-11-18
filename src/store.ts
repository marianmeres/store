import { createPubSub } from "@marianmeres/pubsub";

const isFn = (v: any) => typeof v === "function";

const assertFn = (v: any, prefix = "") => {
	if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};

/** Subscribe fn */
export type Subscribe<T> = (value: T) => void;

/** Unsubscribe fn */
export type Unsubscribe = () => void;

/** Updater fn */
export type Update<T> = (value: T) => T;

/** store readable */
export interface StoreReadable<T> {
	subscribe(cb: Subscribe<T>): Unsubscribe;
	// extra
	get: () => T;
}

/** Store like  */
export interface StoreLike<T> extends StoreReadable<T> {
	set(value: T): void;
	update(cb: Update<T>): void;
}

/**
 * Check whether the value looks like a store (Naive ducktype check)
 */
export const isStoreLike = (v: any): boolean => isFn(v.subscribe);

/** Store options */
export interface CreateStoreOptions<T> {
	persist?: (v: T) => void;
}

/**
 * Creates svelte/store compatible store, by implementing the store contract:
 *
 * 1. A store must contain a .subscribe method, which must accept as its argument a subscription
 * function. This subscription function must be immediately and synchronously called with the
 * store's current value upon calling .subscribe. All of a store's active subscription functions
 * must later be synchronously called whenever the store's value changes.
 *
 * 2. The .subscribe method must return an unsubscribe function. Calling an unsubscribe
 * function must stop its subscription, and its corresponding subscription function must not
 * be called again by the store.
 *
 * 3. A store may optionally contain a .set method, which must accept as its argument a new
 * value for the store, and which synchronously calls all of the store's active subscription
 * functions. Such a store is called a writable store.
 *
 * For interoperability with RxJS Observables, the .subscribe method is also allowed to return
 * an object with an .unsubscribe method, rather than return the unsubscription function directly.
 * Note however that unless .subscribe synchronously calls the subscription (which is not
 * required by the Observable spec), Svelte will see the value of the store as undefined until
 * it does.
 */
export const createStore = <T>(
	initial?: T,
	options: CreateStoreOptions<T> | null = null
): StoreLike<T> => {
	const _maybePersist = (v: T) =>
		isFn(options?.persist) && (options as any).persist(v);
	const _pubsub = createPubSub();
	let _value: T = initial as T;

	// (maybe) persist now, even if no subscription
	_maybePersist(_value);

	const get = (): T => _value;

	// `set` is a method that takes one argument which is the value to be set. The store value
	// gets set to the value of the argument if the store value is not already equal to it.
	const set = (value: any) => {
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

//
interface CreateDerivedStoreOptions<T> extends CreateStoreOptions<T> {
	initialValue?: any;
}

/**
 * Creates derived store
 */
export const createDerivedStore = <T>(
	stores: StoreReadable<any>[],
	// supporting only subset of svelte api
	deriveFn: (storesValues: any[], set?: CallableFunction) => T,
	options: CreateDerivedStoreOptions<T> | null = null
): StoreReadable<T> => {
	const _maybePersist = (v: T) =>
		isFn(options?.persist) && (options as any).persist(v);
	const derived = createStore<T>(options?.initialValue);
	const _values: any[] = [];

	// save initial values first...
	stores.forEach((s) => {
		if (!isStoreLike(s))
			throw new TypeError("Expecting array of StoreLike objects");
		// sub & immediately unsub (we could use _values.push(s.get()) but that wouldn't
		// be native Svelte store compatible)
		s.subscribe((v) => _values.push(v))();
	});

	if (!isFn(deriveFn)) {
		throw new TypeError(
			"Expecting second argument to be the derivative function"
		);
	}

	if (!deriveFn.length || deriveFn.length > 2) {
		throw new TypeError(
			"Expecting the derivative function to have exactly 1 or 2 arguments"
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
					})
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

	const get = (): T => {
		let v: any;
		subscribe((_v) => (v = _v))(); // sub + unsub
		return v;
	};

	// omitting set (makes no sense for derived)
	return { get, subscribe };
};

// ADDONS...

// quick-n-dirty helper which plays nicely along

interface Persistor<T> {
	remove: () => void;
	set: (v: T) => void;
	get: () => T | undefined;
	clear: () => void;
	__raw: () => any;
}

let __memory: Record<string, any> = {};

const _createMemoryPersistor = <T>(key: string) => {
	// prettier-ignore
	return {
		remove: () => { delete __memory[key]; },
		set: (v: T) => { __memory[key] = v; },
		get: () => { return __memory[key]; },
		clear: () => { __memory = {}; },
		__raw: () => __memory, // for tests
	};
};

/**
 * Creates store which value persists in storage
 */
export const createStoragePersistor = <T>(
	key: string,
	type: "session" | "local" | "memory" = "session"
): Persistor<T> => {
	// memory special case
	if (type === "memory") return _createMemoryPersistor(key);

	const storage: any =
		type === "session" ? globalThis?.sessionStorage : globalThis?.localStorage;
	// prettier-ignore
	return {
		remove: () => storage?.removeItem(key),
		set: (v: T) => {
			try { storage?.setItem(key, JSON.stringify(v)) } catch (e) { console.error(e) }
		},
		get: (): T | undefined => { 
			try { return JSON.parse(storage?.getItem(key)) } catch (e) {} 
		},
		clear: () => { try {storage.clear() } catch (e) {} },
		__raw: () => storage, // for tests
	};
};

/**
 * Convenience helper to create storage compatible for `createStoragePersistor`
 */
export const createStorageStore = <T>(
	key: string,
	storageType: "local" | "session" | "memory" = "session",
	initial?: T
): StoreLike<T> => {
	if (!["local", "session", "memory"].includes(storageType)) {
		console.warn(
			`Ignoring invalid storageType '${storageType}', using 'session' instead.`
		);
		storageType = "session";
	}
	const persistor = createStoragePersistor<T>(key, storageType);
	return createStore<T>(persistor.get() || initial, { persist: persistor.set });
};
