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
export interface CreateStoreOptions<T> {
    persist?: (v: T) => void;
}
export declare const createStoragePersistor: <T>(key: string, type?: 'session' | 'local') => {
    persist: (v: T) => void;
    get: () => T;
};
export declare const createStore: <T>(initial?: T | undefined, options?: CreateStoreOptions<T> | null) => StoreLike<T>;
interface CreateDerivedStoreOptions<T> extends CreateStoreOptions<T> {
    initialValue?: any;
}
export declare const createDerivedStore: <T>(stores: StoreLike<any>[], deriveFn: (storesValues: any[], set?: Function) => any, options?: CreateDerivedStoreOptions<T> | null) => StoreReadable<T>;
export {};
