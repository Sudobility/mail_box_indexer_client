import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { type NetworkClient, type Optional } from '@sudobility/types';
import type { IndexerCustomAddressAvailabilityResponse } from '@sudobility/mail_box_types';
import { IndexerClient } from '../network/IndexerClient';

interface UseIndexerCustomAddressAvailabilityReturn {
  checkAvailability: (
    name: string
  ) => Promise<Optional<IndexerCustomAddressAvailabilityResponse>>;
  isLoading: boolean;
  error: Optional<string>;
  clearError: () => void;
}

/**
 * React hook for checking whether a desired custom (user-defined) address local
 * part is available. Public endpoint -- no wallet signature required. Returned as
 * a callable (mutation) so the UI can debounce checks as the user types.
 *
 * @param networkClient - Network client for making HTTP requests
 * @param endpointUrl - Indexer API endpoint URL
 * @param dev - Whether to use dev mode headers
 * @returns Object with `checkAvailability` function and request state
 */
export const useIndexerCustomAddressAvailability = (
  networkClient: NetworkClient,
  endpointUrl: string,
  dev: boolean = false
): UseIndexerCustomAddressAvailabilityReturn => {
  const client = useMemo(
    () => new IndexerClient(endpointUrl, networkClient, dev),
    [endpointUrl, networkClient, dev]
  );
  const [error, setError] = useState<Optional<string>>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const mutation = useMutation({
    mutationFn: async (
      name: string
    ): Promise<Optional<IndexerCustomAddressAvailabilityResponse>> => {
      setError(null);
      try {
        return await client.checkCustomAddressAvailability(name);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Availability check failed';
        setError(errorMessage);
        console.error(
          '[useIndexerCustomAddressAvailability]',
          errorMessage,
          err
        );
        return undefined;
      }
    },
    retry: false,
  });

  // Depend on the stable `mutateAsync` reference, not the whole `mutation`
  // object (whose identity changes on every pending/error transition) — otherwise
  // `checkAvailability` changes identity each call and loops any effect that
  // depends on it.
  const { mutateAsync } = mutation;
  const checkAvailability = useCallback(
    async (
      name: string
    ): Promise<Optional<IndexerCustomAddressAvailabilityResponse>> => {
      return await mutateAsync(name);
    },
    [mutateAsync]
  );

  const isLoading = mutation.isPending;

  return useMemo(
    () => ({
      checkAvailability,
      isLoading,
      error,
      clearError,
    }),
    [checkAvailability, isLoading, error, clearError]
  );
};
