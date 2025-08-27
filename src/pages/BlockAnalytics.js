import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { chainsData } from '../data/chains';

// Convert chains object to array for dropdown
const chainsArray = Object.entries(chainsData).map(([chainId, chainInfo]) => ({
  id: chainId,
  name: chainInfo.name,
  rpc: [`https://rpc-${chainInfo.name.toLowerCase().replace(/\s+/g, '')}.io`] // Default RPC pattern
}));

// Add known RPC URLs for major chains
const knownRPCs = {
  '1': ['https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth', 'https://eth.llamarpc.com'],
  '56': ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
  '137': ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'],
  '369': ['https://rpc-pulsechain.g4mm4.io', 'https://rpc.pulsechain.com'],
  '8453': ['https://mainnet.base.org', 'https://rpc.ankr.com/base'],
  '42161': ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
  '10': ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
  '43114': ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'],
  '250': ['https://rpc.ftm.tools', 'https://rpc.ankr.com/fantom'],
  '100': ['https://rpc.gnosischain.com', 'https://rpc.ankr.com/gnosis'],
  '1284': ['https://rpc.api.moonbeam.network', 'https://moonbeam.public.blastapi.io'],
  '1313161554': ['https://mainnet.aurora.dev', 'https://aurora.drpc.org'],
  '42220': ['https://forno.celo.org', 'https://rpc.ankr.com/celo'],
  '5000': ['https://rpc.mantle.xyz', 'https://mantle.publicnode.com'],
  '252': ['https://rpc.frax.com', 'https://fraxtal.drpc.org'],
  '146': ['https://rpc.sonic.org', 'https://sonic.drpc.org'],
  '1666600000': ['https://api.harmony.one', 'https://harmony.publicnode.com']
};

// Update chains array with known RPCs
chainsArray.forEach(chain => {
  if (knownRPCs[chain.id]) {
    chain.rpc = knownRPCs[chain.id];
  }
});

