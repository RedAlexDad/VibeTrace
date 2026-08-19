import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { persistReducer, persistStore, type WebStorage } from 'redux-persist'
import uiReducer from './uiSlice'

/** localStorage-backed WebStorage for redux-persist (Vite ESM-safe). */
const storage: WebStorage = {
  getItem: (key) =>
    new Promise((resolve) => resolve(window.localStorage.getItem(key))),
  setItem: (key, value) =>
    new Promise((resolve) => {
      window.localStorage.setItem(key, value)
      resolve()
    }),
  removeItem: (key) =>
    new Promise((resolve) => {
      window.localStorage.removeItem(key)
      resolve()
    }),
}

const persistConfig = {
  key: 'vibetrace-root',
  storage,
  whitelist: ['ui'],
}

const rootReducer = combineReducers({
  ui: uiReducer,
})

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof rootReducer>
export type AppDispatch = typeof store.dispatch
