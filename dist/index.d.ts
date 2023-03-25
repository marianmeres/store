export declare type Subscribe<T> = (value: T) => void;
export declare type Unsubscribe = () => void;
export declare type Update<T> = (value: T) => T;
export interface StoreReadable<T> {
    subscribe(cb: Subscribe<T>): Unsubscribe;
    get: () => T;
}
export interface StoreLike<T> extends StoreReadable<T> {
    set(value: T): void;
    update(cb: Update<T>): void;
}
export declare const isStoreLike: (v: any) => boolean;
interface CreateStoreOptions {
    persist: Function;
}
export declare const createStore: <T>(initial?: any, options?: Partial<CreateStoreOptions>) => StoreLike<T>;
interface CreateDerivedStoreOptions extends CreateStoreOptions {
    initialValue: any;
}
export declare const createDerivedStore: <T>(stores: StoreLike<any>[], deriveFn: (...storesValues: any[]) => any, options?: Partial<CreateDerivedStoreOptions>) => StoreReadable<T>;
export {};