export default function BlockAnalyticsPage() {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const chainParam = urlParams.get('chain') || '369'; // Default to PulseChain
  const rpcParam = urlParams.get('rpc');
  const fromParam = urlParams.get('from');
  const toParam = urlParams.get('to');

  const [selectedChain, setSelectedChain] = useState(chainParam);
  const [rpcUrl, setRpcUrl] = useState(rpcParam || 'https://rpc-pulsechain.g4mm4.io');
  const [fromBlock, setFromBlock] = useState(fromParam || '');
  const [toBlock, setToBlock] = useState(toParam || 'latest');
  const [blockData, setBlockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const [latestBlockNumber, setLatestBlockNumber] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [useDateTime, setUseDateTime] = useState(false);

  // Update RPC URL when chain changes
  const handleChainChange = (chainId) => {
    setSelectedChain(chainId);
    const chain = chainsArray.find(c => c.id === chainId);
    if (chain && chain.rpc && chain.rpc.length > 0) {
      setRpcUrl(chain.rpc[0]);
    }
    // Update URL parameters
    updateUrlParams({ chain: chainId });
  };

  // Update URL parameters
  const updateUrlParams = (params) => {
    const urlParams = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        urlParams.set(key, value);
      } else {
        urlParams.delete(key);
      }
    });
    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
  };

  // Initialize RPC URL based on selected chain if not provided in URL
  React.useEffect(() => {
    if (!rpcParam) {
      const chain = chainsArray.find(c => c.id === selectedChain);
      if (chain && chain.rpc && chain.rpc.length > 0) {
        setRpcUrl(chain.rpc[0]);
      }
    }
  }, [selectedChain, rpcParam]);

  // Get latest block number
  const getLatestBlockNumber = async () => {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }
      return hexToDecimal(data.result);
    } catch (error) {
      console.error('Error fetching latest block:', error);
      return null;
    }
  };

  // Initialize default values on page load
  React.useEffect(() => {
    const initializeDefaults = async () => {
      if (initialLoad && (!fromParam || !toParam)) {
        setLoading(true);
        try {
          const latest = await getLatestBlockNumber();
          if (latest) {
            setLatestBlockNumber(latest);
            if (!fromParam) {
              const fromBlockNumber = Math.max(0, latest - 100);
              setFromBlock(fromBlockNumber.toString());
            }
            if (!toParam) {
              setToBlock('latest');
            }
          }
        } catch (error) {
          setError('Failed to fetch latest block information');
        } finally {
          setLoading(false);
          setInitialLoad(false);
        }
      } else {
        setInitialLoad(false);
      }
    };

    if (rpcUrl) {
      initializeDefaults();
    }
  }, [rpcUrl, initialLoad, fromParam, toParam]);

  // Format numbers for display
  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getXAxisValue = (block) => {
    return useDateTime ? formatDateTime(block.timestamp) : block.blockNumber;
  };

  const getXAxisDataKey = () => {
    return useDateTime ? 'formattedTime' : 'blockNumber';
  };

  // Format hex to decimal
  const hexToDecimal = (hex) => {
    return parseInt(hex, 16);
  };

  // Format gas price from wei to gwei
  const weiToGwei = (wei) => {
    return (parseInt(wei, 16) / 1e9).toFixed(2);
  };

  // Calculate block utilization percentage
  const calculateUtilization = (gasUsed, gasLimit) => {
    const used = parseInt(gasUsed, 16);
    const limit = parseInt(gasLimit, 16);
    return ((used / limit) * 100).toFixed(2);
  };

  // Fetch only new blocks and append to existing data
  const fetchNewBlocks = async (startBlock, endBlock) => {
    if (startBlock > endBlock) return;
    
    try {
      const blockRequests = [];
      for (let i = startBlock; i <= endBlock; i++) {
        blockRequests.push(
          fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              params: [`0x${i.toString(16)}`, false],
              id: i
            })
          }).then(res => res.json())
        );
      }
      
      const responses = await Promise.all(blockRequests);
      const newBlocks = responses
        .filter(res => res.result && res.result.number)
        .map(res => {
          const block = res.result;
          const timestamp = parseInt(block.timestamp, 16);
          return {
            blockNumber: parseInt(block.number, 16),
            timestamp: timestamp,
            formattedTime: formatDateTime(timestamp),
            gasUsed: parseInt(block.gasUsed, 16),
            gasLimit: parseInt(block.gasLimit, 16),
            baseFeePerGas: block.baseFeePerGas ? parseInt(block.baseFeePerGas, 16) / 1e9 : 0,
            utilization: parseFloat(calculateUtilization(block.gasUsed, block.gasLimit))
          };
        })
        .sort((a, b) => a.blockNumber - b.blockNumber);

      if (newBlocks.length > 0) {
        // Append new blocks to existing data
        setBlockData(prevData => [...prevData, ...newBlocks]);
        setLatestBlockNumber(Math.max(...newBlocks.map(b => b.blockNumber)));
      }
    } catch (err) {
      console.error('Error fetching new blocks:', err);
    }
  };

  // Auto-polling for latest blocks
  React.useEffect(() => {
    let intervalId;
    
    if (isPolling && toBlock === 'latest' && blockData.length > 0) {
      intervalId = setInterval(async () => {
        const latest = await getLatestBlockNumber();
        const lastBlockInData = blockData.length > 0 ? Math.max(...blockData.map(b => b.blockNumber)) : 0;
        
        if (latest && latest > lastBlockInData) {
          // Fetch only new blocks that we don't have yet
          await fetchNewBlocks(lastBlockInData + 1, latest);
        }
      }, 15000); // Poll every 15 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, toBlock, blockData.length]);

  // Batch fetch block data
  const fetchBatchBlockData = async () => {
    if (!fromBlock || !toBlock) {
      setError('Please enter both from and to block numbers');
      return;
    }

    let from = parseInt(fromBlock);
    let to;
    
    // Handle "latest" keyword
    if (toBlock.toLowerCase() === 'latest') {
      const latest = await getLatestBlockNumber();
      if (!latest) {
        setError('Failed to fetch latest block number');
        return;
      }
      to = latest;
      setLatestBlockNumber(latest);
    } else {
      to = parseInt(toBlock);
    }

    if (isNaN(from) || (toBlock.toLowerCase() !== 'latest' && isNaN(to))) {
      setError('Please enter valid block numbers');
      return;
    }

    if (from >= to) {
      setError('From block must be less than to block');
      return;
    }

    if (to - from > 1000) {
      setError('Range too large. Please limit to 1000 blocks maximum');
      return;
    }

    setLoading(true);
    setError('');
    setBlockData([]);

    try {
      // Create batch request
      const batchRequest = [];
      for (let i = from; i <= to; i++) {
        batchRequest.push({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [`0x${i.toString(16)}`, false],
          id: i,
        });
      }

      // Split into smaller batches to avoid overwhelming the RPC
      const batchSize = 50;
      const results = [];
      
      for (let i = 0; i < batchRequest.length; i += batchSize) {
        const batch = batchRequest.slice(i, i + batchSize);
        
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        const batchResults = await response.json();
        results.push(...batchResults);
        
        // Add small delay between batches to be nice to the RPC
        if (i + batchSize < batchRequest.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Process results
      const processedData = results
        .filter(result => result.result && !result.error)
        .map(result => {
          const block = result.result;
          const blockNumber = hexToDecimal(block.number);
          const gasUsed = hexToDecimal(block.gasUsed);
          const gasLimit = hexToDecimal(block.gasLimit);
          const utilization = parseFloat(calculateUtilization(block.gasUsed, block.gasLimit));
          const baseFeePerGas = block.baseFeePerGas ? parseFloat(weiToGwei(block.baseFeePerGas)) : 0;
          const timestamp = hexToDecimal(block.timestamp);

          return {
            blockNumber,
            gasUsed,
            gasLimit,
            utilization,
            baseFeePerGas,
            timestamp,
            formattedTime: formatDateTime(timestamp),
            transactionCount: block.transactions.length,
            size: hexToDecimal(block.size || '0x0'),
          };
        })
        .sort((a, b) => a.blockNumber - b.blockNumber);

      // Calculate block times (time between consecutive blocks)
      for (let i = 1; i < processedData.length; i++) {
        processedData[i].blockTime = processedData[i].timestamp - processedData[i - 1].timestamp;
      }
      // First block doesn't have a previous block, so we'll estimate
      if (processedData.length > 1) {
        processedData[0].blockTime = processedData[1].blockTime || 12; // Default to 12 seconds
      }

      setBlockData(processedData);
      
      // Update URL parameters
      updateUrlParams({
        chain: selectedChain,
        rpc: rpcUrl,
        from: fromBlock,
        to: toBlock
      });

      // Enable polling if using "latest"
      if (toBlock.toLowerCase() === 'latest') {
        setIsPolling(true);
      } else {
        setIsPolling(false);
      }
    } catch (err) {
      setError(`Error fetching block data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-semibold">
            {useDateTime ? `Time: ${label}` : `Block: ${label}`}
          </p>
          {!useDateTime && (
            <p className="text-sm text-gray-600">
              {`Time: ${formatDateTime(data.timestamp)}`}
            </p>
          )}
          {useDateTime && (
            <p className="text-sm text-gray-600">
              {`Block: ${data.blockNumber}`}
            </p>
          )}
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${entry.value}${
                entry.dataKey === 'utilization' ? '%' : 
                entry.dataKey === 'baseFeePerGas' ? ' Gwei' : 
                entry.dataKey === 'blockTime' ? ' sec' : ''
              }`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          <i className="fas fa-chart-line mr-3"></i>
          Block Analytics
        </h1>
        
        {/* Network Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            <i className="fas fa-network-wired mr-2"></i>
            Network Configuration
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Blockchain Network
              </label>
              <select
                value={selectedChain}
                onChange={(e) => handleChainChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {chainsArray.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                RPC URL
              </label>
              <input
                type="text"
                value={rpcUrl}
                onChange={(e) => {
                  setRpcUrl(e.target.value);
                  updateUrlParams({ rpc: e.target.value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter RPC URL"
              />
            </div>
          </div>
        </div>
        
        {/* Block Range Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            <i className="fas fa-cubes mr-2"></i>
            Block Range Configuration
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Block
              </label>
              <input
                type="number"
                value={fromBlock}
                onChange={(e) => {
                  setFromBlock(e.target.value);
                  updateUrlParams({ from: e.target.value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="24265653"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Block
              </label>
              <input
                type="text"
                value={toBlock}
                onChange={(e) => {
                  setToBlock(e.target.value);
                  updateUrlParams({ to: e.target.value });
                  // Stop polling if changing away from "latest"
                  if (e.target.value.toLowerCase() !== 'latest') {
                    setIsPolling(false);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="24265753 or 'latest'"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use "latest" for real-time updates
              </p>
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchBatchBlockData}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Fetching...
                  </>
                ) : (
                  <>
                    <i className="fas fa-search mr-2"></i>
                    Analyze Blocks
                  </>
                )}
              </button>
              
              {/* X-Axis Toggle Button */}
              {blockData.length > 0 && (
                <button
                  onClick={() => setUseDateTime(!useDateTime)}
                  className="ml-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center"
                  title={`Switch to ${useDateTime ? 'Block Numbers' : 'DateTime'}`}
                >
                  <i className={`fas ${useDateTime ? 'fa-hashtag' : 'fa-clock'} mr-2`}></i>
                  {useDateTime ? 'Block' : 'Time'}
                </button>
              )}
            </div>
          </div>
          
          {/* Polling Status */}
          {isPolling && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center">
                <i className="fas fa-sync-alt fa-spin text-green-600 mr-2"></i>
                <span className="text-sm text-green-800">
                  Auto-polling enabled - Checking for new blocks every 15 seconds
                  {latestBlockNumber && (
                    <span className="ml-2 font-medium">
                      (Latest: {formatNumber(latestBlockNumber)})
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setIsPolling(false)}
                  className="ml-auto text-green-600 hover:text-green-800"
                  title="Stop auto-polling"
                >
                  <i className="fas fa-stop"></i>
                </button>
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              {error}
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 text-center">
            <div className="animate-spin text-4xl text-blue-500 mb-4">
              <i className="fas fa-spinner"></i>
            </div>
            <p className="text-gray-600">Fetching block data...</p>
          </div>
        )}

        {/* Charts */}
        {blockData.length > 0 && (
          <div className="space-y-6">
            {/* Block Utilization Chart */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                <i className="fas fa-chart-area mr-2"></i>
                Block Utilization (%)
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={blockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={getXAxisDataKey()} 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    domain={[0, 100]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="utilization" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Utilization %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Base Fee Per Gas Chart */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                <i className="fas fa-gas-pump mr-2"></i>
                Base Fee Per Gas (Gwei)
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={blockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={getXAxisDataKey()} 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="baseFeePerGas" 
                    stroke="#dc2626" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Base Fee (Gwei)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Transaction Count Chart */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                <i className="fas fa-file-invoice mr-2"></i>
                Transaction Count per Block
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={blockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={getXAxisDataKey()} 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar 
                    dataKey="transactionCount" 
                    fill="#059669"
                    name="Transaction Count"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Block Time Chart */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                <i className="fas fa-clock mr-2"></i>
                Block Time (seconds)
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={blockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={getXAxisDataKey()} 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="blockTime" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Block Time (sec)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Summary Statistics */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                <i className="fas fa-chart-pie mr-2"></i>
                Summary Statistics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-800 mb-1">Avg Utilization</h3>
                  <p className="text-2xl font-bold text-blue-900">
                    {(blockData.reduce((sum, block) => sum + block.utilization, 0) / blockData.length).toFixed(2)}%
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-red-800 mb-1">Avg Base Fee</h3>
                  <p className="text-2xl font-bold text-red-900">
                    {(blockData.reduce((sum, block) => sum + block.baseFeePerGas, 0) / blockData.length).toFixed(2)} Gwei
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-green-800 mb-1">Total Transactions</h3>
                  <p className="text-2xl font-bold text-green-900">
                    {formatNumber(blockData.reduce((sum, block) => sum + block.transactionCount, 0))}
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-orange-800 mb-1">Avg Block Time</h3>
                  <p className="text-2xl font-bold text-orange-900">
                    {blockData.length > 0 ? 
                      (blockData.reduce((sum, block) => sum + (block.blockTime || 0), 0) / blockData.length).toFixed(1) 
                      : '0'} sec
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-purple-800 mb-1">Blocks Analyzed</h3>
                  <p className="text-2xl font-bold text-purple-900">
                    {formatNumber(blockData.length)}
                  </p>
                </div>
              </div>
              {isPolling && toBlock === 'latest' && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center">
                    <div className="animate-pulse w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-sm text-green-700">
                      Auto-updating with new blocks (checking every 15s)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
