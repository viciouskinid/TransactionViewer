import React, { useState, useEffect, useMemo } from 'react';
import { allABIs } from '../abis';
import { chainsData } from '../data/chains.js';
import { useTokenData } from '../hooks/useTokenData';
import { 
  TokenDisplay, 
  TokenValueDisplay,
  CopyAddressButton
} from '../components/TokenComponents';

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
          eventSignature: parsedLog.eventFragment.format(),
          address: log.address,
          logIndex: parseInt(log.logIndex, 16),
          topics: log.topics,
          args: decodedArgs,
          isDecoded: true,
          blockNumber: parseInt(log.blockNumber, 16),
          transactionHash: log.transactionHash,
          transactionIndex: parseInt(log.transactionIndex, 16),
        });
      }
    } catch (err) {
      decodedLogs.push({
        address: log.address,
        logIndex: parseInt(log.logIndex, 16),
        topics: log.topics,
        data: log.data,
        isDecoded: false,
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        transactionIndex: parseInt(log.transactionIndex, 16),
      });
      console.warn("Could not decode log:", log, err);
    }
  });

  return decodedLogs;
};

// Block time estimation component
const BlockTimeEstimation = ({ 
  latestBlock, 
  sampleBlock, 
  estimatedFromBlock, 
  timeRange, 
  isLoading, 
  error 
}) => {
  const avgBlockTime = latestBlock && sampleBlock 
    ? (latestBlock.timestamp - sampleBlock.timestamp) / (latestBlock.number - sampleBlock.number)
    : null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-blue-600 mb-4 flex items-center">
        <i className="fas fa-clock mr-2"></i>
        Block Time Estimation
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">Latest Block:</span>
            <span className="font-mono text-sm">
              {latestBlock ? `#${latestBlock.number}` : 'Loading...'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">Sample Block:</span>
            <span className="font-mono text-sm">
              {sampleBlock ? `#${sampleBlock.number}` : 'Loading...'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">Avg Block Time:</span>
            <span className="font-mono text-sm">
              {avgBlockTime ? `${avgBlockTime.toFixed(2)}s` : 'Calculating...'}
            </span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">Time Range:</span>
            <span className="font-mono text-sm">{timeRange}h</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">Estimated From Block:</span>
            <span className="font-mono text-sm">
              {estimatedFromBlock ? `#${estimatedFromBlock}` : 'Calculating...'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">Block Range:</span>
            <span className="font-mono text-sm">
              {estimatedFromBlock && latestBlock 
                ? `${latestBlock.number - estimatedFromBlock + 1} blocks`
                : 'Calculating...'
              }
            </span>
          </div>
        </div>
      </div>
      
      {isLoading && (
        <div className="mt-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-sm text-blue-600">Estimating block range...</span>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-200">
          <span className="text-sm">{error}</span>
        </div>
      )}
    </div>
  );
};

// Helper to estimate block time
function estimateBlockDate(blockNumber, latestBlock, avgBlockTime) {
  if (!latestBlock || !avgBlockTime) return null;
  const blockDiff = latestBlock.number - blockNumber;
  const estTimestamp = latestBlock.timestamp - blockDiff * avgBlockTime;
  return new Date(estTimestamp * 1000);
}

// Transfer page component
export default function TransferPage() {
  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);

  useEffect(() => {
    let intervalId;
    if (loading) {
      setLoadingSeconds(0);
      intervalId = setInterval(() => {
        setLoadingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setLoadingSeconds(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loading]);
  // Read initial state from URL
  const urlParams = new URLSearchParams(window.location.search);
  const initialAddress = urlParams.get('address') || '0x6753560538ECa67617A9Ce605178F788bE7E524E';
  const initialRpcUrl = urlParams.get('rpc') || 'https://rpc-pulsechain.g4mm4.io';
  const initialTimeRange = parseInt(urlParams.get('range')) || 24;
  // Form state
  const [address, setAddress] = useState(initialAddress);
  const [rpcUrl, setRpcUrl] = useState(initialRpcUrl);
  const [timeRange, setTimeRange] = useState(initialTimeRange);
  // Sync state to URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('address', address);
    urlParams.set('rpc', rpcUrl);
    urlParams.set('range', timeRange);
    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [address, rpcUrl, timeRange]);
  
  const [blockEstimationLoading, setBlockEstimationLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEthersReady, setIsEthersReady] = useState(false);
  
  // Block data
  const [latestBlock, setLatestBlock] = useState(null);
  const [sampleBlock, setSampleBlock] = useState(null);
  const [estimatedFromBlock, setEstimatedFromBlock] = useState(null);
  
  // Transfer data
  const [transferLogs, setTransferLogs] = useState([]);
  const [decodedLogs, setDecodedLogs] = useState([]);
  
  // View state
  const [view, setView] = useState('formatted'); // 'raw', 'structured', 'formatted'

  // Get unique token addresses from decoded logs
  const tokenAddresses = useMemo(() => {
    if (!decodedLogs.length) return [];
    
    const tokenContracts = decodedLogs
      .filter(log => log.isDecoded && log.eventName === 'Transfer')
      .map(log => log.address)
      .filter((addr, index, self) => self.indexOf(addr) === index);

    return tokenContracts;
  }, [decodedLogs]);

  // Use the token data hook
  const { tokenData, tokenLoading } = useTokenData(tokenAddresses, getChainId());

  // Get chain ID helper
  function getChainId() {
    // You can derive this from the RPC URL or have a separate input
    // For now, defaulting to PulseChain
    return '369';
  }

  // Load ethers.js
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
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Estimate block range
  const estimateBlockRange = async () => {
    if (!rpcUrl || !isEthersReady || !timeRange) return;
    
    setBlockEstimationLoading(true);
    setError(null);
    
    try {
      // Get latest block
      const latestBlockResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
          id: 1,
        }),
      });

      const latestBlockData = await latestBlockResponse.json();
      if (!latestBlockData.result) {
        throw new Error('Failed to fetch latest block');
      }

      const latest = {
        number: parseInt(latestBlockData.result.number, 16),
        timestamp: parseInt(latestBlockData.result.timestamp, 16),
      };
      setLatestBlock(latest);

      // Get sample block (1000 blocks back)
      const sampleBlockNumber = latest.number - 1000;
      const sampleBlockResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [`0x${sampleBlockNumber.toString(16)}`, false],
          id: 2,
        }),
      });

      const sampleBlockData = await sampleBlockResponse.json();
      if (!sampleBlockData.result) {
        throw new Error('Failed to fetch sample block');
      }

      const sample = {
        number: parseInt(sampleBlockData.result.number, 16),
        timestamp: parseInt(sampleBlockData.result.timestamp, 16),
      };
      setSampleBlock(sample);

      // Calculate average block time
      const avgBlockTime = (latest.timestamp - sample.timestamp) / (latest.number - sample.number);
      console.log('Average block time:', avgBlockTime, 'seconds');

      // Estimate from block number
      const hoursInSeconds = timeRange * 3600;
      const estimatedBlocksBack = Math.ceil(hoursInSeconds / avgBlockTime);
      const fromBlock = Math.max(0, latest.number - estimatedBlocksBack);
      
      setEstimatedFromBlock(fromBlock);

    } catch (err) {
      console.error('Block estimation error:', err);
      setError(`Failed to estimate block range: ${err.message}`);
    } finally {
      setBlockEstimationLoading(false);
    }
  };

  // Fetch transfer logs
  const fetchTransferLogs = async () => {
    if (!address || !rpcUrl || !isEthersReady || !estimatedFromBlock) {
      setError('Please ensure all fields are filled and block range is estimated');
      return;
    }

    setLoading(true);
    setError(null);
    setTransferLogs([]);
    setDecodedLogs([]);

    try {
      // Normalize address
      const normalizedAddress = window.ethers.utils.getAddress(address);
      const transferTopic = window.ethers.utils.id('Transfer(address,address,uint256)');
      const paddedAddress = window.ethers.utils.hexZeroPad(normalizedAddress, 32);

      // Request logs where address is 'from'
      const fromLogsResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getLogs',
          params: [{
            fromBlock: `0x${estimatedFromBlock.toString(16)}`,
            toBlock: 'latest',
            topics: [transferTopic, paddedAddress]
          }],
          id: 3,
        }),
      });
      const fromLogsData = await fromLogsResponse.json();

      // Request logs where address is 'to'
      const toLogsResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getLogs',
          params: [{
            fromBlock: `0x${estimatedFromBlock.toString(16)}`,
            toBlock: 'latest',
            topics: [transferTopic, null, paddedAddress]
          }],
          id: 4,
        }),
      });
      const toLogsData = await toLogsResponse.json();

      // Merge and deduplicate logs
      const allLogs = [...(fromLogsData.result || []), ...(toLogsData.result || [])];
      const uniqueLogs = Array.from(new Map(allLogs.map(log => [log.transactionHash + log.logIndex, log])).values());
      setTransferLogs(uniqueLogs);

      // Decode the logs
      const decoded = decodeLogsWithABI(uniqueLogs, allABIs);
      setDecodedLogs(decoded);

    } catch (err) {
      console.error('Transfer logs error:', err);
      setError(`Failed to fetch transfer logs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-estimate when inputs change
  useEffect(() => {
    if (rpcUrl && isEthersReady && timeRange) {
      const timeoutId = setTimeout(estimateBlockRange, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [rpcUrl, isEthersReady, timeRange]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-8 flex flex-col items-center justify-center font-sans">
      <div className="w-full flex flex-wrap gap-6 mt-6 justify-center">
        
        {/* Input Card */}
        <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
          <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-200 text-center flex items-center justify-center">
            <i className="fas fa-exchange-alt mr-3"></i>
            Transfer Viewer
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

          <div className="mb-4">
            <label htmlFor="address" className="block text-sm font-medium mb-1">
              Address
            </label>
            <input
              type="text"
              id="address"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g., 0x..."
            />
          </div>

          <div className="mb-6">
            <label htmlFor="timeRange" className="block text-sm font-medium mb-1">
              Time Range (hours)
            </label>
            <input
              type="number"
              id="timeRange"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
              value={timeRange}
              onChange={(e) => setTimeRange(parseInt(e.target.value) || 24)}
              placeholder="24"
              min="1"
              max="168"
            />
          </div>

          <button
            onClick={fetchTransferLogs}
            disabled={loading || !isEthersReady || !estimatedFromBlock}
            className="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center
                       bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50
                       dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-400/50
                       disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Fetching transfer logs... <span className="font-mono ml-1">{loadingSeconds}s</span>
              </>
            ) :
              !isEthersReady ? 'Loading Libraries...' :
              !estimatedFromBlock ? 'Estimating Block Range...' :
              'Fetch Transfer Logs'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-700">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Block Time Estimation Card */}
        <BlockTimeEstimation
          latestBlock={latestBlock}
          sampleBlock={sampleBlock}
          estimatedFromBlock={estimatedFromBlock}
          timeRange={timeRange}
          isLoading={blockEstimationLoading}
          error={error}
        />

        {/* Results */}
        {(!loading && decodedLogs.length === 0) && (
          <div className="w-full flex items-center justify-center mt-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-center">
              <span className="text-lg text-gray-500 dark:text-gray-300"><i className="fas fa-info-circle mr-2"></i>No transfer logs found.</span>
            </div>
          </div>
        )}
        
        {decodedLogs.length > 0 && (
          <div className="w-full">
            {view === 'formatted' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200 flex items-center">
                  <i className="fas fa-table mr-2"></i>
                  Transfer Summary ({decodedLogs.filter(log => log.isDecoded && log.eventName === 'Transfer').length} transfers)
                </h2>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Age / Block / Tx Hash</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Method / From/To</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Amount / Token</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Tx Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Group logs by transactionHash */}
                      {(() => {
                        const logs = decodedLogs.filter(log => log.isDecoded && log.eventName === 'Transfer').sort((a, b) => b.blockNumber - a.blockNumber);
                        const grouped = {};
                        logs.forEach(log => {
                          if (!grouped[log.transactionHash]) grouped[log.transactionHash] = [];
                          grouped[log.transactionHash].push(log);
                        });
                        return Object.entries(grouped).map(([txHash, txLogs], groupIdx) => {
                          // Use first log for shared info
                          const firstLog = txLogs[0];
                          const token = tokenData[firstLog.address.toLowerCase()];
                          const isTokenLoading = tokenLoading[firstLog.address.toLowerCase()];
                          const searchedAddr = address?.toLowerCase();
                          const fromAddr = firstLog.args.from.toLowerCase();
                          const toAddr = firstLog.args.to.toLowerCase();
                          const isOutgoing = fromAddr === searchedAddr;
                          const otherAddr = isOutgoing ? toAddr : fromAddr;
                          const otherLabel = isOutgoing ? 'To:' : 'From:';
                          const methodName = 'Method'; // Placeholder
                          const sign = isOutgoing ? '-' : '+';
                          const avgBlockTime = latestBlock && sampleBlock ? (latestBlock.timestamp - sampleBlock.timestamp) / (latestBlock.number - sampleBlock.number) : null;
                          const estDate = estimateBlockDate(firstLog.blockNumber, latestBlock, avgBlockTime);
                          let ageStr = '';
                          if (estDate) {
                            const now = Date.now();
                            const diffMs = now - estDate.getTime();
                            const diffSec = Math.floor(diffMs / 1000);
                            const diffMin = Math.floor(diffMs / (1000 * 60));
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            const diffYears = Math.floor(diffDays / 365);
                            if (diffSec < 60) {
                              ageStr = `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
                            } else if (diffMin < 60) {
                              ageStr = `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
                            } else if (diffHours < 24) {
                              ageStr = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                            } else if (diffDays < 365) {
                              ageStr = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                            } else {
                              ageStr = `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
                            }
                          }
                          // Filter out zero value logs
                          const nonZeroLogs = txLogs.filter(l => {
                            try {
                              return l.args.value && !/^0x?0*$/i.test(l.args.value) && (parseInt(l.args.value, 16) !== 0);
                            } catch {
                              return false;
                            }
                          });
                          if (nonZeroLogs.length === 0) return null;
                          // Group by token and direction, sum values
                          const tokenGroups = {};
                          nonZeroLogs.forEach(log => {
                            const tokenAddr = log.address.toLowerCase();
                            const fromAddr = log.args.from.toLowerCase();
                            const toAddr = log.args.to.toLowerCase();
                            const isOutgoing = fromAddr === searchedAddr;
                            const key = tokenAddr + (isOutgoing ? '_out' : '_in');
                            if (!tokenGroups[key]) {
                              tokenGroups[key] = {
                                tokenAddr,
                                isOutgoing,
                                logs: [],
                                total: window.ethers ? window.ethers.BigNumber.from(0) : 0
                              };
                            }
                            tokenGroups[key].logs.push(log);
                            // Sum value as BigNumber
                            try {
                              if (window.ethers) {
                                tokenGroups[key].total = tokenGroups[key].total.add(window.ethers.BigNumber.from(log.args.value));
                              }
                            } catch {}
                          });
                          const tokenGroupArr = Object.values(tokenGroups);
                          return tokenGroupArr.map((group, idx) => {
                            const log = group.logs[0];
                            const token = tokenData[group.tokenAddr];
                            const isTokenLoading = tokenLoading[group.tokenAddr];
                            const sign = group.isOutgoing ? '-' : '+';
                            // Only show Age/Block/Tx Hash, Method/From/To, Tx Fee in first row
                            return (
                              <tr key={group.tokenAddr + sign} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                {idx === 0 && (
                                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-mono text-xs" rowSpan={tokenGroupArr.length}>
                                    <div className="text-xs text-gray-500 mb-1" title={estDate ? estDate.toLocaleString() : ''}>{ageStr || 'N/A'}</div>
                                    <div>{log.blockNumber}</div>
                                    <div className="flex items-center space-x-2">
                                      <a 
                                        href={`?tx=${log.transactionHash}`}
                                        className="text-blue-500 hover:text-blue-700 underline"
                                        title={log.transactionHash}
                                      >
                                        {`${log.transactionHash.slice(0, 8)}...`}
                                      </a>
                                      <CopyAddressButton address={log.transactionHash} className="ml-1 text-gray-400 hover:text-green-500 transition-colors" iconClass="fa-regular fa-copy text-xs" />
                                    </div>
                                  </td>
                                )}
                                {idx === 0 && (
                                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-mono text-xs" rowSpan={tokenGroupArr.length}>
                                    <div className="font-bold mb-1">{methodName}</div>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <span>{otherLabel} {`${otherAddr.slice(0, 6)}...${otherAddr.slice(-4)}`}</span>
                                      <CopyAddressButton address={otherAddr} className="ml-1 text-gray-400 hover:text-green-500 transition-colors" iconClass="fa-regular fa-copy text-xs" />
                                    </div>
                                  </td>
                                )}
                                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                                  <div className="flex items-center gap-1" style={{fontSize: '0.85em'}}>
                                    <span className={group.isOutgoing ? 'text-red-600' : 'text-green-600'}>{sign}</span>
                                    <span className={group.isOutgoing ? 'text-red-600' : 'text-green-600'}>
                                      {/* Show summed value in ether */}
                                      <span className="font-mono text-xs">
                                        {window.ethers ? window.ethers.utils.formatUnits(group.total, token?.decimals || 18) : group.total.toString()}
                                      </span>
                                    </span>
                                    <TokenDisplay
                                      token={token}
                                      contractAddress={group.tokenAddr}
                                      isLoading={isTokenLoading}
                                      imageSize="w-4 h-4"
                                      symbolClassName="font-mono text-xs font-semibold"
                                      containerClassName="inline-flex items-center gap-1"
                                      showFallback={true}
                                    />
                                  </div>
                                </td>
                                {idx === 0 && (
                                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs text-gray-400" rowSpan={tokenGroupArr.length}>Tx Fee</td>
                                )}
                              </tr>
                            );
                          });
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'structured' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
                  Structured Transfer Logs ({decodedLogs.length})
                </h2>
                {/* Use similar structure as Event Logs from Transaction page */}
                <div className="space-y-4">
                  {decodedLogs.map((log, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-700 px-3 py-2 flex items-center space-x-2 border-b border-gray-200 dark:border-gray-600">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-indigo-100 bg-indigo-700 rounded-full">
                          {log.logIndex}
                        </span>
                        <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                          {log.isDecoded ? log.eventSignature : "Undecodable Log"}
                        </span>
                        <span className="text-xs text-gray-500">Block: {log.blockNumber}</span>
                      </div>
                      <div className="p-3 text-xs space-y-2 bg-white dark:bg-gray-800">
                        <div className="flex items-start">
                          <span className="font-medium text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">Address:</span>
                          <span className="text-blue-600 dark:text-blue-400 font-mono break-all ml-2">
                            {log.address}
                          </span>
                        </div>
                        {log.isDecoded && (
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
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'raw' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
                  Raw Transfer Logs ({transferLogs.length})
                </h2>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-200 dark:border-gray-700 shadow-inner">
                  <pre className="text-sm">
                    <code>
                      {JSON.stringify(transferLogs, null, 2)}
                    </code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Move view toggle buttons to bottom */}
        {decodedLogs.length > 0 && (
          <div className="flex gap-2 my-4 justify-center">
            <button onClick={() => setView('raw')} className={`px-3 py-1 rounded ${view === 'raw' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>Raw</button>
            <button onClick={() => setView('structured')} className={`px-3 py-1 rounded ${view === 'structured' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>Structured</button>
            <button onClick={() => setView('formatted')} className={`px-3 py-1 rounded ${view === 'formatted' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>Formatted</button>
          </div>
        )}
      </div>
    </div>
  );
}
