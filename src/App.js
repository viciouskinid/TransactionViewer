import React, { useState, useEffect, useMemo } from 'react';
import { allABIs } from './abis';
import { chainsData } from './data/chains.js';

// Ethers.js is loaded via a script tag in the HTML wrapper.
// We access it via `window.ethers`.

// Helper function to decode input data using a given ABI
const decodeInputWithABI = (input, abis) => {
  if (!input || typeof input !== 'string' || input.length < 10 || !window.ethers) {
    return null;
  }

  const iface = new window.ethers.utils.Interface(abis);
  
  try {
    const decoded = iface.parseTransaction({ data: input });
    if (decoded) {
      // Decode parameters to a readable format
      const decodedParameters = {};
      decoded.args.forEach((arg, index) => {
        const paramName = decoded.functionFragment.inputs[index].name || `param${index}`;
        let paramValue = arg;
        if (window.ethers.BigNumber.isBigNumber(arg)) {
          paramValue = arg.toString();
        } else if (Array.isArray(arg)) {
            // Handle arrays of parameters
            paramValue = arg.map(item => window.ethers.BigNumber.isBigNumber(item) ? item.toString() : item);
        }
        decodedParameters[paramName] = paramValue;
      });
      return {
        functionName: decoded.name,
        functionSignature: decoded.functionFragment.format(),
        decodedParameters: decodedParameters,
      };
    }
  } catch (err) {
    console.error("Failed to decode with ABI:", err);
  }

  return null;
};

// Helper function to decode logs using a given ABI
const decodeLogsWithABI = (logs, abis) => {
  if (!logs || !window.ethers) {
    return [];
  }
  const iface = new window.ethers.utils.Interface(abis);
  const decodedLogs = [];

  logs.forEach(log => {
    try {
      const parsedLog = iface.parseLog(log);
      if (parsedLog) {
        const decodedArgs = {};
        parsedLog.args.forEach((arg, index) => {
          const paramName = parsedLog.eventFragment.inputs[index].name || `arg${index}`;
          let paramValue = arg;
          if (window.ethers.BigNumber.isBigNumber(arg)) {
            paramValue = arg.toString();
          } else if (Array.isArray(arg)) {
              paramValue = arg.map(item => window.ethers.BigNumber.isBigNumber(item) ? item.toString() : item);
          }
          decodedArgs[paramName] = paramValue;
        });
        decodedLogs.push({
          eventName: parsedLog.name,
          eventSignature: parsedLog.eventFragment.format(), // Add the full event signature
          address: log.address,
          logIndex: parseInt(log.logIndex, 16), // Convert hex logIndex to a decimal number
          topics: log.topics, // Add the raw topics to the decoded log object
          args: decodedArgs, // Pass the arguments as a structured object, not a string
          isDecoded: true,
        });
      }
    } catch (err) {
      // If decoding fails, add the raw log to the list with a flag
      decodedLogs.push({
        address: log.address,
        logIndex: parseInt(log.logIndex, 16),
        topics: log.topics,
        data: log.data,
        isDecoded: false,
      });
      console.warn("Could not decode log:", log, err);
    }
  });

  return decodedLogs;
};


