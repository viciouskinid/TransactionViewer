import React, { useState, useRef } from 'react';
import { 
  makeMulticall, 
  createERC20BalanceCall, 
  createERC20InfoCalls,
  formatTokenBalance
} from '../utils/blockchainUtils';

const AdvancedTokenBalanceChecker = () => {
  // State for the configuration data
  const [configData, setConfigData] = useState({});
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Editor state
  const [editingConfig, setEditingConfig] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  // File input ref
  const fileInputRef = useRef(null);

  // Initialize with default config
  React.useEffect(() => {
    const loadDefaultConfig = async () => {
      if (Object.keys(configData).length === 0) {
        try {
          // Load default config from public folder
          const response = await fetch('/TransactionViewer/default-config.json');
          if (response.ok) {
            const defaultConfig = await response.json();
            setConfigData(defaultConfig);
            setEditingConfig(JSON.stringify(defaultConfig, null, 2));
            setSuccessMessage('Default configuration loaded successfully');
            console.log('Loaded default config from file');
          } else {
            // Provide fallback configuration when file is not found
            console.warn('Default config file not found, using fallback configuration');
            const fallbackConfig = {
              "https://rpc-pulsechain.g4mm4.io": {
                "0x0000000000000000000000000000000000000000": {
                  "name": "Example Wallet",
                  "tokens": ["0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07"]
                }
              }
            };
            setConfigData(fallbackConfig);
            setEditingConfig(JSON.stringify(fallbackConfig, null, 2));
            setError('Default configuration file not found. Using example configuration. Please upload your own configuration or edit the example below.');
          }
        } catch (error) {
          console.error('Could not load default config file:', error);
          // Provide fallback configuration on any error
          const fallbackConfig = {
            "https://rpc-pulsechain.g4mm4.io": {
              "0x0000000000000000000000000000000000000000": {
                "name": "Example Wallet",
                "tokens": ["0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07"]
              }
            }
          };
          setConfigData(fallbackConfig);
          setEditingConfig(JSON.stringify(fallbackConfig, null, 2));
          setError('Error loading configuration file. Using example configuration. Please upload your own configuration or edit the example below.');
        }
      }
    };
    
    loadDefaultConfig();
  }, [configData]);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        setConfigData(jsonData);
        setEditingConfig(JSON.stringify(jsonData, null, 2));
        setSuccessMessage('Configuration file loaded successfully!');
        setError('');
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        setError('Invalid JSON file. Please check the format.');
        setTimeout(() => setError(''), 5000);
      }
    };
    reader.readAsText(file);
  };

  // Handle file download
  const handleFileDownload = () => {
    const dataStr = JSON.stringify(configData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `token-balance-config-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Handle config edit save
  const handleSaveEdit = () => {
    try {
      const parsedConfig = JSON.parse(editingConfig);
      setConfigData(parsedConfig);
      setIsEditing(false);
      setSuccessMessage('Configuration updated successfully!');
      setError('');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setError('Invalid JSON format. Please check your syntax.');
      setTimeout(() => setError(''), 5000);
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingConfig(JSON.stringify(configData, null, 2));
    setIsEditing(false);
  };

  // Check balances with efficient batching (one multicall per RPC)
  const checkAllBalances = async () => {
    setLoading(true);
    setError('');
    setResults([]);
    
    // Check if ethers.js is available
    if (!window.ethers) {
      setError('Ethers.js library is not loaded. Please refresh the page.');
      setLoading(false);
      setTimeout(() => setError(''), 10000);
      return;
    }
    
    try {
      const allResults = [];
      
      for (const [rpcUrl, eoaData] of Object.entries(configData)) {
        console.log(`Processing RPC: ${rpcUrl}`);
        
        // Build all calls for this RPC
        const allCalls = [];
        const callMetadata = []; // Track what each call is for
        
        // First, get all unique tokens for info calls
        const uniqueTokens = new Set();
        for (const [, eoaInfo] of Object.entries(eoaData)) {
          const tokenAddresses = eoaInfo.tokens || eoaInfo;
          tokenAddresses.forEach(token => uniqueTokens.add(token));
        }
        
        // Add token info calls (name, symbol, decimals for each unique token)
        const tokenInfoMap = {};
        for (const tokenAddress of uniqueTokens) {
          const startIndex = allCalls.length;
          const infoCalls = createERC20InfoCalls(tokenAddress);
          allCalls.push(...infoCalls);
          
          tokenInfoMap[tokenAddress] = {
            nameIndex: startIndex,
            symbolIndex: startIndex + 1,
            decimalsIndex: startIndex + 2
          };
        }
        
        // Add balance calls for each EOA-token combination
        for (const [eoaAddress, eoaInfo] of Object.entries(eoaData)) {
          const eoaName = eoaInfo.name || eoaAddress.slice(0, 10) + '...';
          const tokenAddresses = eoaInfo.tokens || eoaInfo;
          
          for (const tokenAddress of tokenAddresses) {
            const balanceCall = createERC20BalanceCall(tokenAddress, eoaAddress);
            allCalls.push(balanceCall);
            
            callMetadata.push({
              type: 'balance',
              eoaAddress,
              eoaName,
              tokenAddress,
              callIndex: allCalls.length - 1
            });
          }
        }
        
        console.log(`Making single multicall with ${allCalls.length} calls for ${rpcUrl}`);
        
        // Make single multicall for all data
        const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11';
        const multicallResults = await makeMulticall(rpcUrl, multicallAddress, allCalls);
        
        if (!multicallResults || !multicallResults.results) {
          console.error('Multicall failed for RPC:', rpcUrl);
          continue;
        }
        
        console.log(`Received ${multicallResults.results.length} results from multicall`);
        
        // Extract token info from results
        const tokenInfoCache = {};
        for (const [tokenAddress, indices] of Object.entries(tokenInfoMap)) {
          const nameResult = multicallResults.results[indices.nameIndex];
          const symbolResult = multicallResults.results[indices.symbolIndex];
          const decimalsResult = multicallResults.results[indices.decimalsIndex];
          
          const extractValue = (result) => {
            if (!result || !result.success) return null;
            let value = result.result;
            if (Array.isArray(value) && value.length > 0) {
              value = value[0];
            }
            if (typeof value === 'string' && value.startsWith('0x')) {
              try {
                value = window.ethers.utils.parseBytes32String(value);
              } catch {
                try {
                  value = window.ethers.utils.toUtf8String(value);
                } catch {
                  // Keep original value if conversion fails
                }
              }
            }
            return value;
          };
          
          const name = extractValue(nameResult) || 'Unknown';
          const symbol = extractValue(symbolResult) || 'UNK';
          const decimalsValue = extractValue(decimalsResult);
          const decimals = decimalsValue ? parseInt(decimalsValue) || 18 : 18;
          
          tokenInfoCache[tokenAddress] = { name, symbol, decimals };
        }
        
        // Process balance results
        for (const metadata of callMetadata) {
          const balanceResult = multicallResults.results[metadata.callIndex];
          const tokenInfo = tokenInfoCache[metadata.tokenAddress] || {
            name: 'Unknown Token',
            symbol: 'UNK',
            decimals: 18
          };
          
          let balance = '0';
          let formattedBalance = '0';
          let status = 'error';
          let errorMessage = '';
          
          if (balanceResult && balanceResult.success) {
            try {
              let rawBalance = balanceResult.result;
              
              // Handle array format returned by multicall
              if (Array.isArray(rawBalance) && rawBalance.length > 0) {
                balance = String(rawBalance[0]);
              } else if (typeof rawBalance === 'string') {
                balance = rawBalance;
              } else {
                balance = String(rawBalance);
              }
              
              formattedBalance = formatTokenBalance(balance, tokenInfo.decimals);
              status = 'success';
            } catch (error) {
              console.error('Error processing balance:', error);
              errorMessage = error.message;
            }
          } else {
            errorMessage = 'Balance call failed';
          }
          
          allResults.push({
            rpcUrl,
            eoaAddress: metadata.eoaAddress,
            eoaName: metadata.eoaName,
            tokenAddress: metadata.tokenAddress,
            tokenName: tokenInfo.name,
            tokenSymbol: tokenInfo.symbol,
            tokenDecimals: tokenInfo.decimals,
            balance: String(balance),
            formattedBalance: String(formattedBalance),
            status,
            error: errorMessage
          });
        }
      }
      
      setResults(allResults);
      setSuccessMessage(`Successfully checked ${allResults.length} token balances with optimized batching!`);
      setTimeout(() => setSuccessMessage(''), 5000);
      
    } catch (error) {
      setError(`Error checking balances: ${error.message}`);
      setTimeout(() => setError(''), 10000);
    } finally {
      setLoading(false);
    }
  };

  // Export results as CSV
  const exportResultsAsCSV = () => {
    if (results.length === 0) return;
    
    const headers = ['RPC URL', 'EOA Name', 'EOA Address', 'Token Address', 'Token Name', 'Token Symbol', 'Balance', 'Formatted Balance', 'Status'];
    const csvContent = [
      headers.join(','),
      ...results.map(result => [
        `"${result.rpcUrl}"`,
        `"${result.eoaName}"`,
        `"${result.eoaAddress}"`,
        `"${result.tokenAddress}"`,
        `"${result.tokenName}"`,
        `"${result.tokenSymbol}"`,
        `"${result.balance}"`,
        `"${result.formattedBalance}"`,
        `"${result.status}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `token-balances-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <h1 className="text-2xl font-bold text-white flex items-center">
              <i className="fas fa-coins mr-3"></i>
              Advanced Token Balance Checker
            </h1>
            <p className="text-blue-100 mt-2">Upload, edit, and manage token balance configurations via JSON</p>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4">
              <div className="flex">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 m-4">
              <div className="flex">
                <i className="fas fa-check-circle mr-2"></i>
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          <div className="p-6">
            {/* File Management Section */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <i className="fas fa-file-import mr-2"></i>
                Configuration Management
              </h2>
              
              <div className="flex flex-wrap gap-4 mb-6">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
                >
                  <i className="fas fa-upload mr-2"></i>
                  Upload JSON Config
                </button>
                
                <button
                  onClick={handleFileDownload}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center"
                >
                  <i className="fas fa-download mr-2"></i>
                  Download Config
                </button>
                
                <button
                  onClick={() => {
                    setIsEditing(!isEditing);
                    if (!isEditing) {
                      setEditingConfig(JSON.stringify(configData, null, 2));
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 flex items-center"
                >
                  <i className={`fas ${isEditing ? 'fa-eye' : 'fa-edit'} mr-2`}></i>
                  {isEditing ? 'View Mode' : 'Edit Config'}
                </button>
              </div>
            </div>

            {/* Configuration Editor/Viewer */}
            {isEditing ? (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Configuration</h3>
                <div className="border rounded-lg overflow-hidden">
                  <textarea
                    value={editingConfig}
                    onChange={(e) => setEditingConfig(e.target.value)}
                    className="w-full h-96 p-4 font-mono text-sm border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your JSON configuration here..."
                  />
                </div>
                <div className="flex gap-4 mt-4">
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-save mr-2"></i>
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-times mr-2"></i>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Current Configuration</h3>
                <div className="bg-gray-50 border rounded-lg p-4 overflow-auto max-h-96">
                  <pre className="text-sm font-mono text-gray-700">
                    {JSON.stringify(configData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Configuration Format Help */}
            <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">Configuration Format</h3>
              <p className="text-blue-700 mb-2">The JSON should follow this structure:</p>
              <pre className="text-sm font-mono bg-white p-3 rounded border text-gray-700 mb-3">
{`{
  "RPC_URL_1": {
    "EOA_ADDRESS_1": {
      "name": "Wallet Name 1",
      "tokens": ["TOKEN_ADDRESS_1", "TOKEN_ADDRESS_2"]
    },
    "EOA_ADDRESS_2": {
      "name": "Wallet Name 2", 
      "tokens": ["TOKEN_ADDRESS_3"]
    }
  },
  "RPC_URL_2": {
    "EOA_ADDRESS_3": {
      "name": "Wallet Name 3",
      "tokens": ["TOKEN_ADDRESS_4", "TOKEN_ADDRESS_5"]
    }
  }
}`}
              </pre>
              <div className="text-sm text-blue-600">
                <p className="font-medium mb-1">Reliable RPC Endpoints:</p>
                <p><strong>PulseChain:</strong> https://rpc-pulsechain.g4mm4.io, https://rpc.pulsechain.com</p>
                <p><strong>Polygon:</strong> https://polygon-rpc.com, https://rpc.ankr.com/polygon</p>
              </div>
            </div>

            {/* Balance Check Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  <i className="fas fa-search mr-2"></i>
                  Balance Check
                </h2>
                {results.length > 0 && (
                  <button
                    onClick={exportResultsAsCSV}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-file-csv mr-2"></i>
                    Export CSV
                  </button>
                )}
              </div>
              
              <button
                onClick={checkAllBalances}
                disabled={loading || Object.keys(configData).length === 0}
                className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center ${
                  loading || Object.keys(configData).length === 0
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Checking Balances...
                  </>
                ) : (
                  <>
                    <i className="fas fa-play mr-2"></i>
                    Check All Balances
                  </>
                )}
              </button>
            </div>

            {/* Results Section */}
            {results.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <i className="fas fa-table mr-2"></i>
                  Results ({results.length} total)
                </h2>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RPC</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EOA Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EOA Address</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {results.map((result, index) => (
                        <tr key={index} className={result.status === 'error' ? 'bg-red-50' : 'bg-white'}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="max-w-32 truncate" title={result.rpcUrl}>
                              {result.rpcUrl}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {result.eoaName}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900">
                            <div className="max-w-32 truncate" title={result.eoaAddress}>
                              {result.eoaAddress}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <div className="font-medium">{result.tokenSymbol}</div>
                              <div className="text-xs text-gray-500 max-w-32 truncate" title={result.tokenAddress}>
                                {result.tokenAddress}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="font-medium">{String(result.formattedBalance || '0')}</div>
                            {result.balance !== '0' && (
                              <div className="text-xs text-gray-500">Raw: {String(result.balance)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {result.status === 'success' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <i className="fas fa-check mr-1"></i>
                                Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800" title={result.error}>
                                <i className="fas fa-times mr-1"></i>
                                Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedTokenBalanceChecker;
