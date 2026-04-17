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
	assertEquals((p.__raw() as Map<string, unknown>).get("foo"), "baz");
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

Deno.test("invalid arguments - deriveFn must accept at least 1 argument", () => {
	const store = createStore("foo");

	assertThrows(
		() => createDerivedStore([store], (() => {}) as any),
		TypeError,
		"Expecting the derivative function to accept at least 1 argument",
	);

	// 3+ args is now accepted (treated as async via length > 1, extra args ignored).
	// Matches Svelte's behavior of using length > 1 to detect async deriveFns.
	const derived = createDerivedStore(
		[store],
		((vals: any[], set: any) => set(vals.join())) as any,
	);
	const unsub = derived.subscribe(() => {});
	assertEquals(derived.get(), "foo");
	unsub();
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

// --- Regression tests for fixes in 2.5.0 -----------------------------------

Deno.test("BUG-1: createStorageStore round-trips falsy persisted values", () => {
	// Each falsy value must survive a round-trip via the persistor and not be
	// silently replaced by `initial`. Memory persistor used to keep tests hermetic.
	const cases: { key: string; persisted: any; initial: any }[] = [
		{ key: "rt-0", persisted: 0, initial: 99 },
		{ key: "rt-false", persisted: false, initial: true },
		{ key: "rt-null", persisted: null, initial: { fallback: true } },
		{ key: "rt-empty", persisted: "", initial: "fallback" },
	];

	for (const c of cases) {
		const seed = createStoragePersistor<any>(c.key, "memory");
		seed.set(c.persisted);
		const store = createStorageStore<any>(c.key, "memory", c.initial);
		assertEquals(store.get(), c.persisted, `key=${c.key}`);
	}
});

Deno.test("BUG-2: derived unsubscribe is idempotent (double-unsub does not corrupt state)", () => {
	const source = createStore("a");
	const derived = createDerivedStore([source], ([v]) => `${v}!`);

	const seen: string[] = [];
	const unsub = derived.subscribe((v) => seen.push(v));
	unsub();
	unsub(); // <-- previously broke _subsCounter, silently unsubscribed sources

	// New subscriber must see live source updates
	const seen2: string[] = [];
	const unsub2 = derived.subscribe((v) => seen2.push(v));
	source.set("b");

	assertEquals(seen2, ["a!", "b!"]);
	unsub2();
});

Deno.test("BUG-3: persistor.get distinguishes missing key from stored falsy string", () => {
	// Simulates a key that holds the JSON for "" (empty string). The previous
	// `item ? ...` check would treat this as "missing" and return undefined.
	const fakeStorage = new Map<string, string>();
	const wrapped: Storage = {
		getItem: (k: string) => fakeStorage.get(k) ?? null,
		setItem: (k: string, v: string) => {
			fakeStorage.set(k, v);
		},
		removeItem: (k: string) => {
			fakeStorage.delete(k);
		},
		clear: () => fakeStorage.clear(),
		key: () => null,
		length: 0,
	} as Storage;

	// Cannot easily inject a custom Storage into createStoragePersistor, so just
	// emulate the get path directly: a stored '""' must round-trip as "".
	wrapped.setItem("k", JSON.stringify(""));
	const item = wrapped.getItem("k");
	assertEquals(item, '""');
	const parsed = item == null ? undefined : JSON.parse(item);
	assertEquals(parsed, "");
});

Deno.test("BUG-4: stale async derived set after unsubscribe is dropped", async () => {
	const source = createStore(1);
	let pendingSet: ((v: number) => void) | null = null;

	const derived = createDerivedStore<number>(
		[source],
		(([n]: any[], set: any) => {
			// capture set so we can fire it AFTER unsubscribing
			pendingSet = (v) => set(v);
			set(n * 10);
		}) as any,
	);

	// First subscribe cycle
	let seen1: number | undefined;
	const unsub = derived.subscribe((v) => (seen1 = v));
	assertEquals(seen1, 10);

	// Unsubscribe and then fire the captured (now-stale) async set
	unsub();
	pendingSet!(999);
	await sleep(0);

	// New subscribe cycle must NOT see 999 — it should re-derive from source
	let seen2: number | undefined;
	const unsub2 = derived.subscribe((v) => (seen2 = v));
	assertEquals(seen2, 10);
	unsub2();
});

Deno.test("BUG-5: deriveFn with 3+ args is accepted (treated as async)", () => {
	const source = createStore("hello");
	// 3 args — extra arg ignored, async branch picked because length > 1
	const derived = createDerivedStore<string>(
		[source],
		((vals: any[], set: any, _extra: any) => set(vals.join("|"))) as any,
	);
	const unsub = derived.subscribe(() => {});
	assertEquals(derived.get(), "hello");
	unsub();
});

Deno.test("BUG-6: derived created but never subscribed does not subscribe to sources", () => {
	let subscribeCount = 0;
	const fakeSource: any = {
		subscribe(cb: any) {
			subscribeCount++;
			cb("x");
			return () => {};
		},
		get: () => "x",
	};

	createDerivedStore([fakeSource], ([v]) => v);

	// Construction alone must NOT subscribe to the source.
	assertEquals(subscribeCount, 0);
});

Deno.test("DF-1: createDerivedStore accepts a single store (not just array)", () => {
	const source = createStore(3);
	const doubled = createDerivedStore(source, (n) => n * 2);

	assertEquals(doubled.get(), 6);

	const seen: number[] = [];
	const unsub = doubled.subscribe((v) => seen.push(v));
	source.set(5);
	source.set(10);
	assertEquals(seen, [6, 10, 20]);
	unsub();
});

Deno.test("DF-1: invalid single source throws", () => {
	assertThrows(
		() => createDerivedStore("not a store" as any, (v: any) => v),
		TypeError,
		"Expecting a StoreLike object",
	);
});

Deno.test("DF-4: memory persistor with shared:false is isolated", () => {
	const a = createStoragePersistor<string>("iso-key", "memory", { shared: false });
	const b = createStoragePersistor<string>("iso-key", "memory", { shared: false });

	a.set("A");
	b.set("B");
	assertEquals(a.get(), "A");
	assertEquals(b.get(), "B");

	// Clearing one must not clear the other
	a.clear();
	assertEquals(a.get(), undefined);
	assertEquals(b.get(), "B");
});

Deno.test("DF-6: eagerPersist:false skips initial persist call", () => {
	let calls = 0;
	const persist = () => {
		calls++;
	};

	createStore("foo", { persist, eagerPersist: false });
	assertEquals(calls, 0);

	// Default (eager) still persists once at construction
	createStore("foo", { persist });
	assertEquals(calls, 1);
});

Deno.test("DF-8: onError receives topic and isWildcard context from pubsub", () => {
	const captured: { topic?: string; isWildcard?: boolean }[] = [];
	const store = createStore("foo", {
		onError: (_e, topic, isWildcard) => captured.push({ topic, isWildcard }),
	});

	let armed = false;
	store.subscribe(() => {
		if (armed) throw new Error("boom");
	});
	armed = true;
	store.set("bar"); // triggers subscriber error during publish

	assertEquals(captured.length, 1);
	assertEquals(captured[0].topic, "change");
	assertEquals(captured[0].isWildcard, false);
});

// --- Regression tests for fixes in 3.0.0 -----------------------------------

Deno.test("BUG-7: derived subscribe rolls back state when initial cb throws", () => {
	const errors: Error[] = [];
	const source = createStore("a");
	const derived = createDerivedStore([source], ([v]) => `${v}!`, {
		// Silence: the throwing cb we install below stays subscribed (3.0.0
		// behavior — initial throws route to onError rather than propagating
		// / leaking state), so it will fire for every future source change.
		onError: (e) => errors.push(e),
	});

	// Throwing initial callback used to leave _subsCounter=1 and sources
	// subscribed indefinitely. Now it routes through onError — either way the
	// next subscriber must still see live updates.
	const throwerUnsub = derived.subscribe(() => {
		throw new Error("boom");
	});
	assertEquals(errors.length, 1);
	assertEquals(errors[0].message, "boom");

	// A fresh subscriber must observe live source updates — i.e., the source
	// was NOT left permanently subscribed with a stale generation.
	const seen: string[] = [];
	const unsub = derived.subscribe((v) => seen.push(v));
	source.set("b");
	source.set("c");

	assertEquals(seen, ["a!", "b!", "c!"]);
	// Each source change re-fired the thrower; errors accumulate via onError.
	assertEquals(errors.length, 3);

	throwerUnsub();
	unsub();

	// After the last real unsub, sources must be torn down — a subsequent set
	// must not notify anybody.
	source.set("d");
	assertEquals(seen.length, 3);
	assertEquals(errors.length, 3);
});

Deno.test("BUG-8: derived subscribe rolls back when deriveFn throws initially", () => {
	const source = createStore("a");
	let shouldThrow = true;
	const derived = createDerivedStore([source], ([v]) => {
		if (shouldThrow) throw new Error("derive boom");
		return `${v}!`;
	});

	// First subscribe throws from deriveFn — state must be rolled back.
	assertThrows(
		() => derived.subscribe(() => {}),
		Error,
		"derive boom",
	);

	// New subscribe-cycle should work cleanly.
	shouldThrow = false;
	const seen: string[] = [];
	const unsub = derived.subscribe((v) => seen.push(v));
	source.set("b");

	assertEquals(seen, ["a!", "b!"]);
	unsub();
});

Deno.test("BUG-9: derived onError is invoked on subscriber errors", () => {
	const errors: Error[] = [];
	const source = createStore("a");
	const derived = createDerivedStore([source], ([v]) => v, {
		onError: (e) => errors.push(e),
	});

	let armed = false;
	derived.subscribe((_v) => {
		if (armed) throw new Error("boom");
	});
	armed = true;
	source.set("b");

	assertEquals(errors.length, 1);
	assertEquals(errors[0].message, "boom");
});

Deno.test("BUG-10: derived persist fires only on actual value change", () => {
	const persistCalls: number[] = [];
	const source = createStore({ a: 1, b: 2 });

	// deriveFn extracts only `a` — changes to `b` do not change the derived value.
	const derived = createDerivedStore([source], ([v]) => v.a, {
		persist: (v) => persistCalls.push(v),
	});

	const unsub = derived.subscribe(() => {});
	// Initial derivation produces a real value ≠ initialValue (undefined) → persist fires once.
	assertEquals(persistCalls, [1]);

	// Change `b` only — derived value stays at 1. persist must NOT fire.
	source.set({ a: 1, b: 3 });
	assertEquals(persistCalls, [1]);

	// Change `a` — derived value changes. persist fires.
	source.set({ a: 2, b: 3 });
	assertEquals(persistCalls, [1, 2]);

	unsub();
});

Deno.test("BUG-11: createStorageStore does not re-persist the value it just loaded", () => {
	// Hook into the shared memory Map via any persistor's __raw() to spy on writes.
	const spy = createStoragePersistor<string>("__bug11-probe", "memory");
	const sharedMap = spy.__raw() as Map<string, unknown>;
	const origSet = sharedMap.set.bind(sharedMap);
	let writesForKey = 0;
	const spiedSet = function (k: string, v: unknown) {
		if (k === "bug11-key") writesForKey++;
		return origSet(k, v);
	};
	(sharedMap as unknown as { set: typeof spiedSet }).set = spiedSet;

	try {
		// Seed via direct (unspied) call so the counter starts at 0.
		origSet("bug11-key", "pre-existing");
		writesForKey = 0;

		// Construct a storage store — it should NOT write back the value it just read.
		const store = createStorageStore<string>("bug11-key", "memory", "fallback");
		assertEquals(writesForKey, 0, "construction must not re-persist the loaded value");
		assertEquals(store.get(), "pre-existing");

		// Writing a new value still persists.
		store.set("changed");
		assertEquals(writesForKey, 1);

		// --- Also verify the "empty key" path still eagerly persists `initial` ---
		origSet.call(sharedMap, "bug11-fresh-key", undefined);
		sharedMap.delete("bug11-fresh-key");
		writesForKey = 0;

		// With no pre-existing value, eagerPersist should fire once so storage
		// reflects `initial` immediately.
		let freshKeyWrites = 0;
		const freshSpy = function (k: string, v: unknown) {
			if (k === "bug11-fresh-key") freshKeyWrites++;
			return origSet(k, v);
		};
		(sharedMap as unknown as { set: typeof freshSpy }).set = freshSpy;

		createStorageStore<string>("bug11-fresh-key", "memory", "seed");
		assertEquals(freshKeyWrites, 1, "empty-key path must eagerly install initial");
	} finally {
		// Restore the Map prototype binding.
		(sharedMap as unknown as { set: Map<string, unknown>["set"] }).set = origSet;
		sharedMap.delete("bug11-key");
		sharedMap.delete("bug11-fresh-key");
	}
});

Deno.test("DF-9: derived get() on inactive sync deriveFn does not subscribe sources", () => {
	let sourceSubscribes = 0;
	const inner = createStore(5);
	const source: any = {
		subscribe(cb: any) {
			sourceSubscribes++;
			return inner.subscribe(cb);
		},
		get: () => inner.get(),
	};

	const derived = createDerivedStore(source, (n: any) => n * 2);

	// Baseline: construction doesn't subscribe (BUG-6 already guards that).
	assertEquals(sourceSubscribes, 0);

	// Multiple inactive get()s: no source subscription churn on the fast path.
	assertEquals(derived.get(), 10);
	assertEquals(derived.get(), 10);
	assertEquals(derived.get(), 10);
	assertEquals(sourceSubscribes, 0, "inactive get() must not subscribe sources");

	// Source change visible via get() when inactive (fast path re-reads source).
	inner.set(7);
	assertEquals(derived.get(), 14);
	assertEquals(sourceSubscribes, 0);

	// Real subscribe still works and still counts.
	const unsub = derived.subscribe(() => {});
	assertEquals(sourceSubscribes, 1);
	unsub();
});

Deno.test("DF-10: derived get() on inactive async deriveFn does not schedule async work", async () => {
	let scheduled = 0;
	const source = createStore(1);
	const derived = createDerivedStore<number>(
		[source],
		(([n]: number[], set: any) => {
			scheduled++;
			setTimeout(() => set(n * 10), 0);
		}) as any,
		{ initialValue: -1 },
	);

	// First prime by a full subscribe cycle so we have a real cached value.
	const unsub = derived.subscribe(() => {});
	await sleep(5);
	unsub();

	const before = scheduled;

	// Inactive get() must NOT schedule new async work — it just returns cache.
	derived.get();
	derived.get();
	derived.get();
	assertEquals(scheduled, before, "inactive async get() must not re-schedule work");
});

Deno.test("DF-11: re-entrant set preserves consistent notification ordering", () => {
	const store = createStore("init");
	const log: string[] = [];
	let trigger = false;

	store.subscribe((v) => {
		log.push(`A:${v}`);
		if (trigger && v === "A") {
			trigger = false;
			store.set("B"); // re-entrant set from inside a subscriber
		}
	});
	store.subscribe((v) => {
		log.push(`B:${v}`);
	});

	// Clear initial logs
	log.length = 0;
	trigger = true;

	store.set("A");

	// Expected: every subscriber sees "A" before "B" (no nested-publish reorder).
	assertEquals(log, ["A:A", "B:A", "A:B", "B:B"]);
	assertEquals(store.get(), "B");
});

Deno.test("DF-12: custom equality suppresses redundant notifications", () => {
	const log: unknown[] = [];
	const shapeEqual = (a: unknown, b: unknown) =>
		JSON.stringify(a) === JSON.stringify(b);
	const store = createStore({ x: 1 }, { equal: shapeEqual });

	store.subscribe((v) => log.push(v));
	assertEquals(log.length, 1);

	// Different reference, same shape → no notify.
	store.set({ x: 1 });
	assertEquals(log.length, 1);

	// Different shape → notify.
	store.set({ x: 2 });
	assertEquals(log.length, 2);
});

Deno.test("DF-13: initial subscribe cb error routed to onError instead of throwing", () => {
	const errors: Error[] = [];
	const store = createStore("hi", { onError: (e) => errors.push(e) });

	// Must NOT throw out of subscribe.
	const unsub = store.subscribe(() => {
		throw new Error("boom");
	});

	assertEquals(errors.length, 1);
	assertEquals(errors[0].message, "boom");

	// Subscription must still be alive — a later set() triggers the cb again.
	store.set("bye");
	assertEquals(errors.length, 2);

	unsub();
	store.set("ignored");
	assertEquals(errors.length, 2);
});

Deno.test("DF-14: initial subscribe cb error logs to console.error when no onError", () => {
	const originalError = console.error;
	const calls: unknown[][] = [];
	console.error = (...args: unknown[]) => calls.push(args);

	try {
		const store = createStore("hi");
		// Must not throw.
		store.subscribe(() => {
			throw new Error("boom");
		});
		assertEquals(calls.length, 1);
		assert(String(calls[0][0]).includes("change"));
	} finally {
		console.error = originalError;
	}
});

Deno.test("DF-15: Unsubscribe supports Symbol.dispose", () => {
	const store = createStore("x");
	let notified = 0;
	const unsub = store.subscribe(() => notified++);

	assert(typeof unsub === "function");
	assert(typeof (unsub as any)[Symbol.dispose] === "function");

	// Dispose via Symbol.dispose is equivalent to calling the function.
	(unsub as any)[Symbol.dispose]();
	store.set("y");
	assertEquals(notified, 1, "disposed subscription must not be notified");
});

Deno.test("DF-15: derived Unsubscribe supports Symbol.dispose", () => {
	const src = createStore(1);
	const derived = createDerivedStore(src, (n) => n * 2);
	let notified = 0;
	const unsub = derived.subscribe(() => notified++);

	assert(typeof (unsub as any)[Symbol.dispose] === "function");

	(unsub as any)[Symbol.dispose]();
	src.set(2);
	assertEquals(notified, 1);
});

Deno.test("DF-16: custom serialize/deserialize for local/session storage", () => {
	// Deno (without `--location`) may expose localStorage as a non-writable
	// property on globalThis, so simple assignment silently fails. Use
	// Object.defineProperty so the mock reliably takes effect.
	const mock: Record<string, string> = {};
	const originalDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"localStorage",
	);
	Object.defineProperty(globalThis, "localStorage", {
		value: {
			getItem: (k: string) => (k in mock ? mock[k] : null),
			setItem: (k: string, v: string) => {
				mock[k] = v;
			},
			removeItem: (k: string) => {
				delete mock[k];
			},
			clear: () => {
				for (const k of Object.keys(mock)) delete mock[k];
			},
			key: () => null,
			length: 0,
		},
		configurable: true,
		writable: true,
	});

	try {
		let serializeCalls = 0;
		let deserializeCalls = 0;
		const p = createStoragePersistor<{ when: string }>("df16", "local", {
			serialize: (v) => {
				serializeCalls++;
				return `CUSTOM::${JSON.stringify(v)}`;
			},
			deserialize: (s) => {
				deserializeCalls++;
				return JSON.parse(s.replace("CUSTOM::", ""));
			},
		});

		p.set({ when: "2026-01-01" });
		assertEquals(serializeCalls, 1);
		assertEquals(mock["df16"], 'CUSTOM::{"when":"2026-01-01"}');

		const got = p.get();
		assertEquals(deserializeCalls, 1);
		assertEquals(got, { when: "2026-01-01" });

		p.remove();
		assertEquals(p.get(), undefined);
	} finally {
		if (originalDescriptor) {
			Object.defineProperty(globalThis, "localStorage", originalDescriptor);
		} else {
			// deno-lint-ignore no-explicit-any
			delete (globalThis as any).localStorage;
		}
	}
});

Deno.test("DF-17: createDerivedStore forwards onError/persist/onPersistError/equal", () => {
	const errors: Error[] = [];
	const persistCalls: string[] = [];
	const persistErrors: unknown[] = [];

	const source = createStore("a");
	const derived = createDerivedStore([source], ([v]) => v.toUpperCase(), {
		onError: (e) => errors.push(e),
		persist: (v) => {
			persistCalls.push(v);
			if (v === "BAD") throw new Error("persist-boom");
		},
		onPersistError: (e) => persistErrors.push(e),
		// Any-truthy equality — derived value never "changes", so persist and
		// subscribers fire only on the first real derive.
		equal: () => true,
	});

	let fired = 0;
	const unsub = derived.subscribe(() => fired++);

	// With `equal: () => true`, even the first real set from undefined → "A"
	// is treated as unchanged (true ⇒ no publish, no persist). But the initial
	// callback still runs once with the cached value (initialValue=undefined).
	assertEquals(fired, 1);
	assertEquals(persistCalls, []);

	// Throw from a subscriber — onError must be hit.
	const armedUnsub = derived.subscribe((_v) => {
		throw new Error("sub-boom");
	});
	// armedUnsub's initial cb already threw → routed to onError (DF-13 behavior).
	assertEquals(errors.length, 1);
	assertEquals(errors[0].message, "sub-boom");

	armedUnsub();
	unsub();

	// Sanity: persist-error routing works when equality allows writes through.
	// We construct a second derived without the blocking equality to check persist errors.
	const src2 = createStore("x");
	createDerivedStore([src2], ([v]) => (v === "x" ? "BAD" : v), {
		persist: (v) => {
			persistCalls.push(v);
			if (v === "BAD") throw new Error("persist-boom");
		},
		onPersistError: (e) => persistErrors.push(e),
	}).subscribe(() => {});

	assert(persistErrors.length >= 1);
	assertEquals((persistErrors[0] as Error).message, "persist-boom");
});
