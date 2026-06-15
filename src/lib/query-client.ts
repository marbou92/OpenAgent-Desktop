/**
 * OpenAgent-Desktop Aether - React Query Client
 * 
 * Configures @tanstack/react-query for server state management.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,    // 30 seconds before data is considered stale
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