// Main application component
export default function App() {
  // State variables for the transaction hash, RPC URL, and transaction data
  const [txHash, setTxHash] = useState('0x9c54a7938b98c4db6e6d8d4bc6aea98a62f032cdd3e88b97b5f96c4dd52442de');
  const [rpcUrl, setRpcUrl] = useState('https://rpc-pulsechain.g4mm4.io');
  const [transactionData, setTransactionData] = useState(null);
  const [structuredTransactionData, setStructuredTransactionData] = useState(null);
  const [transactionReceipt, setTransactionReceipt] = useState(null);
  const [structuredTransactionReceipt, setStructuredTransactionReceipt] = useState(null);
  const [decodedInputData, setDecodedInputData] = useState(null);
  const [decodedLogs, setDecodedLogs] = useState([]);
  const [blockData, setBlockData] = useState(null);
  const [structuredBlockData, setStructuredBlockData] = useState(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEthersReady, setIsEthersReady] = useState(false);
  const [showStructuredView, setShowStructuredView] = useState(true);
  const [tokenData, setTokenData] = useState({});
  const [tokenLoading, setTokenLoading] = useState({});

  // Get chain ID from transaction data
  const getChainId = () => {
    if (!transactionData) return null;
    // Convert hex chainId to integer
    const chainIdHex = transactionData.chainId || '0x171'; // Default to PulseChain hex if not available
    const chainIdInt = parseInt(chainIdHex, 16);
    return chainIdInt.toString();
  };

  // Cache for token data to avoid repeated API calls
  const tokenCache = useMemo(() => new Map(), []);
  
  // Rate limiting queue for API requests
  const apiQueue = useMemo(() => [], []);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Process API queue with delays to respect rate limits
  const processApiQueue = async () => {
    if (isProcessingQueue || apiQueue.length === 0) return;
    
    setIsProcessingQueue(true);
    
    while (apiQueue.length > 0) {
      const { contractAddress, chainId, resolve, reject } = apiQueue.shift();
      const cacheKey = `${chainId}-${contractAddress.toLowerCase()}`;
      
      // Check cache first
      if (tokenCache.has(cacheKey)) {
        resolve(tokenCache.get(cacheKey));
        continue;
      }
      
      try {
        // Map chainId to CoinGecko platform ID
        const chainToPlatformMap = {
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
        
        const platformId = chainToPlatformMap[chainId];
        if (!platformId) {
          tokenCache.set(cacheKey, null);
          resolve(null);
          continue;
        }
        
        const url = `https://api.coingecko.com/api/v3/coins/${platformId}/contract/${contractAddress}`;
        
        const response = await fetch(url);
        
        if (response.status === 429) {
          // Put the request back at the front of the queue
          apiQueue.unshift({ contractAddress, chainId, resolve, reject });
          // Wait 5 seconds before processing next request
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        if (response.ok) {
          const data = await response.json();
          
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
          
          const tokenInfo = {
            name: data.name,
            symbol: data.symbol,
            image: data.image?.small || data.image?.thumb,
            price: data.market_data?.current_price?.usd || 0,
            decimals: decimals,
            chainName: chainName
          };
          
          // Cache the result
          tokenCache.set(cacheKey, tokenInfo);
          resolve(tokenInfo);
        } else {
          // Cache null result to avoid repeated failed requests
          tokenCache.set(cacheKey, null);
          resolve(null);
        }
      } catch (error) {
        tokenCache.set(cacheKey, null);
        resolve(null);
      }
      
      // Add delay between requests to respect rate limits (1 request per second)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setIsProcessingQueue(false);
  };

  // Fetch token data from CoinGecko API with rate limiting
  const fetchTokenData = async (contractAddress, chainId) => {
    const cacheKey = `${chainId}-${contractAddress.toLowerCase()}`;
    
    // Check cache first
    if (tokenCache.has(cacheKey)) {
      return tokenCache.get(cacheKey);
    }
    
    // Add to queue and process
    return new Promise((resolve, reject) => {
      apiQueue.push({ contractAddress, chainId, resolve, reject });
      processApiQueue();
    });
  };

  // Load token data for all ERC20 contracts and native token
  useEffect(() => {
    if (!transactionData) return;
    
    const chainId = getChainId();
    const chainData = chainId ? chainsData[chainId] : null;
    
    // Get ERC20 token contracts
    const tokenContracts = decodedLogs
      .filter(log => log.isDecoded && log.eventName === 'Transfer')
      .map(log => log.address)
      .filter((address, index, self) => self.indexOf(address) === index); // Remove duplicates

    // Add native token address if available and not already included
    const allTokens = [...tokenContracts];
    if (chainData?.nativeTokenAddress && !allTokens.includes(chainData.nativeTokenAddress)) {
      allTokens.push(chainData.nativeTokenAddress);
    }

    allTokens.forEach(async (contractAddress) => {
      // Use a normalized key to prevent duplicate loading due to case sensitivity
      const normalizedAddress = contractAddress.toLowerCase();
      
      if (tokenData[normalizedAddress] || tokenLoading[normalizedAddress]) {
        return;
      }
      
      setTokenLoading(prev => ({ ...prev, [normalizedAddress]: true }));
      
      const data = await fetchTokenData(contractAddress, chainId);
      
      setTokenData(prev => ({ ...prev, [normalizedAddress]: data }));
      setTokenLoading(prev => ({ ...prev, [normalizedAddress]: false }));
    });
  }, [decodedLogs, transactionData]); // Removed tokenData and tokenLoading dependencies to prevent infinite loop

  // Load ethers.js from a CDN
  useEffect(() => {
    if (window.ethers) {
        setIsEthersReady(true);
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js';
    script.onload = () => {
        setIsEthersReady(true);
        console.log("Ethers.js loaded from CDN.");
    };
    script.onerror = () => {
        setError("Failed to load ethers.js library. Please try again.");
    };
    document.body.appendChild(script);
    
    return () => {
        document.body.removeChild(script);
    };
  }, []);

  // useEffect hook to decode the input data whenever transactionData changes
  useEffect(() => {
    if (isEthersReady && transactionData && transactionData.input && transactionData.input !== '0x') {
      const decoded = decodeInputWithABI(transactionData.input, allABIs);
      setDecodedInputData(decoded);
    } else {
      setDecodedInputData(null);
    }
  }, [transactionData, isEthersReady]);

  // useEffect hook to decode logs whenever transactionReceipt changes
  useEffect(() => {
    if (isEthersReady && transactionReceipt && transactionReceipt.logs) {
      const decoded = decodeLogsWithABI(transactionReceipt.logs, allABIs);
      setDecodedLogs(decoded);
    } else {
      setDecodedLogs([]);
    }
  }, [transactionReceipt, isEthersReady]);

  // Handle URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTxHash = urlParams.get('tx');
    const urlRpcUrl = urlParams.get('rpc');
    
    if (urlTxHash) {
      setTxHash(urlTxHash);
    }
    if (urlRpcUrl) {
      setRpcUrl(decodeURIComponent(urlRpcUrl));
    }
    
    // Auto-fetch if both parameters are provided
    if (urlTxHash && urlRpcUrl && isEthersReady) {
      // Call fetchTransactionData after state updates
      setTimeout(() => {
        fetchTransactionData();
      }, 100);
    }
  }, [isEthersReady]); // Only depend on isEthersReady to avoid infinite loops

  // Update URL parameters when txHash or rpcUrl changes
  useEffect(() => {
    const urlParams = new URLSearchParams();
    if (txHash) {
      urlParams.set('tx', txHash);
    }
    if (rpcUrl) {
      urlParams.set('rpc', encodeURIComponent(rpcUrl));
    }
    
    const newUrl = urlParams.toString() ? 
      `${window.location.pathname}?${urlParams.toString()}` : 
      window.location.pathname;
    
    window.history.replaceState({}, '', newUrl);
  }, [txHash, rpcUrl]);

  // Function to fetch block data
  const fetchBlockData = async (blockNumber) => {
    if (!blockNumber || !rpcUrl || !isEthersReady) return;
    
    setBlockLoading(true);
    try {
      const blockRequestBody = {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [`0x${blockNumber.toString(16)}`, false], // false = don't include full transactions
        id: 3,
      };

      const blockResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockRequestBody),
      });

      if (!blockResponse.ok) {
        throw new Error(`HTTP error! status: ${blockResponse.status}`);
      }

      const blockResult = await blockResponse.json();
      if (blockResult.result) {
        setBlockData(blockResult.result);
        
        // Format timestamp for display
        const timestamp = parseInt(blockResult.result.timestamp, 16) * 1000;
        const blockDate = new Date(timestamp);
        const now = new Date();
        const diffInMinutes = Math.floor((now - blockDate) / (1000 * 60));
        
        let timeAgo;
        if (diffInMinutes < 1) {
          timeAgo = 'just now';
        } else if (diffInMinutes < 60) {
          timeAgo = `${diffInMinutes} mins ago`;
        } else if (diffInMinutes < 1440) {
          timeAgo = `${Math.floor(diffInMinutes / 60)} hours ago`;
        } else {
          timeAgo = `${Math.floor(diffInMinutes / 1440)} days ago`;
        }

        const formattedDate = blockDate.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'UTC',
          timeZoneName: 'short'
        });

        const gasUsed = parseInt(blockResult.result.gasUsed, 16);
        const gasLimit = parseInt(blockResult.result.gasLimit, 16);
        const utilization = ((gasUsed / gasLimit) * 100).toFixed(1);
        const baseFeePerGas = blockResult.result.baseFeePerGas ? parseInt(blockResult.result.baseFeePerGas, 16) : null;

        const structuredBlock = {
          number: parseInt(blockResult.result.number, 16),
          timestamp: `${timeAgo} (${formattedDate})`,
          gasUtilization: `${gasUsed.toLocaleString()}/${gasLimit.toLocaleString()} (${utilization}%)`,
          baseFeePerGas: baseFeePerGas ? `${(baseFeePerGas / 1e9).toFixed(2)} Gwei` : 'N/A',
          transactionCount: blockResult.result.transactions ? blockResult.result.transactions.length : 0,
        };
        setStructuredBlockData(structuredBlock);
      }
    } catch (err) {
      console.error('Failed to fetch block data:', err);
    } finally {
      setBlockLoading(false);
    }
  };

  // Async function to fetch both transaction data and the receipt from the blockchain RPC
  const fetchTransactionData = async () => {
    // Reset all states and show loading indicator
    setLoading(true);
    setTransactionData(null);
    setStructuredTransactionData(null);
    setTransactionReceipt(null);
    setStructuredTransactionReceipt(null);
    setBlockData(null);
    setStructuredBlockData(null);
    setDecodedInputData(null);
    setDecodedLogs([]);
    setError(null);

    // Basic validation
    if (!txHash || !rpcUrl) {
      setError('Please enter a valid transaction hash and RPC URL.');
      setLoading(false);
      return;
    }
    
    if (!isEthersReady) {
        setError('Ethers.js is not loaded yet. Please wait a moment and try again.');
        setLoading(false);
        return;
    }

    try {
      // Step 1: Fetch the raw transaction data
      const txRequestBody = {
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1,
      };

      let txResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txRequestBody),
      });

      if (!txResponse.ok) {
        throw new Error(`HTTP error! status: ${txResponse.status}`);
      }

      let txData = await txResponse.json();
      if (txData.result) {
        setTransactionData(txData.result);
        // Create structured version for display
        const chainId = txData.result.chainId ? parseInt(txData.result.chainId, 16) : 369;
        const chainData = chainsData[chainId];
        const tokenSymbol = chainData?.tokenSymbol || 'ETH';
        
        const structuredTxData = {
          from: txData.result.from,
          to: txData.result.to,
          value: window.ethers.utils.formatEther(txData.result.value) + ` ${tokenSymbol}`,
          nonce: parseInt(txData.result.nonce, 16),
          type: parseInt(txData.result.type, 16) === 0 ? 'Legacy' : 'EIP-1559',
          chainId: chainId,
          // Gas data will be shown in separate Gas section
          gas: txData.result.gas,
          gasPrice: txData.result.gasPrice,
          maxPriorityFeePerGas: txData.result.maxPriorityFeePerGas,
          maxFeePerGas: txData.result.maxFeePerGas,
        };
        setStructuredTransactionData(structuredTxData);
      } else {
        setError(txData.error ? txData.error.message : 'Transaction not found or invalid response for getTransactionByHash.');
      }
      
      // Step 2: Fetch the raw transaction receipt
      const receiptRequestBody = {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 2,
      };

      let receiptResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receiptRequestBody),
      });

      if (!receiptResponse.ok) {
        throw new Error(`HTTP error! status: ${receiptResponse.status}`);
      }

      let receiptData = await receiptResponse.json();
      if (receiptData.result) {
        setTransactionReceipt(receiptData.result);
        
        // Calculate the transaction fee
        const gasUsed = window.ethers.BigNumber.from(receiptData.result.gasUsed);
        const effectiveGasPrice = window.ethers.BigNumber.from(receiptData.result.effectiveGasPrice);
        const transactionFee = window.ethers.utils.formatEther(gasUsed.mul(effectiveGasPrice));

        // Create structured version for display, excluding logs and gas data
        const structuredReceiptData = {
          transactionHash: receiptData.result.transactionHash,
          status: parseInt(receiptData.result.status, 16) === 1 ? 'Success' : 'Failed',
          contractAddress: receiptData.result.contractAddress || 'N/A',
          // Gas data will be shown in separate Gas section
          gasUsed: receiptData.result.gasUsed,
          effectiveGasPrice: receiptData.result.effectiveGasPrice,
        };
        setStructuredTransactionReceipt(structuredReceiptData);
        
        // Fetch block data
        const blockNumber = parseInt(receiptData.result.blockNumber, 16);
        const transactionIndex = parseInt(receiptData.result.transactionIndex, 16);
        
        // Store transaction index for block display
        setStructuredTransactionReceipt({
          ...structuredReceiptData,
          blockNumber,
          transactionIndex,
        });
        
        fetchBlockData(blockNumber);
      } else {
        setError(receiptData.error ? receiptData.error.message : 'Transaction receipt not found or invalid response.');
      }

    } catch (err) {
      // Catch any network or parsing errors
      setError(`Failed to fetch data: ${err.message}`);
    } finally {
      // Hide the loading indicator
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-8 flex flex-col items-center justify-center font-sans">
      {/* --- Dynamic Content based on view state --- */}
      {showStructuredView ? (
        <>
          {/* --- Flexible Grid Layout for All Tiles --- */}
          <div className="w-full flex flex-wrap gap-6 mt-6 justify-center">
            {/* --- Transaction Viewer Card --- */}
            <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
              <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-200 text-center flex items-center justify-center">
                <i className="fas fa-search mr-3"></i>
                Transaction Viewer
              </h1>
              <div className="mb-4">
                <label htmlFor="rpcUrl" className="block text-sm font-medium mb-1">
                  RPC URL
                </label>
                <input
                  type="text"
                  id="rpcUrl"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  placeholder="e.g., https://mainnet.infura.io/v3/..."
                />
              </div>

              <div className="mb-6">
                <label htmlFor="txHash" className="block text-sm font-medium mb-1">
                  Transaction Hash
                </label>
                <input
                  type="text"
                  id="txHash"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="e.g., 0x..."
                />
              </div>

              <button
                onClick={fetchTransactionData}
                disabled={loading || !isEthersReady}
                className="w-full py-3 px-4 rounded-lg text-white font-semibold transition-all duration-300
                           bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50
                           dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-400/50
                           disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Fetching...' : isEthersReady ? 'Fetch Transaction Data & Receipt' : 'Loading Libraries...'}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-700">
                  <p className="font-semibold">Error:</p>
                  <p>{error}</p>
                </div>
              )}
            </div>
            {/* --- Block Section --- */}
            {structuredTransactionReceipt && (
              <div className="w-full max-w-2xl bg-purple-50 border border-purple-200 rounded-xl shadow-lg p-6"
                   style={{ backgroundColor: '#F3E8FF' }}>
                <h2 className="text-2xl font-bold mb-6 text-purple-700 flex items-center">
                  <i className="fas fa-cube mr-2"></i>
                  Block Information
                  {blockLoading && (
                    <div className="ml-2 inline-flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-700"></div>
                    </div>
                  )}
                </h2>
              <div className="space-y-4">
                {/* Block Number */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-purple-200 pb-4">
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-hashtag text-purple-500"></i>
                    <span className="text-sm font-semibold text-purple-600">Block Number:</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="break-words font-mono text-sm text-gray-700">
                      {structuredBlockData ? structuredBlockData.number : structuredTransactionReceipt.blockNumber}
                    </span>
                  </div>
                </div>
                
                {/* Transaction Index */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-purple-200 pb-4">
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-chart-simple text-purple-500"></i>
                    <span className="text-sm font-semibold text-purple-600">Transaction Index:</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="break-words font-mono text-sm text-gray-700">
                      {structuredTransactionReceipt.transactionIndex}
                      {structuredBlockData && ` of ${structuredBlockData.transactionCount} transactions`}
                      {!structuredBlockData && blockLoading && (
                        <span className="text-gray-500 ml-2">
                          <div className="inline-block animate-pulse">Loading...</div>
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Other Block Data - Show placeholders or actual data */}
                {structuredBlockData ? (
                  Object.entries(structuredBlockData)
                    .filter(([key]) => !['number', 'transactionCount'].includes(key))
                    .map(([key, value]) => {
                    // Define icons for different fields
                    const getIcon = (fieldKey) => {
                      switch (fieldKey) {
                        case 'timestamp':
                          return <i className="fa-solid fa-clock text-purple-500"></i>;
                        case 'gasUtilization':
                          return <i className="fa-solid fa-chart-pie text-purple-500"></i>;
                        case 'baseFeePerGas':
                          return <i className="fa-solid fa-coins text-purple-500"></i>;
                        default:
                          return <i className="fa-solid fa-circle-info text-purple-500"></i>;
                      }
                    };

                    // Format field names to be more readable
                    const formatFieldName = (fieldKey) => {
                      switch (fieldKey) {
                        case 'timestamp':
                          return 'Timestamp';
                        case 'gasUtilization':
                          return 'Gas Utilization';
                        case 'baseFeePerGas':
                          return 'Base Fee Per Gas';
                        default:
                          return fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1);
                      }
                    };

                    return (
                      <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-purple-200 pb-4 last:border-b-0 last:pb-0">
                        <div className="flex items-center space-x-2">
                          {getIcon(key)}
                          <span className="text-sm font-semibold text-purple-600">
                            {formatFieldName(key)}:
                          </span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {typeof value === 'object' ? JSON.stringify(value) : value}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : blockLoading ? (
                  // Placeholder loading states
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-purple-200 pb-4">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-clock text-purple-500"></i>
                        <span className="text-sm font-semibold text-purple-600">Timestamp:</span>
                      </div>
                      <div className="md:col-span-2">
                        <div className="animate-pulse bg-gray-300 h-4 w-48 rounded"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-purple-200 pb-4">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-chart-pie text-purple-500"></i>
                        <span className="text-sm font-semibold text-purple-600">Gas Utilization:</span>
                      </div>
                      <div className="md:col-span-2">
                        <div className="animate-pulse bg-gray-300 h-4 w-32 rounded"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-coins text-purple-500"></i>
                        <span className="text-sm font-semibold text-purple-600">Base Fee Per Gas:</span>
                      </div>
                      <div className="md:col-span-2">
                        <div className="animate-pulse bg-gray-300 h-4 w-24 rounded"></div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            )}

            {/* --- Receipt Section --- */}
            {structuredTransactionReceipt && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Receipt</h2>
              <div className="space-y-4">
                {Object.entries(structuredTransactionReceipt).map(([key, value]) => {
                  // Define icons for different fields
                  const getIcon = (fieldKey) => {
                    switch (fieldKey) {
                      case 'transactionHash':
                        return <i className="fa-solid fa-file-invoice text-blue-500"></i>;
                      case 'status':
                        return value === 'Success' ? 
                          <i className="fa-solid fa-circle-check text-green-500"></i> : 
                          <i className="fa-solid fa-circle-xmark text-red-500"></i>;
                      case 'contractAddress':
                        return <i className="fa-solid fa-file-contract text-gray-400"></i>;
                      default:
                        return <i className="fa-solid fa-circle-info text-gray-400"></i>;
                    }
                  };

                  // Format field names to be more readable
                  const formatFieldName = (fieldKey) => {
                    switch (fieldKey) {
                      case 'transactionHash':
                        return 'Transaction Hash';
                      case 'contractAddress':
                        return 'Contract Address';
                      default:
                        return fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1);
                    }
                  };

                  // Apply special styling for status
                  const getValueStyle = (fieldKey, fieldValue) => {
                    if (fieldKey === 'status') {
                      return fieldValue === 'Success' 
                        ? 'text-green-600 font-semibold' 
                        : 'text-red-600 font-semibold';
                    }
                    return 'text-gray-700 dark:text-gray-200';
                  };

                  // Skip gas-related fields and block info as they're now in other sections
                  if (['gasUsed', 'effectiveGasPrice', 'blockNumber', 'transactionIndex'].includes(key)) {
                    return null;
                  }

                  return (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-200 dark:border-gray-600 pb-4 last:border-b-0 last:pb-0">
                      <div className="flex items-center space-x-2">
                        {getIcon(key)}
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                          {formatFieldName(key)}:
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        <span className={`break-words font-mono text-sm ${getValueStyle(key, value)}`}>
                          {typeof value === 'object' ? JSON.stringify(value) : value}
                        </span>
                        {(key === 'transactionHash' || key === 'contractAddress') && value !== 'N/A' && (
                          <button 
                            onClick={() => navigator.clipboard?.writeText(value)}
                            className="text-gray-400 hover:text-blue-500 ml-2 transition-colors"
                            title="Copy to clipboard"
                          >
                            <i className="fa-regular fa-copy"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* Gas Section */}
            {transactionData && structuredTransactionData && transactionReceipt && structuredTransactionReceipt && (
              <div className="w-full max-w-2xl bg-yellow-50 border border-yellow-200 rounded-xl shadow-lg p-6"
                   style={{ backgroundColor: '#FEF3E2' }}>
                <h2 className="text-2xl font-bold mb-6 text-yellow-700 flex items-center">
                  <i className="fas fa-gas-pump mr-2"></i>
                  Gas Information
                </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Transaction Gas Data (Left) */}
                <div>
                  <h3 className="text-lg font-semibold text-yellow-600 mb-4 flex items-center">
                    <i className="fas fa-arrow-up mr-2"></i>
                    Message Data
                  </h3>
                  <div className="space-y-3">
                    {structuredTransactionData.gas && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-yellow-200 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-tachometer-alt text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Gas Limit:</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {parseInt(structuredTransactionData.gas, 16).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    {structuredTransactionData.maxPriorityFeePerGas && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-yellow-200 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-star text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Max Priority Fee:</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {(parseInt(structuredTransactionData.maxPriorityFeePerGas, 16) / 1e9).toFixed(2)} Gwei
                          </span>
                        </div>
                      </div>
                    )}
                    {structuredTransactionData.maxFeePerGas && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-yellow-200 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-fire text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Max Fee Per Gas:</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {(parseInt(structuredTransactionData.maxFeePerGas, 16) / 1e9).toFixed(2)} Gwei
                          </span>
                        </div>
                      </div>
                    )}
                    {structuredTransactionData.maxPriorityFeePerGas && structuredTransactionData.maxFeePerGas && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-calculator text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Max Base Fee:</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {((parseInt(structuredTransactionData.maxFeePerGas, 16) - parseInt(structuredTransactionData.maxPriorityFeePerGas, 16)) / 1e9).toFixed(2)} Gwei
                            {blockData?.baseFeePerGas && (() => {
                              const maxBaseFee = parseInt(structuredTransactionData.maxFeePerGas, 16) - parseInt(structuredTransactionData.maxPriorityFeePerGas, 16);
                              const baseFeePerGas = parseInt(blockData.baseFeePerGas, 16);
                              const percentage = ((maxBaseFee / baseFeePerGas) * 100);
                              if (percentage > 0) {
                                return (
                                  <span className="text-xs text-gray-500 ml-2">
                                    ({percentage.toFixed(1)}% of base fee)
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Receipt Gas Data (Right) */}
                <div>
                  <h3 className="text-lg font-semibold text-yellow-600 mb-4 flex items-center">
                    <i className="fas fa-receipt mr-2"></i>
                    Receipt Data
                  </h3>
                  <div className="space-y-3">
                    {/* Gas Used with Gas Efficiency - moved to top */}
                    {structuredTransactionReceipt.gasUsed && transactionData.gas && transactionReceipt.gasUsed && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-yellow-200 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-burn text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Gas Used:</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {parseInt(structuredTransactionReceipt.gasUsed, 16).toLocaleString()} ({((parseInt(transactionReceipt.gasUsed, 16) / parseInt(transactionData.gas, 16)) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Effective Gas Price */}
                    {structuredTransactionReceipt.effectiveGasPrice && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-yellow-200 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-calculator text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Effective Gas Price:</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {(parseInt(structuredTransactionReceipt.effectiveGasPrice, 16) / 1e9).toFixed(2)} Gwei
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Transaction Fee from receipt calculation */}
                    {transactionReceipt.gasUsed && transactionReceipt.effectiveGasPrice && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
                        <div className="flex items-center space-x-2">
                          <i className="fas fa-money-bill text-yellow-500"></i>
                          <span className="text-sm font-semibold text-yellow-600">Transaction Fee:</span>
                        </div>
                        <div className="md:col-span-2 flex items-center space-x-2">
                          <span className="break-words font-mono text-sm text-gray-700">
                            {((parseInt(transactionReceipt.gasUsed, 16) * parseInt(transactionReceipt.effectiveGasPrice, 16)) / 1e18).toFixed(6)}
                          </span>
                          {(() => {
                            // Get chain data from YAML based on chainId
                            const chainId = structuredTransactionData?.chainId;
                            const chainData = chainId ? chainsData[chainId] : null;
                            const chainName = chainData?.name;
                            const nativeTokenAddress = chainData?.nativeTokenAddress;
                            const nativeTokenData = nativeTokenAddress ? tokenData[nativeTokenAddress.toLowerCase()] : null;
                            
                            // Calculate USD value if native token price is available
                            const feeInNative = ((parseInt(transactionReceipt.gasUsed, 16) * parseInt(transactionReceipt.effectiveGasPrice, 16)) / 1e18);
                            const feeInUSD = nativeTokenData?.price ? (feeInNative * nativeTokenData.price) : null;
                            
                            if (chainName) {
                              const iconUrl = `https://icons.llamao.fi/icons/chains/rsz_${chainName.toLowerCase().replace(/\s+/g, '-')}?w=16&h=16`;
                              return (
                                <div className="flex items-center space-x-1">
                                  {feeInUSD && (
                                    <span className="text-sm font-semibold text-green-600">
                                      (${feeInUSD.toFixed(4)})
                                    </span>
                                  )}
                                  <span className="text-sm text-gray-600">{chainData.tokenSymbol || chainName}</span>
                                  <img 
                                    src={iconUrl}
                                    alt={chainName}
                                    className="w-4 h-4 rounded-full"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                    }}
                                  />
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* --- Message Section --- */}
            {structuredTransactionData && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Message</h2>
              <div className="space-y-4">
                {Object.entries(structuredTransactionData)
                  .filter(([key]) => !['gas', 'gasPrice', 'maxPriorityFeePerGas', 'maxFeePerGas'].includes(key))
                  .map(([key, value]) => {
                  // Define icons for different fields
                  const getIcon = (fieldKey) => {
                    switch (fieldKey) {
                      case 'from':
                        return <i className="fa-solid fa-paper-plane text-gray-400"></i>;
                      case 'to':
                        return <i className="fa-solid fa-bullseye text-gray-400"></i>;
                      case 'value':
                        return <i className="fa-solid fa-coins text-yellow-500"></i>;
                      case 'gasPrice':
                        return <i className="fa-solid fa-gas-pump text-gray-400"></i>;
                      case 'nonce':
                        return <i className="fa-solid fa-hashtag text-gray-400"></i>;
                      case 'type':
                        return <i className="fa-solid fa-tag text-gray-400"></i>;
                      default:
                        return <i className="fa-solid fa-circle-info text-gray-400"></i>;
                    }
                  };

                  // Format field names to be more readable
                  const formatFieldName = (fieldKey) => {
                    switch (fieldKey) {
                      case 'gasPrice':
                        return 'Gas Price';
                      default:
                        return fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1);
                    }
                  };

                  return (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-200 dark:border-gray-600 pb-4 last:border-b-0 last:pb-0">
                      <div className="flex items-center space-x-2">
                        {getIcon(key)}
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                          {formatFieldName(key)}:
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        {key === 'value' ? (() => {
                          // Parse the value to separate amount and token symbol
                          const valueStr = typeof value === 'string' ? value : value.toString();
                          const match = valueStr.match(/^([\d.]+)\s+(\w+)$/);
                          
                          if (match) {
                            const [, amount, tokenSymbol] = match;
                            const chainId = structuredTransactionData?.chainId;
                            const chainData = chainId ? chainsData[chainId] : null;
                            const nativeTokenAddress = chainData?.nativeTokenAddress;
                            const nativeTokenData = nativeTokenAddress ? tokenData[nativeTokenAddress.toLowerCase()] : null;
                            const chainName = chainData?.name;
                            
                            // Calculate USD value
                            const valueInNative = parseFloat(amount);
                            const valueInUSD = nativeTokenData?.price ? (valueInNative * nativeTokenData.price) : null;
                            
                            return (
                              <div className="flex items-center space-x-2">
                                <span className="break-words font-mono text-sm text-gray-700 dark:text-gray-200">
                                  {amount}
                                </span>
                                {valueInUSD && (
                                  <span className="text-sm font-semibold text-green-600">
                                    (${valueInUSD.toFixed(4)})
                                  </span>
                                )}
                                <span className="text-sm text-gray-600">{tokenSymbol}</span>
                                {chainName && (() => {
                                  const iconUrl = `https://icons.llamao.fi/icons/chains/rsz_${chainName.toLowerCase().replace(/\s+/g, '-')}?w=16&h=16`;
                                  return (
                                    <img 
                                      src={iconUrl}
                                      alt={chainName}
                                      className="w-4 h-4 rounded-full"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                            );
                          } else {
                            // Fallback for non-standard format
                            return (
                              <span className="break-words font-mono text-sm text-gray-700 dark:text-gray-200">
                                {valueStr}
                              </span>
                            );
                          }
                        })() : (
                          <span className="break-words font-mono text-sm text-gray-700 dark:text-gray-200">
                            {typeof value === 'object' ? JSON.stringify(value) : value}
                          </span>
                        )}
                        {(key === 'from' || key === 'to') && (
                          <button 
                            onClick={() => navigator.clipboard?.writeText(value)}
                            className="text-gray-400 hover:text-blue-500 ml-2 transition-colors"
                            title="Copy address"
                          >
                            <i className="fa-regular fa-copy"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* --- Input Section --- */}
            {decodedInputData && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center -m-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Input</h3>
                </div>
              <div className="text-sm">
                <p className="font-medium text-gray-600 dark:text-gray-400">Function Call:</p>
                <code className="block bg-gray-100 dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 font-mono text-xs overflow-x-auto">
                  {decodedInputData.functionSignature}
                </code>
              </div>
              <div className="text-sm mt-4">
                <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">Parameters:</p>
                <div className="space-y-1">
                  {Object.entries(decodedInputData.decodedParameters).map(([key, value]) => (
                    <div key={key} className="flex items-start bg-gray-100 dark:bg-gray-800 p-1.5 rounded border border-gray-200 dark:border-gray-700">
                      <span className="text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{key}:</span>
                      <code className="font-mono text-gray-800 dark:text-gray-200 break-all ml-2 flex-1">
                        {typeof value === 'object' ? JSON.stringify(value) : value}
                      </code>
                      <button 
                        onClick={() => navigator.clipboard?.writeText(typeof value === 'object' ? JSON.stringify(value) : value)}
                        className="text-gray-400 hover:text-blue-500 ml-2 transition-colors flex-shrink-0"
                        title="Copy value"
                      >
                        <i className="fa-regular fa-copy"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* --- Event Logs, ERC20 Transfers, and Token Flow Layout --- */}
          {decodedLogs.length > 0 && (
            <div className="w-full mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Event Logs Column */}
                <div className="lg:col-span-1">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center -m-6 mb-6">
                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Event Logs ({decodedLogs.length})</h3>
                    </div>
                {decodedLogs.map((log, index) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4 last:mb-0">
                    {/* Log Header */}
                    <div className="bg-gray-50 dark:bg-gray-700 px-3 py-2 flex items-center space-x-2 border-b border-gray-200 dark:border-gray-600">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-indigo-100 bg-indigo-700 rounded-full">
                        {log.logIndex}
                      </span>
                      <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                        {log.isDecoded ? log.eventSignature : "Undecodable Log"}
                      </span>
                    </div>
                    {/* Log Body */}
                    <div className="p-3 text-xs space-y-2 bg-white dark:bg-gray-800">
                      {/* Address */}
                      <div className="flex items-start">
                        <span className="font-medium text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">Address:</span>
                        <span className="text-blue-600 dark:text-blue-400 hover:underline font-mono break-all ml-2" role="button" tabIndex={0}>
                          {log.address}
                        </span>
                        <button 
                          onClick={() => navigator.clipboard?.writeText(log.address)}
                          className="text-gray-400 hover:text-blue-500 ml-2 transition-colors flex-shrink-0"
                          title="Copy address"
                        >
                          <i className="fa-regular fa-copy"></i>
                        </button>
                      </div>
                      {/* Topics - Only show for undecodable logs */}
                      {!log.isDecoded && (
                        <div className="flex items-start">
                          <span className="font-medium text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">Topics:</span>
                          <div className="ml-2 space-y-1 w-full">
                            {log.topics.map((topic, topicIndex) => (
                              <div key={topicIndex} className="flex items-center">
                                <span className="text-gray-400 dark:text-gray-500 mr-2">{topicIndex}:</span>
                                <code className="font-mono text-gray-800 dark:text-gray-200 break-all bg-gray-100 dark:bg-gray-700 px-1 rounded border border-gray-200 dark:border-gray-600 w-full overflow-x-auto">
                                  {topic}
                                </code>
                                <button 
                                  onClick={() => navigator.clipboard?.writeText(topic)}
                                  className="text-gray-400 hover:text-blue-500 ml-2 transition-colors flex-shrink-0"
                                  title="Copy topic"
                                >
                                  <i className="fa-regular fa-copy"></i>
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                      )}
                      {/* Parameters / Raw Data */}
                      {log.isDecoded ? (
                        <div className="flex items-start">
                          <span className="font-medium text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">Params:</span>
                          <div className="ml-2 space-y-1 w-full">
                            {Object.entries(log.args).map(([key, value], paramIndex) => (
                              <div key={paramIndex} className="flex items-start bg-gray-100 dark:bg-gray-700 p-1 rounded border border-gray-200 dark:border-gray-600">
                                <span className="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">{key}:</span>
                                <code className="font-mono text-gray-800 dark:text-gray-200 break-all ml-2">
                                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                                </code>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start">
                          <span className="font-medium text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">Data:</span>
                          <code className="font-mono text-gray-800 dark:text-gray-200 break-all bg-gray-100 dark:bg-gray-700 px-1 rounded border border-gray-200 dark:border-gray-600 w-full overflow-x-auto ml-2">
                            {log.data}
                          </code>
                      </div>
                      )}
                  </div>
                  </div>
                ))}
                  </div>
                </div>

                {/* ERC20 Transfers and Token Flow Column */}
                <div className="lg:col-span-1">
                  <div className="space-y-6">
                    {/* ERC20 Transfers Section */}
                    <div className="bg-green-50 border border-green-200 rounded-xl shadow-lg p-6"
                         style={{ backgroundColor: '#F0FDF4' }}>
                      <h2 className="text-2xl font-bold mb-6 text-green-700 flex items-center">
                          <i className="fas fa-exchange-alt mr-2"></i>
                          ERC20 Transfers
                        </h2>
                  <div className="space-y-3">
                    {decodedLogs
                      .filter(log => log.isDecoded && log.eventName === 'Transfer')
                      .map((log, index) => {
                        // Extract transfer details
                        const from = log.args.from || 'Unknown';
                        const to = log.args.to || 'Unknown';
                        const value = log.args.value || '0';
                        const contractAddress = log.address || 'Unknown';
                        
                        // Get token data (use normalized address)
                        const normalizedContractAddress = contractAddress.toLowerCase();
                        const token = tokenData[normalizedContractAddress];
                        const isTokenLoading = tokenLoading[normalizedContractAddress];
                        
                        // Format the value - use wei initially, then proper decimals when available
                        let formattedValue;
                        let tokenAmount = 0;
                        
                        if (token && token.decimals !== undefined) {
                          // Use actual token decimals from CoinGecko
                          try {
                            const decimals = token.decimals;
                            const divisor = window.ethers.BigNumber.from(10).pow(decimals);
                            const valueInTokens = window.ethers.BigNumber.from(value).div(divisor);
                            const remainder = window.ethers.BigNumber.from(value).mod(divisor);
                            const decimalPart = remainder.toString().padStart(decimals, '0');
                            formattedValue = `${valueInTokens.toString()}.${decimalPart}`.replace(/\.?0+$/, '');
                            tokenAmount = parseFloat(formattedValue);
                          } catch (err) {
                            // Fallback to wei
                            formattedValue = `${value} wei`;
                            tokenAmount = 0;
                          }
                        } else {
                          // Display in wei until we get token data
                          formattedValue = `${value} wei`;
                          tokenAmount = 0;
                        }

                        // Calculate USD value
                        const usdValue = token?.price ? (tokenAmount * token.price) : 0;

                        // Get checksummed addresses
                        const checksummedFrom = from !== 'Unknown' ? window.ethers.utils.getAddress(from) : from;
                        const checksummedTo = to !== 'Unknown' ? window.ethers.utils.getAddress(to) : to;
                        const checksummedContract = contractAddress !== 'Unknown' ? window.ethers.utils.getAddress(contractAddress) : contractAddress;

                        // Helper function to format address with tooltip and copy
                        const formatAddress = (address, fullAddress) => (
                          <span className="inline-flex items-center space-x-1">
                            <span 
                              className="font-mono text-xs"
                              title={fullAddress}
                            >
                              {address}
                            </span>
                            <button 
                              onClick={() => navigator.clipboard?.writeText(fullAddress)}
                              className="text-gray-400 hover:text-green-500 transition-colors"
                              title="Copy full address"
                            >
                              <i className="fa-regular fa-copy text-xs"></i>
                            </button>
                          </span>
                        );

                        // Token display component
                        const TokenDisplay = () => {
                          if (isTokenLoading) {
                            return (
                              <span className="inline-flex items-center space-x-1">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
                                <span className="font-mono text-xs">Loading...</span>
                              </span>
                            );
                          }
                          
                          if (token) {
                            const tooltipText = `${checksummedContract}${token.chainName ? ` (${token.chainName})` : ''}`;
                            return (
                              <span className="inline-flex items-center space-x-1">
                                {token.image && (
                                  <img 
                                    src={token.image} 
                                    alt={token.name}
                                    className="w-4 h-4 rounded-full"
                                    title={tooltipText}
                                  />
                                )}
                                <span 
                                  className="font-mono text-xs font-semibold text-green-600"
                                  title={`${token.name}${token.chainName ? ` on ${token.chainName}` : ''}`}
                                >
                                  {token.symbol?.toUpperCase()}
                                </span>
                                <button 
                                  onClick={() => navigator.clipboard?.writeText(checksummedContract)}
                                  className="text-gray-400 hover:text-green-500 transition-colors"
                                  title="Copy contract address"
                                >
                                  <i className="fa-regular fa-copy text-xs"></i>
                                </button>
                              </span>
                            );
                          }
                          
                          // Fallback to address display
                          return formatAddress(
                            `${checksummedContract.slice(0, 6)}...${checksummedContract.slice(-4)}`,
                            checksummedContract
                          );
                        };

                        return (
                          <div key={index} className="bg-white border border-green-200 rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-left">
                              <span className="text-gray-700 font-medium">From: </span>
                              {formatAddress(
                                `${checksummedFrom.slice(0, 6)}...${checksummedFrom.slice(-4)}`,
                                checksummedFrom
                              )}
                              <span className="text-gray-700 font-medium"> To: </span>
                              {formatAddress(
                                `${checksummedTo.slice(0, 6)}...${checksummedTo.slice(-4)}`,
                                checksummedTo
                              )}
                              <span className="text-gray-700 font-medium"> For: </span>
                              <span className="font-mono font-semibold text-green-700">{formattedValue}</span>
                              {usdValue > 0 && (
                                <span 
                                  className="text-green-600 font-semibold"
                                  title={`$${token.price?.toFixed(6)} USD per token`}
                                >
                                  {' '}(${usdValue.toFixed(2)})
                                </span>
                              )}
                              <span className="text-gray-700 font-medium"> </span>
                              <TokenDisplay />
                            </div>
                          </div>
                        );
                      })}
                    {decodedLogs.filter(log => log.isDecoded && log.eventName === 'Transfer').length === 0 && (
                      <div className="flex items-center justify-center py-3 text-gray-500">
                        <i className="fas fa-info-circle mr-2"></i>
                        <span className="text-sm">No ERC20 Transfer events found in this transaction</span>
                      </div>
                    )}
                  </div>
                      </div>

                    {/* Token Flow Section */}
                    {structuredTransactionData && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-lg p-6"
                           style={{ backgroundColor: '#EFF6FF' }}>
                    <h2 className="text-2xl font-bold mb-6 text-blue-700 flex items-center">
                      <i className="fas fa-coins mr-2"></i>
                      Token Flow
                    </h2>
                    <div className="mb-6 text-sm text-blue-600">
                      <span className="font-semibold">Transaction Sender:</span> 
                      <span className="font-mono ml-2">{window.ethers.utils.getAddress(structuredTransactionData.from)}</span>
                      <button 
                        onClick={() => navigator.clipboard?.writeText(window.ethers.utils.getAddress(structuredTransactionData.from))}
                        className="text-gray-400 hover:text-blue-500 ml-2 transition-colors"
                        title="Copy address"
                      >
                        <i className="fa-regular fa-copy"></i>
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      {/* Tokens Sent by Transaction Sender */}
                      <div>
                        <h3 className="text-lg font-semibold text-blue-600 mb-4 flex items-center">
                          <i className="fas fa-arrow-up mr-2"></i>
                          Tokens Sent by Sender
                        </h3>
                        <div className="space-y-3">
                          {/* Native Token Sent (if transaction has value) */}
                          {structuredTransactionData && transactionData && transactionData.value && 
                           window.ethers.BigNumber.from(transactionData.value).gt(0) && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-sm">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <i className="fas fa-coins text-yellow-600"></i>
                                  {(() => {
                                    const chainId = structuredTransactionData?.chainId;
                                    const chainData = chainId ? chainsData[chainId] : null;
                                    const nativeTokenAddress = chainData?.nativeTokenAddress;
                                    const nativeTokenData = nativeTokenAddress ? tokenData[nativeTokenAddress.toLowerCase()] : null;
                                    
                                    // Format native token amount with proper decimals
                                    let formattedValue;
                                    let tokenAmount = 0;
                                    
                                    if (nativeTokenData && nativeTokenData.decimals !== undefined) {
                                      try {
                                        const decimals = nativeTokenData.decimals;
                                        const divisor = window.ethers.BigNumber.from(10).pow(decimals);
                                        const valueInTokens = window.ethers.BigNumber.from(transactionData.value).div(divisor);
                                        const remainder = window.ethers.BigNumber.from(transactionData.value).mod(divisor);
                                        const decimalPart = remainder.toString().padStart(decimals, '0');
                                        formattedValue = `${valueInTokens.toString()}.${decimalPart}`.replace(/\.?0+$/, '');
                                        tokenAmount = parseFloat(formattedValue);
                                      } catch (err) {
                                        // Fallback to ether formatting
                                        formattedValue = window.ethers.utils.formatEther(transactionData.value);
                                        tokenAmount = parseFloat(formattedValue);
                                      }
                                    } else {
                                      // Fallback to ether formatting
                                      formattedValue = window.ethers.utils.formatEther(transactionData.value);
                                      tokenAmount = parseFloat(formattedValue);
                                    }
                                    
                                    // Calculate USD value if native token price is available
                                    const usdValue = nativeTokenData?.price ? (tokenAmount * nativeTokenData.price) : null;
                                    
                                    return (
                                      <>
                                        <span className="font-mono text-sm font-semibold text-gray-800">
                                          {formattedValue}
                                        </span>
                                        {usdValue && (
                                          <span className="text-sm font-semibold text-green-600">
                                            (${usdValue.toFixed(4)})
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                                <div className="flex items-center space-x-1">
                                  {(() => {
                                    const chainId = structuredTransactionData?.chainId;
                                    const chainData = chainId ? chainsData[chainId] : null;
                                    const chainName = chainData?.name;
                                    
                                    if (chainName) {
                                      const iconUrl = `https://icons.llamao.fi/icons/chains/rsz_${chainName.toLowerCase().replace(/\s+/g, '-')}?w=16&h=16`;
                                      return (
                                        <div className="flex items-center space-x-1">
                                          <img 
                                            src={iconUrl}
                                            alt={chainName}
                                            className="w-4 h-4 rounded-full"
                                            onError={(e) => {
                                              e.target.style.display = 'none';
                                            }}
                                          />
                                          <span className="text-sm font-semibold text-yellow-600">
                                            {chainData.tokenSymbol || 'NATIVE'} (Native)
                                          </span>
                                        </div>
                                      );
                                    }
                                    return <span className="text-sm font-semibold text-yellow-600">NATIVE</span>;
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* ERC20 Tokens Sent */}
                          {decodedLogs
                            .filter(log => log.isDecoded && log.eventName === 'Transfer' && 
                              window.ethers.utils.getAddress(log.args.from) === window.ethers.utils.getAddress(structuredTransactionData.from))
                            .map((log, index) => {
                              const value = log.args.value || '0';
                              const contractAddress = log.address || 'Unknown';
                              
                              // Get token data (use normalized address)
                              const normalizedContractAddress = contractAddress.toLowerCase();
                              const token = tokenData[normalizedContractAddress];
                              const isTokenLoading = tokenLoading[normalizedContractAddress];
                              
                              // Format the value - use wei initially, then proper decimals when available
                              let formattedValue;
                              let tokenAmount = 0;
                              
                              if (token && token.decimals !== undefined) {
                                // Use actual token decimals from CoinGecko
                                try {
                                  const decimals = token.decimals;
                                  const divisor = window.ethers.BigNumber.from(10).pow(decimals);
                                  const valueInTokens = window.ethers.BigNumber.from(value).div(divisor);
                                  const remainder = window.ethers.BigNumber.from(value).mod(divisor);
                                  const decimalPart = remainder.toString().padStart(decimals, '0');
                                  formattedValue = `${valueInTokens.toString()}.${decimalPart}`.replace(/\.?0+$/, '');
                                  tokenAmount = parseFloat(formattedValue);
                                } catch (err) {
                                  // Fallback to wei
                                  formattedValue = `${value} wei`;
                                  tokenAmount = 0;
                                }
                              } else {
                                // Display in wei until we get token data
                                formattedValue = `${value} wei`;
                                tokenAmount = 0;
                              }

                              // Calculate USD value
                              const usdValue = token?.price ? (tokenAmount * token.price) : 0;

                              // Get checksummed address
                              const checksummedContract = contractAddress !== 'Unknown' ? window.ethers.utils.getAddress(contractAddress) : contractAddress;

                              return (
                                <div key={index} className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <i className="fas fa-arrow-right text-red-500"></i>
                                      <span className="font-mono text-sm font-semibold text-gray-800">{formattedValue}</span>
                                      {usdValue > 0 && (
                                        <span 
                                          className="text-blue-600 font-semibold text-xs"
                                          title={`$${token.price?.toFixed(6)} USD per token`}
                                        >
                                          (${usdValue.toFixed(2)})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      {isTokenLoading ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                      ) : token ? (
                                        <>
                                          {token.image && (
                                            <img 
                                              src={token.image} 
                                              alt={token.name}
                                              className="w-4 h-4 rounded-full"
                                              title={`${checksummedContract}${token.chainName ? ` (${token.chainName})` : ''}`}
                                            />
                                          )}
                                          <span 
                                            className="font-mono text-xs font-semibold text-blue-600"
                                            title={`${token.name}${token.chainName ? ` on ${token.chainName}` : ''}`}
                                          >
                                            {token.symbol?.toUpperCase()}
                                          </span>
                                        </>
                                      ) : (
                                        <span 
                                          className="font-mono text-xs"
                                          title={checksummedContract}
                                        >
                                          {checksummedContract}
                                        </span>
                                      )}
                                      <button 
                                        onClick={() => navigator.clipboard?.writeText(checksummedContract)}
                                        className="text-gray-400 hover:text-blue-500 transition-colors"
                                        title="Copy contract address"
                                      >
                                        <i className="fa-regular fa-copy text-xs"></i>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          {decodedLogs.filter(log => log.isDecoded && log.eventName === 'Transfer' && 
                            window.ethers.utils.getAddress(log.args.from) === window.ethers.utils.getAddress(structuredTransactionData.from)).length === 0 && 
                            !(structuredTransactionData && transactionData && transactionData.value && 
                              window.ethers.BigNumber.from(transactionData.value).gt(0)) && (
                            <div className="flex items-center justify-center py-3 text-gray-500">
                              <i className="fas fa-info-circle mr-2"></i>
                              <span className="text-sm">No tokens sent by transaction sender</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tokens Received by Transaction Sender */}
                      <div>
                        <h3 className="text-lg font-semibold text-blue-600 mb-4 flex items-center">
                          <i className="fas fa-arrow-down mr-2"></i>
                          Tokens Received by Sender
                        </h3>
                        <div className="space-y-3">
                          {decodedLogs
                            .filter(log => log.isDecoded && log.eventName === 'Transfer' && 
                              window.ethers.utils.getAddress(log.args.to) === window.ethers.utils.getAddress(structuredTransactionData.from))
                            .map((log, index) => {
                              const value = log.args.value || '0';
                              const contractAddress = log.address || 'Unknown';
                              
                              // Get token data (use normalized address)
                              const normalizedContractAddress = contractAddress.toLowerCase();
                              const token = tokenData[normalizedContractAddress];
                              const isTokenLoading = tokenLoading[normalizedContractAddress];
                              
                              // Format the value - use wei initially, then proper decimals when available
                              let formattedValue;
                              let tokenAmount = 0;
                              
                              if (token && token.decimals !== undefined) {
                                // Use actual token decimals from CoinGecko
                                try {
                                  const decimals = token.decimals;
                                  const divisor = window.ethers.BigNumber.from(10).pow(decimals);
                                  const valueInTokens = window.ethers.BigNumber.from(value).div(divisor);
                                  const remainder = window.ethers.BigNumber.from(value).mod(divisor);
                                  const decimalPart = remainder.toString().padStart(decimals, '0');
                                  formattedValue = `${valueInTokens.toString()}.${decimalPart}`.replace(/\.?0+$/, '');
                                  tokenAmount = parseFloat(formattedValue);
                                } catch (err) {
                                  // Fallback to wei
                                  formattedValue = `${value} wei`;
                                  tokenAmount = 0;
                                }
                              } else {
                                // Display in wei until we get token data
                                formattedValue = `${value} wei`;
                                tokenAmount = 0;
                              }

                              // Calculate USD value
                              const usdValue = token?.price ? (tokenAmount * token.price) : 0;

                              // Get checksummed address
                              const checksummedContract = contractAddress !== 'Unknown' ? window.ethers.utils.getAddress(contractAddress) : contractAddress;

                              return (
                                <div key={index} className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <i className="fas fa-arrow-left text-green-500"></i>
                                      <span className="font-mono text-sm font-semibold text-gray-800">{formattedValue}</span>
                                      {usdValue > 0 && (
                                        <span 
                                          className="text-blue-600 font-semibold text-xs"
                                          title={`$${token.price?.toFixed(6)} USD per token`}
                                        >
                                          (${usdValue.toFixed(2)})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      {isTokenLoading ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                      ) : token ? (
                                        <>
                                          {token.image && (
                                            <img 
                                              src={token.image} 
                                              alt={token.name}
                                              className="w-4 h-4 rounded-full"
                                              title={`${checksummedContract}${token.chainName ? ` (${token.chainName})` : ''}`}
                                            />
                                          )}
                                          <span 
                                            className="font-mono text-xs font-semibold text-blue-600"
                                            title={`${token.name}${token.chainName ? ` on ${token.chainName}` : ''}`}
                                          >
                                            {token.symbol?.toUpperCase()}
                                          </span>
                                        </>
                                      ) : (
                                        <span 
                                          className="font-mono text-xs"
                                          title={checksummedContract}
                                        >
                                          {checksummedContract}
                                        </span>
                                      )}
                                      <button 
                                        onClick={() => navigator.clipboard?.writeText(checksummedContract)}
                                        className="text-gray-400 hover:text-blue-500 transition-colors"
                                        title="Copy contract address"
                                      >
                                        <i className="fa-regular fa-copy text-xs"></i>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          {decodedLogs.filter(log => log.isDecoded && log.eventName === 'Transfer' && 
                            window.ethers.utils.getAddress(log.args.to) === window.ethers.utils.getAddress(structuredTransactionData.from)).length === 0 && (
                            <div className="flex items-center justify-center py-3 text-gray-500">
                              <i className="fas fa-info-circle mr-2"></i>
                              <span className="text-sm">No tokens received by transaction sender</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* --- Flexible Grid Layout for Raw View --- */}
          <div className="w-full flex flex-col gap-6 mt-6 items-center">
            {/* --- Transaction Viewer Card --- */}
            <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
              <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-200 text-center flex items-center justify-center">
                <i className="fas fa-search mr-3"></i>
                Transaction Viewer
              </h1>
              <div className="mb-4">
                <label htmlFor="rpcUrl" className="block text-sm font-medium mb-1">
                  RPC URL
                </label>
                <input
                  type="text"
                  id="rpcUrl"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  placeholder="e.g., https://mainnet.infura.io/v3/..."
                />
              </div>

              <div className="mb-6">
                <label htmlFor="txHash" className="block text-sm font-medium mb-1">
                  Transaction Hash
                </label>
                <input
                  type="text"
                  id="txHash"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="e.g., 0x..."
                />
              </div>

              <button
                onClick={fetchTransactionData}
                disabled={loading || !isEthersReady}
                className="w-full py-3 px-4 rounded-lg text-white font-semibold transition-all duration-300
                           bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50
                           dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-400/50
                           disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Fetching...' : isEthersReady ? 'Fetch Transaction Data & Receipt' : 'Loading Libraries...'}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-700">
                  <p className="font-semibold">Error:</p>
                  <p>{error}</p>
                </div>
              )}
            </div>

            {/* --- Raw Block Data Section --- */}
            {blockData && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center -m-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Block</h3>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-200 dark:border-gray-700 shadow-inner">
                  <pre className="text-sm">
                    <code>
                      {JSON.stringify(blockData, null, 2)}
                    </code>
                  </pre>
                </div>
              </div>
            )}

            {/* --- Raw Transaction Data Section --- */}
            {transactionData && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center -m-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Message</h3>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-200 dark:border-gray-700 shadow-inner">
                  <pre className="text-sm">
                    <code>
                      {JSON.stringify(transactionData, null, 2)}
                    </code>
                  </pre>
                </div>
              </div>
            )}

            {/* --- Raw Transaction Receipt Section --- */}
            {transactionReceipt && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center -m-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Receipt</h3>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-200 dark:border-gray-700 shadow-inner">
                  <pre className="text-sm">
                    <code>
                      {JSON.stringify(transactionReceipt, null, 2)}
                    </code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* --- View Control Button --- */}
      {(structuredTransactionData || transactionData) && (
        <div className="w-full max-w-2xl mt-6">
          <button
            onClick={() => setShowStructuredView(!showStructuredView)}
            className="w-full py-3 px-4 rounded-lg text-white font-semibold transition-all duration-300
                        bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-500/50
                        dark:bg-gray-500 dark:hover:bg-gray-600 dark:focus:ring-gray-400/50"
          >
            {showStructuredView ? 'Switch to Raw View' : 'Switch to Structured View'}
          </button>
        </div>
      )}
    </div>
  );
}
