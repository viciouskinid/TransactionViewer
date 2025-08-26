import React, { useState, useEffect } from 'react';
import { chainsData } from '../data/chains';
import { 
  makeSingleCall, 
  makeMulticall, 
  createERC20BalanceCall, 
  createERC20InfoCalls,
  formatTokenBalance,
  standardAbis,
  DEFAULT_MULTICALL3_ADDRESS 
} from '../utils/blockchainUtils';

// Convert chains object to array for dropdown
const chainsArray = Object.entries(chainsData).map(([chainId, chainInfo]) => ({
  id: chainId,
  name: chainInfo.name,
  rpc: [`https://rpc-${chainInfo.name.toLowerCase().replace(/\s+/g, '')}.io`] // Default RPC pattern
}));

// Add known RPC URLs for major chains
const knownRPCs = {
  '1': ['https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth'],
  '56': ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
  '137': ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'],
  '369': ['https://rpc-pulsechain.g4mm4.io', 'https://rpc.pulsechain.com'],
  '8453': ['https://mainnet.base.org', 'https://rpc.ankr.com/base'],
  '42161': ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
  '10': ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
  '43114': ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'],
  '250': ['https://rpc.ftm.tools', 'https://rpc.ankr.com/fantom'],
  '100': ['https://rpc.gnosischain.com', 'https://rpc.ankr.com/gnosis']
};

// Update chains array with known RPCs
chainsArray.forEach(chain => {
  if (knownRPCs[chain.id]) {
    chain.rpc = knownRPCs[chain.id];
  }
});

