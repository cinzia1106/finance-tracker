/* Provides the active DataAdapter to the component tree.
   Swap MockDataAdapter for the real local-first adapter here later. */

import { createContext, useContext, type ReactNode } from 'react';
import type { DataAdapter } from './adapter';
import { MockDataAdapter } from './mockAdapter';

const defaultAdapter: DataAdapter = new MockDataAdapter();

const AdapterContext = createContext<DataAdapter>(defaultAdapter);

export function AdapterProvider({
  adapter = defaultAdapter,
  children,
}: {
  adapter?: DataAdapter;
  children: ReactNode;
}) {
  return (
    <AdapterContext.Provider value={adapter}>
      {children}
    </AdapterContext.Provider>
  );
}

export function useAdapter(): DataAdapter {
  return useContext(AdapterContext);
}
