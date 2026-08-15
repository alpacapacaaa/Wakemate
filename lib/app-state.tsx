import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AppState, PersonalAlarm, Room } from './model';
import { store } from './store';

type Ctx = {
  ready: boolean;
  state: AppState | null;
  rooms: Room[];
  personalAlarms: PersonalAlarm[];
  refresh: () => Promise<void>;
  /** Every mutation goes through the store, then refreshes — one source of truth, no local drift. */
  mutate: <T>(fn: () => Promise<T>) => Promise<T>;
};

const AppStateContext = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setState({ ...(await store.getState()) });
  }, []);

  useEffect(() => {
    (async () => {
      // Design prototype: a first launch with nothing in it shows only empty states, which makes
      // the layouts impossible to judge. Seed the mock week instead. Clearable from the 나 tab,
      // and this whole branch goes away once a real backend exists (see lib/mock.ts).
      const current = await store.getState();
      if (current.rooms.length === 0 && current.personalAlarms.length === 0) {
        await store.loadMockData();
      }
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      const result = await fn();
      await refresh();
      return result;
    },
    [refresh]
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      state,
      rooms: state?.rooms ?? [],
      personalAlarms: state?.personalAlarms ?? [],
      refresh,
      mutate,
    }),
    [ready, state, refresh, mutate]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): Ctx {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
