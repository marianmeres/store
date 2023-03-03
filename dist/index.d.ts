export interface StoreReadable {
    subscribe: (cb: Function) => Function;
    get: Function;
    subscribeOnce?: Function;
}
export interface StoreLike extends StoreReadable {
    set: Function;
    update: Function;
}
export declare const isStoreLike: (v: any) => boolean;
interface CreateStoreOptions {
    persist: Function;
}
export declare const createStore: (initial?: any, options?: Partial<CreateStoreOptions>) => StoreLike;
interface CreateDerivedStoreOptions extends CreateStoreOptions {
    initialValue: any;
}
export declare const createDerivedStore: (stores: StoreLike[], deriveFn: (...storesValues: any[]) => any, options?: Partial<CreateDerivedStoreOptions>) => StoreReadable;
export {};
