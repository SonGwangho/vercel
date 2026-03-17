import { browser } from "$app/environment";

const DB_NAME = 'app-storage'
const DB_VERSION = 1
const STORE_NAME = 'default'

export interface StoredItem {
    id?: number
    key: string
    value: unknown
    createdAt: number
}

class StorageDB {
    private db: IDBDatabase | null = null

    private async index(mode: IDBTransactionMode) {
        const store = await this.store(mode)
        return store.index('key')
    }

    private async deleteByKey(key: string) {
        const store = await this.store('readwrite')
        const index = store.index('key')

        return new Promise<void>((resolve, reject) => {
            const request = index.openCursor(IDBKeyRange.only(key))

            request.onsuccess = () => {
                const cursor = request.result

                if (!cursor) {
                    resolve()
                    return
                }

                const deleteRequest = cursor.delete()

                deleteRequest.onsuccess = () => {
                    cursor.continue()
                }

                deleteRequest.onerror = () => {
                    reject(deleteRequest.error)
                }
            }

            request.onerror = () => {
                reject(request.error)
            }
        })
    }

    private async open(): Promise<IDBDatabase> {
        if (!browser) {
            throw new Error('IndexedDB is only available in browser')
        }

        if (this.db) return this.db

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)

            request.onupgradeneeded = () => {
                const db = request.result

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true,
                    })

                    store.createIndex('key', 'key', { unique: false })
                }
            }

            request.onsuccess = () => {
                this.db = request.result
                resolve(this.db)
            }

            request.onerror = () => {
                reject(request.error)
            }
        })
    }

    private async store(mode: IDBTransactionMode) {
        const db = await this.open()
        return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
    }

    async set(key: string, value: unknown) {
        await this.deleteByKey(key)
        const store = await this.store('readwrite')

        return new Promise<void>((resolve, reject) => {
            const request = store.add({
                key,
                value,
                createdAt: Date.now()
            })

            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }

    async get<T = unknown>(key: string): Promise<T | null> {
        const index = await this.index('readonly')

        return new Promise((resolve, reject) => {
            const request = index.get(key)

            request.onsuccess = () => {
                const result = request.result as StoredItem | undefined
                resolve(result ? (result.value as T) : null)
            }

            request.onerror = () => {
                reject(request.error)
            }
        })
    }

    async remove(key: string) {
        await this.deleteByKey(key)
    }

    async clear() {
        const store = await this.store('readwrite')
        store.clear()
    }
}

export const Storage = new StorageDB();

