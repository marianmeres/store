import { createPubSub } from '@marianmeres/pubsub';

/*
https://svelte.dev/docs#component-format-script-4-prefix-stores-with-$-to-access-their-values-store-contract

# Store contract

```
store = {
	subscribe: (subscription: (value: any) => void) => (() => void),
	set?: (value: any) => void
}
```

You can create your own stores without relying on svelte/store, by implementing the store
contract:

1. A store must contain a .subscribe method, which must accept as its argument a subscription
function. This subscription function must be immediately and synchronously called with the
store's current value upon calling .subscribe. All of a store's active subscription functions
must later be synchronously called whenever the store's value changes.

2. The .subscribe method must return an unsubscribe function. Calling an unsubscribe
function must stop its subscription, and its corresponding subscription function must not
be called again by the store.

3. A store may optionally contain a .set method, which must accept as its argument a new
value for the store, and which synchronously calls all of the store's active subscription
functions. Such a store is called a writable store.

For interoperability with RxJS Observables, the .subscribe method is also allowed to return
an object with an .unsubscribe method, rather than return the unsubscription function directly.
Note however that unless .subscribe synchronously calls the subscription (which is not
required by the Observable spec), Svelte will see the value of the store as undefined until
it does.
*/

// https://svelte.dev/docs#run-time-svelte-store-writable
// https://svelte.dev/docs#run-time-svelte-store-derived

export interface StoreReadable {
	subscribe: (cb: Function) => Function;
	// extra helpers (outside of svelte store contract)
	get: Function;
	subscribeOnce?: Function;
}

export interface StoreLike extends StoreReadable {
	set: Function;
	update: Function;
}

const isFn = (v) => typeof v === 'function';

const assertFn = (v, prefix = '') => {
	if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};

// naive ducktype
export const isStoreLike = (v) => isFn(v.subscribe);

interface CreateStoreOptions {
	persist: Function;
}

export const createStore = (
	initial = undefined,
	options: Partial<CreateStoreOptions> = null
): StoreLike => {
	const _maybePersist = (v) => isFn(options?.persist) && options.persist(v);
	let _pubsub = createPubSub();
	let _value = initial;

	// (maybe) persist now, even if no subscription
	_maybePersist(_value);

	const get = () => _value;

	// `set` is a method that takes one argument which is the value to be set. The store value
	// gets set to the value of the argument if the store value is not already equal to it.
	const set = (value) => {
		// shallow strict compare
		if (_value !== value) {
			_value = value;
			_maybePersist(_value);
			_pubsub.publish('change', _value);
		}
	};

	// `update` is a method that takes one argument which is a callback. The callback takes
	// the existing store value as its argument and returns the new value to be set to the store.
	const update = (cb) => {
		assertFn(cb, '[update]');
		set(cb(get()));
	};

	// 1. A store must contain a .subscribe method, which must accept as its argument a subscription
	// function. This subscription function must be immediately and synchronously called with the
	// store's current value upon calling .subscribe.
	// 2. The .subscribe method must return an unsubscribe function. Calling an unsubscribe
	// function must stop its subscription, and its corresponding subscription function must not
	// be called again by the store.
	const subscribe = (cb) => {
		assertFn(cb, '[subscribe]');
		cb(_value);
		return _pubsub.subscribe('change', cb);
	};

	return { set, get, update, subscribe };
};

//
interface CreateDerivedStoreOptions extends CreateStoreOptions {
	initialValue: any;
}

export const createDerivedStore = (
	stores: StoreLike[],
	// supporting only subset of svelte api
	deriveFn: (...storesValues) => any,
	options: Partial<CreateDerivedStoreOptions> = null
): StoreReadable => {
	const _maybePersist = (v) => isFn(options?.persist) && options.persist(v);
	const derived = createStore(options?.initialValue);
	const _values = [];

	// save initial values first...
	stores.forEach((s) => {
		if (!isStoreLike(s)) throw new TypeError('Expecting array of StoreLike objects');
		_values.push(s.get());
	});

	//
	let _subsCounter = 0;
	let _internalUnsubs = [];

	//
	const _maybeInternalSubscribe = () => {
		if (!_subsCounter++) {
			// subscribe to each individually and call deriveFn with all values
			stores.forEach((s, idx) => {
				_internalUnsubs.push(
					s.subscribe((value) => {
						_values[idx] = value;
						derived.set(deriveFn(_values));
						_maybePersist(derived.get());
					})
				);
			});
		}
	};

	//
	const _maybeInternalUnsubscribe = () => {
		if (!--_subsCounter) {
			_internalUnsubs.forEach((u) => u());
		}
	};

	//
	const subscribe = (cb) => {
		assertFn(cb, '[derived.subscribe]');
		_maybeInternalSubscribe();
		const unsub = derived.subscribe(cb);
		return () => {
			_maybeInternalUnsubscribe();
			unsub();
		};
	};

	// omitting set (makes no sense for derived)
	return { get: derived.get, subscribe };
};
