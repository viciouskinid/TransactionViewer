import { useState, useEffect, useCallback } from 'react';
import { coingeckoService } from '../services/coingeckoService';

/**
 * Custom hook for managing token data from CoinGecko API
 * @param {Array} tokenAddresses - Array of token contract addresses
 * @param {string} chainId - The chain ID
 * @returns {Object} { tokenData, tokenLoading, refreshTokenData, isLoading }
 */
export const useTokenData = (tokenAddresses = [], chainId = null) => {
  const [tokenData, setTokenData] = useState({});
  const [tokenLoading, setTokenLoading] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Refresh token data for specific addresses or all addresses
   */
  const refreshTokenData = useCallback(async (addressesToRefresh = null) => {
    if (!chainId || (!tokenAddresses.length && !addressesToRefresh)) return;

    const addresses = addressesToRefresh || tokenAddresses;
    if (!addresses.length) return;

    setIsLoading(true);

    // Set loading state for each address
    const loadingUpdates = {};
    addresses.forEach(address => {
      const normalizedAddress = address.toLowerCase();
      loadingUpdates[normalizedAddress] = true;
    });
    setTokenLoading(prev => ({ ...prev, ...loadingUpdates }));

    try {
      // Prepare token requests
      const tokenRequests = addresses.map(address => ({
        contractAddress: address,
        chainId: chainId
      }));

      // Fetch token data
      const newTokenData = await coingeckoService.fetchMultipleTokenData(tokenRequests);

      // Update state
      setTokenData(prev => ({ ...prev, ...newTokenData }));

      // Clear loading state
      const loadingClearUpdates = {};
      addresses.forEach(address => {
        const normalizedAddress = address.toLowerCase();
        loadingClearUpdates[normalizedAddress] = false;
      });
      setTokenLoading(prev => ({ ...prev, ...loadingClearUpdates }));

    } catch (error) {
      console.error('Error fetching token data:', error);

      // Clear loading state on error
      const loadingClearUpdates = {};
      addresses.forEach(address => {
        const normalizedAddress = address.toLowerCase();
        loadingClearUpdates[normalizedAddress] = false;
      });
      setTokenLoading(prev => ({ ...prev, ...loadingClearUpdates }));
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddresses, chainId]);

  /**
   * Load token data for individual address (used for dynamic loading)
   */
  const loadTokenData = useCallback(async (contractAddress) => {
    if (!chainId || !contractAddress) return;

    const normalizedAddress = contractAddress.toLowerCase();

    // Check if already loaded or loading
    if (tokenData[normalizedAddress] || tokenLoading[normalizedAddress]) {
      return;
    }

    setTokenLoading(prev => ({ ...prev, [normalizedAddress]: true }));

    try {
      const data = await coingeckoService.fetchTokenData(contractAddress, chainId);
      setTokenData(prev => ({ ...prev, [normalizedAddress]: data }));
    } catch (error) {
      console.error('Error loading token data:', error);
    } finally {
      setTokenLoading(prev => ({ ...prev, [normalizedAddress]: false }));
    }
  }, [chainId, tokenData, tokenLoading]);

  // Load token data when addresses or chainId changes
  useEffect(() => {
    if (tokenAddresses.length > 0 && chainId) {
      // Filter out addresses that are already loaded or loading
      const addressesToLoad = tokenAddresses.filter(address => {
        const normalizedAddress = address.toLowerCase();
        return !tokenData[normalizedAddress] && !tokenLoading[normalizedAddress];
      });

      if (addressesToLoad.length > 0) {
        refreshTokenData(addressesToLoad);
      }
    }
  }, [tokenAddresses, chainId]); // Note: not including refreshTokenData to avoid infinite loops

  return {
    tokenData,
    tokenLoading,
    refreshTokenData,
    loadTokenData,
    isLoading
  };
};

/**
 * Hook for loading token data for a single address
 * @param {string} contractAddress - Token contract address
 * @param {string} chainId - The chain ID
 * @returns {Object} { tokenData, isLoading, error, refresh }
 */
export const useSingleTokenData = (contractAddress, chainId) => {
  const [tokenData, setTokenData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!contractAddress || !chainId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await coingeckoService.fetchTokenData(contractAddress, chainId);
      setTokenData(data);
    } catch (err) {
      setError(err);
      console.error('Error loading single token data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, chainId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    tokenData,
    isLoading,
    error,
    refresh: loadData
  };
};

export default useTokenData;
