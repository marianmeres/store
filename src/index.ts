import { createPubSub } from '@marianmeres/pubsub';

export interface StoreReadable {
	get: Function;
	subscribe: (cb: Function, getImmediate?: boolean) => Function;
	subscribeOnce?: Function;
}

export interface StoreLike extends StoreReadable {
	set: Function;
	update: Function;
}

const isFn = (v) => typeof v === 'function';

const assertTypeFn = (v, prefix = '') => {
	if (!Array.isArray(v)) v = [v];
	v.forEach((fn) => {
		if (!isFn(fn)) {
			throw new TypeError(`${prefix} Expecting function type`.trim());
		}
	});
};

// naive ducktype discovery
export const isStoreLike = (v) => isFn(v.subscribe) && isFn(v.get);

//
export const createStore = (initial, { persist } = { persist: null }): StoreLike => {
	let _pubsub = createPubSub();
	let _value = initial;

	const set = (value) => {
		// shallow strict compare
		if (_value !== value) {
			_value = value;
			isFn(persist) && persist(_value);
			_pubsub.publish('change', _value);
		}
	};

	const get = () => _value;

	const update = (cb) => {
		assertTypeFn(cb, '[createStore.update]');
		set(cb(get()));
	};

	const subscribe = (cb, getImmediate = false) => {
		assertTypeFn(cb, '[createStore.subscribe]');
		getImmediate && cb(_value);
		return _pubsub.subscribe('change', cb);
	};

	const subscribeOnce = (cb) => {
		assertTypeFn(cb, '[createStore.subscribeOnce]');
		return _pubsub.subscribeOnce('change', cb);
	};

	return { set, get, update, subscribe, subscribeOnce };
};

// svelte derived api like
export const createDerivedStore = (
	stores: StoreLike[],
	deriveFn: Function
): StoreReadable => {
	const derived = createStore(void 0);
	const _values = [];

	// save initial values first...
	stores.forEach((s) => {
		if (!isStoreLike(s)) throw new TypeError('Expecting array of StoreLike objects');
		_values.push(s.get());
	});

	// helper flag for first getImmediate
	let _wasSet = false;

	// subscribe to each individually and call deriveFn with all values
	stores.forEach((s, idx) => {
		// note that these subscriptions will never be unsubscribed (is it a problem?)
		s.subscribe((value) => {
			_values[idx] = value;
			derived.set(deriveFn(_values));
			_wasSet = true;
		});
	});

	// subscribe needs a little tweak if source stores were not updated yet
	const subscribe = (cb, getImmediate = false) => {
		assertTypeFn(cb, '[createDerivedStore.subscribe]');

		// if never queried, set now!
		if (getImmediate && !_wasSet) {
			derived.set(deriveFn(_values));
			_wasSet = true;
		}

		return derived.subscribe(cb, getImmediate);
	};

	// intentionally omitting set (makes no sense for derived)
	const { get, subscribeOnce } = derived;

	return { get, subscribe, subscribeOnce };
};
