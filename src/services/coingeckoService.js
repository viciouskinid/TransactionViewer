/**
 * CoinGecko API Service
 * Handles all interactions with the CoinGecko API including rate limiting and caching
 */

class CoinGeckoService {
  constructor() {
    this.cache = new Map();
    this.apiQueue = [];
    this.isProcessingQueue = false;
    this.rateLimitDelay = 1000; // 1 second between requests
    this.retryDelay = 5000; // 5 seconds for rate limit retry
  }

  /**
   * Map chainId to CoinGecko platform ID
   */
  getChainToPlatformMap() {
    return {
      '1': 'ethereum',
      '56': 'binance-smart-chain',
      '137': 'polygon-pos',
      '43114': 'avalanche',
      '250': 'fantom',
      '42161': 'arbitrum-one',
      '10': 'optimistic-ethereum',
      '369': 'pulsechain',  // PulseChain platform ID
      // Add more mappings as needed
    };
  }

  /**
   * Process the API queue with rate limiting
   */
  async processApiQueue() {
    if (this.isProcessingQueue || this.apiQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.apiQueue.length > 0) {
      const { contractAddress, chainId, resolve, reject } = this.apiQueue.shift();
      const cacheKey = `${chainId}-${contractAddress.toLowerCase()}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        resolve(this.cache.get(cacheKey));
        continue;
      }
      
      try {
        const platformId = this.getChainToPlatformMap()[chainId];
        if (!platformId) {
          this.cache.set(cacheKey, null);
          resolve(null);
          continue;
        }
        
        const url = `https://api.coingecko.com/api/v3/coins/${platformId}/contract/${contractAddress}`;
        const response = await fetch(url);
        
        if (response.status === 429) {
          // Put the request back at the front of the queue
          this.apiQueue.unshift({ contractAddress, chainId, resolve, reject });
          // Wait before processing next request
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          continue;
        }
        
        if (response.ok) {
          const data = await response.json();
          const tokenInfo = this.parseTokenData(data, contractAddress);
          
          // Cache the result
          this.cache.set(cacheKey, tokenInfo);
          resolve(tokenInfo);
        } else {
          // Cache null result to avoid repeated failed requests
          this.cache.set(cacheKey, null);
          resolve(null);
        }
      } catch (error) {
        console.error('CoinGecko API error:', error);
        this.cache.set(cacheKey, null);
        resolve(null);
      }
      
      // Add delay between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Parse token data from CoinGecko API response
   */
  parseTokenData(data, contractAddress) {
    // Extract decimals and chain info from detail_platforms
    let decimals = 18; // default fallback
    let chainName = '';
    
    if (data.detail_platforms) {
      // Find the matching platform/chain
      const platforms = Object.keys(data.detail_platforms);
      
      const platform = platforms.find(key => {
        const platformData = data.detail_platforms[key];
        return platformData.contract_address && 
               platformData.contract_address.toLowerCase() === contractAddress.toLowerCase();
      });
      
      if (platform && data.detail_platforms[platform]) {
        decimals = data.detail_platforms[platform].decimal_place || 18;
        chainName = platform;
      }
    }
    
    return {
      name: data.name,
      symbol: data.symbol,
      image: data.image?.small || data.image?.thumb,
      price: data.market_data?.current_price?.usd || 0,
      decimals: decimals,
      chainName: chainName,
      contractAddress: contractAddress.toLowerCase()
    };
  }

  /**
   * Fetch token data from CoinGecko API with rate limiting
   * @param {string} contractAddress - The contract address
   * @param {string} chainId - The chain ID
   * @returns {Promise<Object|null>} Token data or null
   */
  async fetchTokenData(contractAddress, chainId) {
    const cacheKey = `${chainId}-${contractAddress.toLowerCase()}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Add to queue and process
    return new Promise((resolve, reject) => {
      this.apiQueue.push({ contractAddress, chainId, resolve, reject });
      this.processApiQueue();
    });
  }

  /**
   * Fetch multiple token data entries
   * @param {Array} tokenRequests - Array of {contractAddress, chainId} objects
   * @returns {Promise<Object>} Object with address as key and token data as value
   */
  async fetchMultipleTokenData(tokenRequests) {
    const promises = tokenRequests.map(async ({ contractAddress, chainId }) => {
      const tokenData = await this.fetchTokenData(contractAddress, chainId);
      return {
        address: contractAddress.toLowerCase(),
        data: tokenData
      };
    });

    const results = await Promise.all(promises);
    
    // Convert to object format
    const tokenDataMap = {};
    results.forEach(({ address, data }) => {
      tokenDataMap[address] = data;
    });

    return tokenDataMap;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize() {
    return this.cache.size;
  }
}

// Export a singleton instance
export const coingeckoService = new CoinGeckoService();
export default coingeckoService;
