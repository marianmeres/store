import {
	createDerivedStore,
	createStoragePersistor,
	createStore,
} from "../src/store.ts";
import { assert, assertEquals } from "@std/assert";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("store contract works", () => {
	const log: any[] = [];
	const log2: any[] = [];
	const store = createStore("foo");

	// The `get` method is an extra (outside of store contract)
	assert("foo" === store.get());

	// 1. A store must contain a .subscribe method, which must accept as its argument a subscription
	// function. This subscription function must be immediately and synchronously called with the
	// store's current value upon calling .subscribe.
	// 2. The .subscribe method must return an unsubscribe function. Calling an unsubscribe
	// function must stop its subscription, and its corresponding subscription function must not
	// be called again by the store.
	const unsub1 = store.subscribe((v) => log.push(v));
	const unsub2 = store.subscribe((v) => log2.push(v));

	assertEquals(log.length, 1);
	assertEquals(log2.length, 1);
	assertEquals(log.join(), "foo");
	assertEquals(log2.join(), "foo");

	// All of a store's active subscription functions must later be synchronously called
	// whenever the store's value changes.
	store.set("bar");

	assertEquals(log.length, 2);
	assertEquals(log2.length, 2);
	assertEquals(log.join(), "foo,bar");
	assertEquals(log2.join(), "foo,bar");

	// unsub2
	unsub2();
	store.set("baz");
	assertEquals(log.length, 3);
	assertEquals(log2.length, 2);
	assertEquals(log.join(), "foo,bar,baz");
	assertEquals(log2.join(), "foo,bar");

	// unsub1
	unsub1();
	store.set("bat"); // noop
	assertEquals(log.length, 3);
	assertEquals(log2.length, 2);
	assertEquals(log.join(), "foo,bar,baz");
	assertEquals(log2.join(), "foo,bar");
});

Deno.test("persist works", () => {
	let storage = null;
	const store = createStore("foo", { persist: (v) => (storage = v) });
	assertEquals(storage, "foo");
	store.set("bar");
	assertEquals(storage, "bar");
});

Deno.test("persistor", () => {
	const p = createStoragePersistor("foo", "memory");
	p.set("bar");

	const store = createStore(p.get(), { persist: p.set });
	assertEquals(store.get(), "bar");

	store.set("baz");
	assertEquals(store.get(), "baz");
	assertEquals(p.__raw().foo, "baz");
});

Deno.test("store update works", () => {
	const store = createStore("foo");
	store.update((oldVal) => oldVal + "bar");
	assertEquals("foobar", store.get());
});

Deno.test("store set undefined", () => {
	const store = createStore<any>("foo");
	store.set(undefined);
	assertEquals(undefined, store.get());
});

Deno.test("derived works", () => {
	let call_log: any[] = [];
	const initialValue = "hey";
	const store = createStore("foo");
	const store2 = createStore(123);

	const derived = createDerivedStore(
		[store, store2],
		([a, b]) => {
			call_log.push(`[${a},${b}]`);
			return [a, b].join();
		},
		{ initialValue }
	);

	assertEquals(derived.get(), "foo,123");

	// 2 because each store triggers one call
	assertEquals(call_log.length, 2);
	assertEquals(call_log.join(";"), "[foo,123];[foo,123]");
	call_log = []; // reset

	// now subscribe
	const log: any[] = [];
	let unsub = derived.subscribe((v) => log.push(v));

	// 2 because each store creates one call internal subscribtion initially
	assertEquals(call_log.length, 2);
	assertEquals(call_log.join(";"), "[foo,123];[foo,123]");
	call_log = []; // reset

	store.set("bar");

	// now only 1 call (only one store has changed)
	assertEquals(call_log.join(";"), "[bar,123]");
	call_log = []; // reset

	store2.set(456);

	assertEquals(call_log.join(";"), "[bar,456]");
	call_log = []; // reset

	// actual derived value
	assertEquals(derived.get(), "bar,456");

	// log contains full change history
	assertEquals(log.join(";"), "foo,123;bar,123;bar,456");

	// update some
	store.set("baz");
	assertEquals(derived.get(), "baz,456");
	assertEquals(call_log.join(";"), "[baz,456]");
	call_log = []; // reset

	// once unsubscribed, no more new derived calls
	unsub();
	store.set("bat");
	store2.set(789);

	assert(!call_log.length);

	// resubscribe
	unsub = derived.subscribe((v) => log.push(v));

	//
	assertEquals(derived.get(), "bat,789");
	assertEquals(call_log.join(";"), "[bat,456];[bat,789]");
	call_log = []; // reset

	unsub();
});

Deno.test("derived undefined input", () => {
	const log: any[] = [];
	const call_log: any[] = [];
	const store = createStore<any>("foo");
	const derived = createDerivedStore([store], ([a]) => {
		call_log.push(`[${a}]`);
		return a;
	});

	// now subscribe
	const unsub = derived.subscribe((v) => log.push(v));

	//
	store.set(undefined);
	assertEquals(derived.get(), undefined);
	assertEquals(call_log.join(";"), "[foo];[undefined]");

	unsub();
});

Deno.test("derived async", async () => {
	const log: any[] = [];
	const store = createStore("a");
	const store2 = createStore(1);

	const derived = createDerivedStore<any>([store, store2], ([a, b], set) => {
		setTimeout(() => set?.([a, b].join()), 1);
	});

	const unsub = derived.subscribe((v) => log.push(v));

	assertEquals(derived.get(), undefined);

	await sleep(5);

	assertEquals(derived.get(), "a,1");

	store.set("b");

	assertEquals(derived.get(), "a,1");

	await sleep(5);

	assertEquals(derived.get(), "b,1");

	// note that undefined is stringified as null
	assertEquals(JSON.stringify(log), '[null,"a,1","b,1"]');

	unsub();
});