const TokenBalanceChecker = () => {
  // State management
  const [selectedChain, setSelectedChain] = useState('369'); // Default to PulseChain
  const [rpcUrl, setRpcUrl] = useState('https://rpc-pulsechain.g4mm4.io');
  const [multicallAddress, setMulticallAddress] = useState(DEFAULT_MULTICALL3_ADDRESS);
  
  // Token management by chain
  const [tokensByChain, setTokensByChain] = useState({});
  const [newTokenAddress, setNewTokenAddress] = useState('');
  
  // EOA addresses management
  const [eoaAddresses, setEoaAddresses] = useState([]);
  const [newEoaAddress, setNewEoaAddress] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [balanceResults, setBalanceResults] = useState([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('tokens');

  // Load saved data from localStorage
  useEffect(() => {
    const savedTokensByChain = localStorage.getItem('tokenBalanceChecker_tokensByChain');
    if (savedTokensByChain) {
      try {
        setTokensByChain(JSON.parse(savedTokensByChain));
      } catch (error) {
        console.error('Error loading saved tokens by chain:', error);
      }
    }

    const savedEoaAddresses = localStorage.getItem('tokenBalanceChecker_eoaAddresses');
    if (savedEoaAddresses) {
      try {
        setEoaAddresses(JSON.parse(savedEoaAddresses));
      } catch (error) {
        console.error('Error loading saved EOA addresses:', error);
      }
    }
  }, []);

  // Save data to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('tokenBalanceChecker_tokensByChain', JSON.stringify(tokensByChain));
  }, [tokensByChain]);

  useEffect(() => {
    localStorage.setItem('tokenBalanceChecker_eoaAddresses', JSON.stringify(eoaAddresses));
  }, [eoaAddresses]);

  // Update RPC URL when chain changes
  useEffect(() => {
    const chain = chainsArray.find(c => c.id === selectedChain);
    if (chain && chain.rpc && chain.rpc.length > 0) {
      setRpcUrl(chain.rpc[0]);
    }
  }, [selectedChain]);

  // Helper functions
  const getCurrentChainTokens = () => {
    return tokensByChain[selectedChain] || [];
  };

  const getTokensForChain = (chainId) => {
    return tokensByChain[chainId] || [];
  };

  const addTokenToChain = (chainId, token) => {
    setTokensByChain(prev => ({
      ...prev,
      [chainId]: [...(prev[chainId] || []), token]
    }));
  };

  const removeTokenFromChain = (chainId, tokenId) => {
    setTokensByChain(prev => ({
      ...prev,
      [chainId]: (prev[chainId] || []).filter(token => token.id !== tokenId)
    }));
  };

  const addEoaAddress = (address) => {
    const newEoa = {
      id: Date.now(),
      address: address.trim(),
      label: `EOA ${eoaAddresses.length + 1}`
    };
    setEoaAddresses(prev => [...prev, newEoa]);
  };

  const removeEoaAddress = (eoaId) => {
    setEoaAddresses(prev => prev.filter(eoa => eoa.id !== eoaId));
  };

  const updateEoaLabel = (eoaId, newLabel) => {
    setEoaAddresses(prev => prev.map(eoa => 
      eoa.id === eoaId ? { ...eoa, label: newLabel } : eoa
    ));
  };

  // Add a new token to current chain
  const addToken = async () => {
    if (!newTokenAddress.trim()) {
      setError('Please enter a token address');
      return;
    }

    const currentTokens = getCurrentChainTokens();
    if (currentTokens.some(token => token.address.toLowerCase() === newTokenAddress.toLowerCase())) {
      setError('Token already exists in the list for this chain');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get token info (name, symbol, decimals)
      const infoCalls = createERC20InfoCalls(newTokenAddress);
      const infoResult = await makeMulticall(rpcUrl, multicallAddress, infoCalls);

      let name = 'Unknown';
      let symbol = 'UNK';
      let decimals = 18;

      if (infoResult.success && infoResult.results.length >= 3) {
        // Parse results
        const nameResult = infoResult.results[0];
        const symbolResult = infoResult.results[1];
        const decimalsResult = infoResult.results[2];

        if (nameResult.success) {
          try {
            // Handle both array and string results
            const nameData = JSON.parse(nameResult.result);
            name = Array.isArray(nameData) ? nameData[0] : nameData;
          } catch {
            name = nameResult.result;
          }
        }

        if (symbolResult.success) {
          try {
            const symbolData = JSON.parse(symbolResult.result);
            symbol = Array.isArray(symbolData) ? symbolData[0] : symbolData;
          } catch {
            symbol = symbolResult.result;
          }
        }

        if (decimalsResult.success) {
          try {
            const decimalsData = JSON.parse(decimalsResult.result);
            decimals = Array.isArray(decimalsData) ? parseInt(decimalsData[0]) : parseInt(decimalsData);
          } catch {
            decimals = parseInt(decimalsResult.result) || 18;
          }
        }
      }

      const newToken = {
        id: Date.now(),
        address: newTokenAddress,
        name,
        symbol,
        decimals,
        chainId: selectedChain
      };

      addTokenToChain(selectedChain, newToken);
      setNewTokenAddress('');

    } catch (error) {
      setError(`Error adding token: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Remove a token from current chain
  const removeToken = (tokenId) => {
    removeTokenFromChain(selectedChain, tokenId);
  };

  // Add EOA address handlers
  const handleAddEoaAddress = () => {
    if (!newEoaAddress.trim()) {
      setError('Please enter an EOA address');
      return;
    }

    if (eoaAddresses.some(eoa => eoa.address.toLowerCase() === newEoaAddress.toLowerCase())) {
      setError('Address already exists in the list');
      return;
    }

    addEoaAddress(newEoaAddress);
    setNewEoaAddress('');
    setError('');
  };

  // Check balances for all tokens and EOA addresses
  const checkBalances = async () => {
    if (eoaAddresses.length === 0) {
      setError('Please add at least one EOA address');
      return;
    }

    const currentTokens = getCurrentChainTokens();
    if (currentTokens.length === 0) {
      setError('Please add at least one token for the selected chain');
      return;
    }

    setLoading(true);
    setError('');
    setBalanceResults([]);

    try {
      // Create balance calls for all tokens and all EOA addresses
      const allBalanceCalls = [];
      const callMetadata = [];

      eoaAddresses.forEach(eoa => {
        currentTokens.forEach(token => {
          const balanceCall = createERC20BalanceCall(token.address, eoa.address);
          allBalanceCalls.push(balanceCall);
          callMetadata.push({
            eoaId: eoa.id,
            eoaAddress: eoa.address,
            eoaLabel: eoa.label,
            tokenId: token.id,
            token: token
          });
        });
      });

      const result = await makeMulticall(rpcUrl, multicallAddress, allBalanceCalls);

      if (result.success) {
        const formattedResults = result.results.map((balanceResult, index) => {
          const metadata = callMetadata[index];
          let balance = '0';
          let formattedBalance = '0';

          if (balanceResult.success) {
            try {
              // Parse the balance result - handle both string and object responses
              let balanceData = balanceResult.result;
              
              // If it's a string, try to parse it as JSON
              if (typeof balanceData === 'string') {
                try {
                  balanceData = JSON.parse(balanceData);
                } catch {
                  // If JSON parse fails, use the string directly
                  balance = balanceData;
                }
              }
              
              // Handle array response (from ABI decoder)
              if (Array.isArray(balanceData)) {
                balance = balanceData[0];
              } else {
                balance = balanceData;
              }
              
              // Ensure balance is a string for further processing
              if (typeof balance === 'object' && balance !== null) {
                // Handle BigNumber objects
                if (balance.toString) {
                  balance = balance.toString();
                } else if (balance.hex) {
                  // Handle hex format
                  balance = window.ethers ? window.ethers.BigNumber.from(balance.hex).toString() : balance.hex;
                } else {
                  balance = '0';
                }
              } else {
                balance = String(balance || '0');
              }
              
              formattedBalance = formatTokenBalance(balance, metadata.token.decimals);
            } catch (parseError) {
              console.warn('Error parsing balance result:', parseError);
              balance = '0';
              formattedBalance = '0';
            }
          }

          return {
            ...metadata,
            rawBalance: balance,
            formattedBalance,
            success: balanceResult.success,
            error: balanceResult.success ? null : 'Failed to fetch balance'
          };
        });

        // Group results by EOA address
        const groupedResults = eoaAddresses.map(eoa => ({
          eoa,
          tokens: formattedResults.filter(result => result.eoaId === eoa.id)
        }));

        setBalanceResults(groupedResults);
      } else {
        setError('Multicall failed');
      }

    } catch (error) {
      setError(`Error checking balances: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Clear all results
  const clearResults = () => {
    setBalanceResults([]);
    setError('');
  };

  // Import/Export functions
  const exportTokensByChain = () => {
    const dataStr = JSON.stringify(tokensByChain, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `token-list-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const exportEoaAddresses = () => {
    const dataStr = JSON.stringify(eoaAddresses, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `eoa-addresses-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importTokensByChain = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          setTokensByChain(imported);
          setError('');
        } catch (error) {
          setError('Error importing tokens: Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const importEoaAddresses = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          setEoaAddresses(imported);
          setError('');
        } catch (error) {
          setError('Error importing EOA addresses: Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Token Balance Checker
        </h1>

        {/* Chain and RPC Configuration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Network Configuration
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Blockchain Network
              </label>
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {chainsArray.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                RPC URL
              </label>
              <input
                type="text"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                placeholder="Enter RPC URL"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Multicall3 Address
              </label>
              <input
                type="text"
                value={multicallAddress}
                onChange={(e) => setMulticallAddress(e.target.value)}
                placeholder="Multicall3 contract address"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('tokens')}
                className={`py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === 'tokens'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <i className="fas fa-coins mr-2"></i>
                Token Management
              </button>
              <button
                onClick={() => setActiveTab('addresses')}
                className={`py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === 'addresses'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <i className="fas fa-wallet mr-2"></i>
                EOA Addresses
              </button>
              <button
                onClick={() => setActiveTab('check')}
                className={`py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === 'check'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <i className="fas fa-search mr-2"></i>
                Check Balances
              </button>
            </nav>
          </div>
        </div>

        {/* Token Management Tab */}
        {activeTab === 'tokens' && (
          <>
            {/* Add Token Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Add ERC20 Token to {chainsArray.find(c => c.id === selectedChain)?.name || selectedChain}
              </h2>
              
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newTokenAddress}
                    onChange={(e) => setNewTokenAddress(e.target.value)}
                    placeholder="Enter ERC20 token contract address"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  onClick={addToken}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Adding...' : 'Add Token'}
                </button>
              </div>

              <div className="flex gap-4">
                <input
                  type="file"
                  accept=".json"
                  onChange={importTokensByChain}
                  style={{ display: 'none' }}
                  id="import-tokens"
                />
                <label
                  htmlFor="import-tokens"
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
                >
                  <i className="fas fa-upload mr-2"></i>
                  Import Tokens
                </label>
                <button
                  onClick={exportTokensByChain}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                >
                  <i className="fas fa-download mr-2"></i>
                  Export Tokens
                </button>
              </div>
            </div>

            {/* Token List for Current Chain */}
            {getCurrentChainTokens().length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Tokens on {chainsArray.find(c => c.id === selectedChain)?.name || selectedChain} ({getCurrentChainTokens().length})
                </h2>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Name</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Symbol</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Decimals</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Address</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCurrentChainTokens().map((token) => (
                        <tr key={token.id} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-3 px-4 text-gray-900 dark:text-white">{token.name}</td>
                          <td className="py-3 px-4 text-gray-900 dark:text-white font-mono">{token.symbol}</td>
                          <td className="py-3 px-4 text-gray-900 dark:text-white">{token.decimals}</td>
                          <td className="py-3 px-4 text-gray-900 dark:text-white font-mono text-sm">
                            {token.address.slice(0, 10)}...{token.address.slice(-8)}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => removeToken(token.id)}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* EOA Addresses Tab */}
        {activeTab === 'addresses' && (
          <>
            {/* Add EOA Address Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Add EOA Address
              </h2>
              
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newEoaAddress}
                    onChange={(e) => setNewEoaAddress(e.target.value)}
                    placeholder="Enter wallet address"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  onClick={handleAddEoaAddress}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  Add Address
                </button>
              </div>

              <div className="flex gap-4">
                <input
                  type="file"
                  accept=".json"
                  onChange={importEoaAddresses}
                  style={{ display: 'none' }}
                  id="import-addresses"
                />
                <label
                  htmlFor="import-addresses"
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
                >
                  <i className="fas fa-upload mr-2"></i>
                  Import Addresses
                </label>
                <button
                  onClick={exportEoaAddresses}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                >
                  <i className="fas fa-download mr-2"></i>
                  Export Addresses
                </button>
              </div>
            </div>

            {/* EOA Address List */}
            {eoaAddresses.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  EOA Addresses ({eoaAddresses.length})
                </h2>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Label</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Address</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eoaAddresses.map((eoa) => (
                        <tr key={eoa.id} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={eoa.label}
                              onChange={(e) => updateEoaLabel(eoa.id, e.target.value)}
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </td>
                          <td className="py-3 px-4 text-gray-900 dark:text-white font-mono text-sm">
                            {eoa.address.slice(0, 10)}...{eoa.address.slice(-8)}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => removeEoaAddress(eoa.id)}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Balance Checking Tab */}
        {activeTab === 'check' && (
          <>
            {/* Balance Checker Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Check Token Balances
              </h2>
              
              <div className="mb-4">
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Current Chain: <span className="font-semibold">{chainsArray.find(c => c.id === selectedChain)?.name || selectedChain}</span>
                </p>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Tokens: <span className="font-semibold">{getCurrentChainTokens().length}</span>
                </p>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  EOA Addresses: <span className="font-semibold">{eoaAddresses.length}</span>
                </p>
              </div>

              <div className="flex gap-4 mb-4">
                <button
                  onClick={checkBalances}
                  disabled={loading || getCurrentChainTokens().length === 0 || eoaAddresses.length === 0}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Checking...' : 'Check All Balances'}
                </button>
                {balanceResults.length > 0 && (
                  <button
                    onClick={clearResults}
                    className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Clear Results
                  </button>
                )}
              </div>

              {(getCurrentChainTokens().length === 0 || eoaAddresses.length === 0) && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-yellow-800 dark:text-yellow-200">
                    {getCurrentChainTokens().length === 0 && 'Add some tokens first. '}
                    {eoaAddresses.length === 0 && 'Add some EOA addresses first.'}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="text-red-800 dark:text-red-200">
                <strong>Error:</strong> {error}
              </div>
            </div>
          </div>
        )}

        {/* Balance Results */}
        {balanceResults.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Balance Results for {chainsArray.find(c => c.id === selectedChain)?.name || selectedChain}
            </h2>
            
            {balanceResults.map((addressGroup) => (
              <div key={addressGroup.eoa.id} className="mb-8 last:mb-0">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  {addressGroup.eoa.label} ({addressGroup.eoa.address.slice(0, 10)}...{addressGroup.eoa.address.slice(-8)})
                </h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Token</th>
                        <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Balance</th>
                        <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Raw Balance</th>
                        <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {addressGroup.tokens.map((result) => (
                        <tr key={`${result.eoaId}-${result.tokenId}`} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-3 px-4">
                            <div className="text-gray-900 dark:text-white font-medium">{result.token.symbol}</div>
                            <div className="text-gray-500 dark:text-gray-400 text-sm">{result.token.name}</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="text-gray-900 dark:text-white font-mono">
                              {result.success ? String(result.formattedBalance || 'N/A') : 'N/A'}
                            </div>
                            {result.success && (
                              <div className="text-gray-500 dark:text-gray-400 text-sm">
                                {result.token.symbol}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                              {result.success ? String(result.rawBalance || 'N/A') : 'N/A'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {result.success ? (
                              <span className="text-green-600 dark:text-green-400 font-medium">Success</span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400 font-medium">Failed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Successfully retrieved {addressGroup.tokens.filter(r => r.success).length} of {addressGroup.tokens.length} token balances
                </div>
              </div>
            ))}

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total: {balanceResults.reduce((acc, group) => acc + group.tokens.filter(r => r.success).length, 0)} successful balance checks
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenBalanceChecker;
              onClick={addToken}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Adding...' : 'Add Token'}
            </button>
          </div>
        </div>

        {/* Token List */}
        {tokens.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Stored Tokens ({tokens.length})
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Name</th>
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Symbol</th>
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Decimals</th>
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Address</th>
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-3 px-4 text-gray-900 dark:text-white">{token.name}</td>
                      <td className="py-3 px-4 text-gray-900 dark:text-white font-mono">{token.symbol}</td>
                      <td className="py-3 px-4 text-gray-900 dark:text-white">{token.decimals}</td>
                      <td className="py-3 px-4 text-gray-900 dark:text-white font-mono text-sm">
                        {token.address.slice(0, 10)}...{token.address.slice(-8)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => removeToken(token.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Balance Checker Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Check Token Balances
          </h2>
          
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                value={holderAddress}
                onChange={(e) => setHolderAddress(e.target.value)}
                placeholder="Enter wallet address to check balances"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={checkBalances}
              disabled={loading || tokens.length === 0}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Checking...' : 'Check Balances'}
            </button>
            {balanceResults.length > 0 && (
              <button
                onClick={clearResults}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Clear Results
              </button>
            )}
          </div>

          {tokens.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              Add some tokens first to check balances
            </p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="text-red-800 dark:text-red-200">
                <strong>Error:</strong> {error}
              </div>
            </div>
          </div>
        )}

        {/* Balance Results */}
        {balanceResults.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Balance Results for: {holderAddress.slice(0, 10)}...{holderAddress.slice(-8)}
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Token</th>
                    <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Balance</th>
                    <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Raw Balance</th>
                    <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceResults.map((result) => (
                    <tr key={result.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-3 px-4">
                        <div className="text-gray-900 dark:text-white font-medium">{result.symbol}</div>
                        <div className="text-gray-500 dark:text-gray-400 text-sm">{result.name}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="text-gray-900 dark:text-white font-mono">
                          {result.success ? String(result.formattedBalance || 'N/A') : 'N/A'}
                        </div>
                        {result.success && (
                          <div className="text-gray-500 dark:text-gray-400 text-sm">
                            {result.symbol}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                          {result.success ? String(result.rawBalance || 'N/A') : 'N/A'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {result.success ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">Success</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">Failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Successfully retrieved {balanceResults.filter(r => r.success).length} of {balanceResults.length} token balances
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenBalanceChecker;
