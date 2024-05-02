import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { createDerivedStore, createStore } from '../dist/index.js';
import isEqual from 'lodash/isEqual.js';
import { createClog } from '@marianmeres/clog';

const clog = createClog(path.basename(fileURLToPath(import.meta.url)));
const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// https://svelte.dev/docs#component-format-script-4-prefix-stores-with-$-to-access-their-values-store-contract

suite.test('store contract works', () => {
	let log = [];
	let log2 = [];
	const store = createStore('foo');

	// The `get` method is an extra (outside of store contract)
	assert('foo' === store.get());

	// 1. A store must contain a .subscribe method, which must accept as its argument a subscription
	// function. This subscription function must be immediately and synchronously called with the
	// store's current value upon calling .subscribe.
	// 2. The .subscribe method must return an unsubscribe function. Calling an unsubscribe
	// function must stop its subscription, and its corresponding subscription function must not
	// be called again by the store.
	const unsub1 = store.subscribe((v) => log.push(v));
	const unsub2 = store.subscribe((v) => log2.push(v));

	assert(log.length === 1);
	assert(log2.length === 1);
	assert(log.join() === 'foo');
	assert(log2.join() === 'foo');

	// All of a store's active subscription functions must later be synchronously called
	// whenever the store's value changes.
	store.set('bar');

	assert(log.length === 2);
	assert(log2.length === 2);
	assert(log.join() === 'foo,bar');
	assert(log2.join() === 'foo,bar');

	// unsub2
	unsub2();
	store.set('baz');
	assert(log.length === 3);
	assert(log2.length === 2);
	assert(log.join() === 'foo,bar,baz');
	assert(log2.join() === 'foo,bar');

	// unsub1
	unsub1();
	store.set('bat'); // noop
	assert(log.length === 3);
	assert(log2.length === 2);
	assert(log.join() === 'foo,bar,baz');
	assert(log2.join() === 'foo,bar');
});

suite.test('persist works', () => {
	let storage = null;
	const store = createStore('foo', { persist: (v) => (storage = v) });
	assert(storage === 'foo');
	store.set('bar');
	assert(storage === 'bar');
});

suite.test('store update works', () => {
	const store = createStore('foo');
	store.update((oldVal) => oldVal + 'bar');
	assert('foobar' === store.get());
});

suite.test('store set undefined', () => {
	const store = createStore('foo');
	store.set(undefined);
	assert(undefined === store.get());
});

suite.test('derived works', () => {
	let call_log = [];
	const initialValue = 'hey';
	const store = createStore('foo');
	const store2 = createStore(123);

	const derived = createDerivedStore(
		[store, store2],
		([a, b]) => {
			call_log.push(`[${a},${b}]`);
			return [a, b].join();
		},
		{ initialValue }
	);

	assert(derived.get() === 'foo,123');

	// 2 because each store triggers one call
	assert(call_log.length === 2);
	assert(call_log.join(';') === '[foo,123];[foo,123]');
	call_log = []; // reset

	// now subscribe
	let log = [];
	let unsub = derived.subscribe((v) => log.push(v));

	// 2 because each store creates one call internal subscribtion initially
	assert(call_log.length === 2);
	assert(call_log.join(';') === '[foo,123];[foo,123]');
	call_log = []; // reset

	store.set('bar');

	// now only 1 call (only one store has changed)
	assert(call_log.join(';') === '[bar,123]');
	call_log = []; // reset

	store2.set(456);

	assert(call_log.join(';') === '[bar,456]');
	call_log = []; // reset

	// actual derived value
	assert(derived.get() === 'bar,456');

	// log contains full change history
	assert(log.join(';') === 'foo,123;bar,123;bar,456');

	// update some
	store.set('baz');
	assert(derived.get() === 'baz,456');
	assert(call_log.join(';') === '[baz,456]');
	call_log = []; // reset

	// once unsubscribed, no more new derived calls
	unsub();
	store.set('bat');
	store2.set(789);

	assert(!call_log.length);

	// resubscribe
	unsub = derived.subscribe((v) => log.push(v));

	//
	assert(derived.get() === 'bat,789');
	assert(call_log.join(';') === '[bat,456];[bat,789]');
	call_log = []; // reset

	unsub();
});

suite.test('derived undefined input', () => {
	let log = [];
	let call_log = [];
	const store = createStore('foo');
	const derived = createDerivedStore([store], ([a]) => {
		call_log.push(`[${a}]`);
		return a;
	});

	// now subscribe
	const unsub = derived.subscribe((v) => log.push(v));

	//
	store.set(undefined);
	assert(derived.get() === undefined);
	assert(call_log.join(';') === '[foo];[undefined]');

	unsub();
});

suite.test('derived async', async () => {
	let log = [];
	const store = createStore('a');
	const store2 = createStore(1);

	const derived = createDerivedStore([store, store2], ([a, b], set) => {
		setTimeout(() => set([a, b].join()), 1);
	});

	const unsub = derived.subscribe((v) => log.push(v));

	assert(derived.get() === undefined);

	await sleep(5);

	assert(derived.get() === 'a,1');

	store.set('b');

	assert(derived.get() === 'a,1');

	await sleep(5);

	assert(derived.get() === 'b,1');

	// note that undefined is stringified as null
	assert(JSON.stringify(log) === '[null,"a,1","b,1"]');

	unsub();
});

/*
suite.test('readme', () => {
	const store = createStore('foo');

	// always able to `get` current value
	assert('foo' === store.get());

	// from now on, console.log changes
	let unsub = store.subscribe(console.log); // log: foo

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
});
*/

//
export default suite;
