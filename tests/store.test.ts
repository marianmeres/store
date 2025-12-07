// deno-lint-ignore-file no-explicit-any -- tests use any for logging and error case testing
import { createDerivedStore, createStoragePersistor, createStore, createStorageStore } from "../src/store.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

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
	assertEquals(p.__raw().get("foo"), "baz");
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
		{ initialValue },
	);

	assertEquals(derived.get(), "foo,123");

	// deriveFn is called exactly once on get() (batched, not once per source store)
	assertEquals(call_log.length, 1);
	assertEquals(call_log.join(";"), "[foo,123]");
	call_log = []; // reset

	// now subscribe
	const log: any[] = [];
	let unsub = derived.subscribe((v) => log.push(v));

	// deriveFn is called exactly once on subscribe (batched, not once per source store)
	assertEquals(call_log.length, 1);
	assertEquals(call_log.join(";"), "[foo,123]");
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

	// deriveFn is called exactly once on resubscribe (batched with current values)
	assertEquals(derived.get(), "bat,789");
	assertEquals(call_log.join(";"), "[bat,789]");
	call_log = []; // reset

	unsub();
});

Deno.test("derived calls deriveFn exactly once on initial subscribe with multiple stores", () => {
	let callCount = 0;
	const store1 = createStore("a");
	const store2 = createStore("b");
	const store3 = createStore("c");

	const derived = createDerivedStore(
		[store1, store2, store3],
		([v1, v2, v3]) => {
			callCount++;
			return `${v1}-${v2}-${v3}`;
		},
	);

	// Before subscription, deriveFn should not be called
	assertEquals(callCount, 0);

	// Subscribe - deriveFn should be called exactly once (not 3 times)
	const unsub = derived.subscribe(() => {});
	assertEquals(callCount, 1);
	assertEquals(derived.get(), "a-b-c");

	// Changing one store should call deriveFn once
	store1.set("x");
	assertEquals(callCount, 2);
	assertEquals(derived.get(), "x-b-c");

	// Changing another store should call deriveFn once more
	store2.set("y");
	assertEquals(callCount, 3);
	assertEquals(derived.get(), "x-y-c");

	unsub();

	// After unsubscribe, changes should not call deriveFn
	store3.set("z");
	assertEquals(callCount, 3);

	// Resubscribing should call deriveFn exactly once
	const unsub2 = derived.subscribe(() => {});
	assertEquals(callCount, 4);
	assertEquals(derived.get(), "x-y-z");

	unsub2();
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

Deno.test("persistence error handling with onPersistError", () => {
	const errors: unknown[] = [];
	const persist = () => {
		throw new Error("Persistence failed!");
	};

	const store = createStore("foo", {
		persist,
		onPersistError: (e) => errors.push(e),
	});

	// Initial persist should capture error
	assertEquals(errors.length, 1);
	assert(errors[0] instanceof Error);
	assertEquals((errors[0] as Error).message, "Persistence failed!");

	// Set should also capture error
	store.set("bar");
	assertEquals(errors.length, 2);
});

Deno.test("persistence error handling with default warning", () => {
	const originalWarn = console.warn;
	const warnings: any[] = [];
	console.warn = (...args: any[]) => warnings.push(args);

	try {
		const persist = () => {
			throw new Error("Persistence failed!");
		};

		const store = createStore("foo", { persist });

		// Should have warned on initial persist
		assertEquals(warnings.length, 1);
		assertEquals(warnings[0][0], "Store persistence failed:");

		store.set("bar");
		assertEquals(warnings.length, 2);
	} finally {
		console.warn = originalWarn;
	}
});

Deno.test("setting same value twice does not notify subscribers", () => {
	const log: any[] = [];
	const store = createStore("foo");

	store.subscribe((v) => log.push(v));
	assertEquals(log.length, 1); // initial call

	store.set("foo"); // same value
	assertEquals(log.length, 1); // should not notify

	store.set("bar"); // different value
	assertEquals(log.length, 2); // should notify

	store.set("bar"); // same value again
	assertEquals(log.length, 2); // should not notify
});

Deno.test("setting same object reference does not notify", () => {
	const log: any[] = [];
	const obj = { foo: "bar" };
	const store = createStore(obj);

	store.subscribe((v) => log.push(v));
	assertEquals(log.length, 1); // initial call

	store.set(obj); // same reference
	assertEquals(log.length, 1); // should not notify

	store.set({ foo: "bar" }); // different reference
	assertEquals(log.length, 2); // should notify
});

Deno.test("falsy values are handled correctly", () => {
	const store = createStore<any>(null);
	assertEquals(store.get(), null);

	store.set(undefined);
	assertEquals(store.get(), undefined);

	store.set(0);
	assertEquals(store.get(), 0);

	store.set(false);
	assertEquals(store.get(), false);

	store.set("");
	assertEquals(store.get(), "");

	store.set(NaN);
	assert(Number.isNaN(store.get()));
});

Deno.test("memory persistor clear and remove", () => {
	const p1 = createStoragePersistor("key1", "memory");
	const p2 = createStoragePersistor("key2", "memory");

	p1.set("value1");
	p2.set("value2");

	assertEquals(p1.get(), "value1");
	assertEquals(p2.get(), "value2");

	// Remove only key1
	p1.remove();
	assertEquals(p1.get(), undefined);
	assertEquals(p2.get(), "value2");

	// Clear all
	p2.clear();
	assertEquals(p1.get(), undefined);
	assertEquals(p2.get(), undefined);
});

Deno.test("createStorageStore with invalid storage type", () => {
	const originalWarn = console.warn;
	const warnings: any[] = [];
	console.warn = (...args: any[]) => warnings.push(args);

	try {
		const store = createStorageStore("key", "invalid" as any, "default");

		assertEquals(warnings.length, 1);
		assert(warnings[0][0].includes("Ignoring invalid storageType"));

		// Should still work with fallback to session
		assertEquals(store.get(), "default");
	} finally {
		console.warn = originalWarn;
	}
});

Deno.test("invalid arguments - subscribe requires function", () => {
	const store = createStore("foo");

	assertThrows(
		() => store.subscribe("not a function" as any),
		TypeError,
		"Expecting function arg",
	);
});

Deno.test("invalid arguments - update requires function", () => {
	const store = createStore("foo");

	assertThrows(
		() => store.update("not a function" as any),
		TypeError,
		"Expecting function arg",
	);
});

Deno.test("invalid arguments - derived subscribe requires function", () => {
	const store = createStore("foo");
	const derived = createDerivedStore([store], ([v]) => v);

	assertThrows(
		() => derived.subscribe("not a function" as any),
		TypeError,
		"Expecting function arg",
	);
});

Deno.test("invalid arguments - derived stores must be array of stores", () => {
	assertThrows(
		() => createDerivedStore(["not a store"] as any, () => {}),
		TypeError,
		"Expecting array of StoreLike objects",
	);
});

Deno.test("invalid arguments - deriveFn must be function", () => {
	const store = createStore("foo");

	assertThrows(
		() => createDerivedStore([store], "not a function" as any),
		TypeError,
		"Expecting second argument to be the derivative function",
	);
});

Deno.test("invalid arguments - deriveFn must have 1 or 2 arguments", () => {
	const store = createStore("foo");

	assertThrows(
		() => createDerivedStore([store], (() => {}) as any),
		TypeError,
		"Expecting the derivative function to have exactly 1 or 2 arguments",
	);

	assertThrows(
		() => createDerivedStore([store], ((_a: any, _b: any, _c: any) => {}) as any),
		TypeError,
		"Expecting the derivative function to have exactly 1 or 2 arguments",
	);
});

Deno.test("derived store persistence error handling", () => {
	const errors: unknown[] = [];
	const store = createStore("foo");

	const derived = createDerivedStore(
		[store],
		([v]) => v.toUpperCase(),
		{
			persist: () => {
				throw new Error("Derived persist failed!");
			},
			onPersistError: (e) => errors.push(e),
		},
	);

	const unsub = derived.subscribe(() => {});

	// Should have captured error on initial subscription
	assert(errors.length > 0);
	assert(errors[0] instanceof Error);

	store.set("bar");
	// Should capture error on update too
	assert(errors.length > 1);

	unsub();
});
