import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { type NetworkClient, type Optional } from '@sudobility/types';
import type { IndexerCustomAddressResponse } from '@sudobility/mail_box_types';
import type { IndexerUserAuth } from '../types';
import { IndexerClient } from '../network/IndexerClient';

interface UseIndexerSetCustomAddressReturn {
  setCustomAddress: (
    walletAddress: string,
    auth: IndexerUserAuth,
    address: string
  ) => Promise<Optional<IndexerCustomAddressResponse>>;
  isLoading: boolean;
  error: Optional<string>;
  clearError: () => void;
}

/**
 * React hook for claiming (setting) a wallet's custom (user-defined) address.
 * Requires a wallet signature. The claim is one-time (subject to the remaining
 * set allowance) and may be rejected if the name is taken, reserved, looks like
 * a wallet address, or ends in an ENS/SNS postfix.
 *
 * @param networkClient - Network client for making HTTP requests
 * @param endpointUrl - Indexer API endpoint URL
 * @param dev - Whether to use dev mode headers
 * @returns Object with `setCustomAddress` function and request state
 */
export const useIndexerSetCustomAddress = (
  networkClient: NetworkClient,
  endpointUrl: string,
  dev: boolean = false
): UseIndexerSetCustomAddressReturn => {
  const client = useMemo(
    () => new IndexerClient(endpointUrl, networkClient, dev),
    [endpointUrl, networkClient, dev]
  );
  const [error, setError] = useState<Optional<string>>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const mutation = useMutation({
    mutationFn: async ({
      walletAddress,
      auth,
      address,
    }: {
      walletAddress: string;
      auth: IndexerUserAuth;
      address: string;
    }): Promise<Optional<IndexerCustomAddressResponse>> => {
      setError(null);
      try {
        return await client.setCustomAddress(walletAddress, auth, address);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to set custom address';
        setError(errorMessage);
        console.error('[useIndexerSetCustomAddress]', errorMessage, err);
        return undefined;
      }
    },
    retry: false,
  });

  // Depend on the stable `mutateAsync` reference, not the whole `mutation`
  // object, so `setCustomAddress` keeps a stable identity across renders.
  const { mutateAsync } = mutation;
  const setCustomAddress = useCallback(
    async (
      walletAddress: string,
      auth: IndexerUserAuth,
      address: string
    ): Promise<Optional<IndexerCustomAddressResponse>> => {
      return await mutateAsync({ walletAddress, auth, address });
    },
    [mutateAsync]
  );

  const isLoading = mutation.isPending;

  return useMemo(
    () => ({
      setCustomAddress,
      isLoading,
      error,
      clearError,
    }),
    [setCustomAddress, isLoading, error, clearError]
  );
};
