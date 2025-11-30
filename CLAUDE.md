# Claude Code Instructions

For comprehensive package knowledge, read [llm.txt](llm.txt).

## Quick Reference

- **Package**: @marianmeres/store v2.3.0
- **Purpose**: Lightweight reactive store with Svelte store contract compatibility
- **Source**: [src/store.ts](src/store.ts) (~400 lines)
- **Tests**: [tests/store.test.ts](tests/store.test.ts)
- **Entry**: [src/mod.ts](src/mod.ts)

## Key Commands

```bash
deno task test        # Run tests (watch mode)
deno task npm:build   # Build npm package
```

## Main Exports

- `createStore<T>(initial?, options?)` - Writable reactive store
- `createDerivedStore<T>(stores, deriveFn, options?)` - Computed store
- `createStoragePersistor<T>(key, type?)` - Storage adapter
- `createStorageStore<T>(key, type?, initial?)` - Auto-persistent store
- `isStoreLike(value)` - Duck type check
