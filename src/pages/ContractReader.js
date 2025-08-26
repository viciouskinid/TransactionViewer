import React, { useState, useEffect } from 'react';
import { 
  makeSingleCall, 
  makeMulticall, 
  generateCallData, 
  standardAbis,
  DEFAULT_MULTICALL3_ADDRESS 
} from '../utils/blockchainUtils';

// Extended ABIs for ContractReader specific functionality
const extendedAbis = {
  ...standardAbis,
  uniswapv2_router: [
    { "inputs": [], "name": "factory", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "WETH", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  ],
  uniswapv2_factory: [
    { "inputs": [{ "internalType": "address", "name": "", "type": "address" }, { "internalType": "address", "name": "", "type": "address" }], "name": "getPair", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  ],
  uniswapv2_pair: [
    { "inputs": [], "name": "token0", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "token1", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getReserves", "outputs": [{ "internalType": "uint112", "name": "_reserve0", "type": "uint112" }, { "internalType": "uint112", "name": "_reserve1", "type": "uint112" }, { "internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32" }], "stateMutability": "view", "type": "function" },
  ]
};

// Extend multicall3 ABI with additional methods
extendedAbis.multicall3 = [
  ...standardAbis.multicall3,
  { "inputs": [], "name": "getBasefee", "outputs": [{ "internalType": "uint256", "name": "basefee", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getBlockNumber", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getChainId", "outputs": [{ "internalType": "uint256", "name": "chainid", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }], "name": "getEthBalance", "outputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }], "stateMutability": "view", "type": "function" },
];

const MAX_HISTORY_ITEMS = 20;

export default function ContractReader() {
  // Tab state
  const [activeTab, setActiveTab] = useState('single-call');
  
  // Single call state
  const [singleCall, setSingleCall] = useState({
    rpcUrl: 'https://rpc-pulsechain.g4mm4.io',
    contractAddress: '',
    abiType: '',
    methodName: '',
    parameters: {}
  });
  
  // Multicall state
  const [multicall, setMulticall] = useState({
    rpcUrl: 'https://rpc-pulsechain.g4mm4.io',
    multicallAddress: DEFAULT_MULTICALL3_ADDRESS,
    calls: []
  });
  
  // Results state
  const [singleResults, setSingleResults] = useState({
    callData: '',
    response: '',
    message: '',
    messageType: ''
  });
  
  const [multicallResults, setMulticallResults] = useState({
    callData: '',
    response: '',
    message: '',
    messageType: ''
  });
  
  // Other state
  const [savedRpcUrls, setSavedRpcUrls] = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState([]);
  const [isEthersReady, setIsEthersReady] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Load ethers.js and initialize
  useEffect(() => {
    if (window.ethers) {
      setIsEthersReady(true);
    }
    
    // Load saved data
    const savedRpcs = JSON.parse(localStorage.getItem('contractReader_rpcUrls') || '[]');
    setSavedRpcUrls(savedRpcs);
    
    const history = JSON.parse(localStorage.getItem('contractReader_callHistory') || '[]');
    setCallHistory(history);
  }, []);
  
  // Save RPC URL to localStorage
  const saveRpcUrl = (url) => {
    if (!url || url.trim() === "" || savedRpcUrls.includes(url)) return;
    const updatedUrls = [...savedRpcUrls, url];
    setSavedRpcUrls(updatedUrls);
    localStorage.setItem('contractReader_rpcUrls', JSON.stringify(updatedUrls));
  };
  
  // Get available methods for selected ABI
  const getAvailableMethods = (abiType) => {
    const abi = extendedAbis[abiType] || [];
    return abi.filter(item => item.type === 'function' && (item.stateMutability === 'view' || item.constant === true));
  };
  
  // Get method from ABI
  const getMethod = (abiType, methodName) => {
    const abi = extendedAbis[abiType] || [];
    return abi.find(item => item.type === 'function' && item.name === methodName);
  };
  
  // Make single contract call
  const makeSingleCall = async () => {
    if (!singleCall.rpcUrl || !singleCall.contractAddress || !singleCall.methodName) {
      setSingleResults({
        ...singleResults,
        message: 'Please fill in RPC URL, Contract Address, and select a Method.',
        messageType: 'error'
      });
      return;
    }
    
    setLoading(true);
    saveRpcUrl(singleCall.rpcUrl);
    
    try {
      // Initialize provider with better error handling
      let provider;
      if (window.ethers.providers) {
        provider = new window.ethers.providers.JsonRpcProvider(singleCall.rpcUrl);
      } else if (window.ethers.JsonRpcProvider) {
        provider = new window.ethers.JsonRpcProvider(singleCall.rpcUrl);
      } else {
        throw new Error('Ethers.js provider not available');
      }
      
      const abi = extendedAbis[singleCall.abiType] || [];
      const contract = new window.ethers.Contract(singleCall.contractAddress, abi, provider);
      
      const method = getMethod(singleCall.abiType, singleCall.methodName);
      if (!method) {
        throw new Error(`Method "${singleCall.methodName}" not found in ABI`);
      }
      
      // Prepare parameters
      const params = [];
      for (let i = 0; i < method.inputs.length; i++) {
        const input = method.inputs[i];
        let paramValue = singleCall.parameters[`param_${i}`] || '';
        
        // Type conversion
        if (input.type.startsWith('uint') || input.type.startsWith('int')) {
          if (window.ethers.BigNumber) {
            paramValue = window.ethers.BigNumber.from(paramValue);
          } else {
            // Use string for large numbers if BigNumber is not available
            paramValue = paramValue.toString();
          }
        } else if (input.type === 'bool') {
          paramValue = paramValue.toLowerCase() === 'true';
        } else if (input.type === 'address') {
          if (window.ethers.utils && window.ethers.utils.isAddress) {
            if (!window.ethers.utils.isAddress(paramValue)) {
              throw new Error(`Invalid address for parameter ${input.name}`);
            }
          } else if (window.ethers.isAddress) {
            if (!window.ethers.isAddress(paramValue)) {
              throw new Error(`Invalid address for parameter ${input.name}`);
            }
          }
        }
        params.push(paramValue);
      }
      
      // Generate call data
      let callData = '';
      try {
        const iface = new window.ethers.utils.Interface([method]);
        callData = iface.encodeFunctionData(singleCall.methodName, params);
      } catch (encodeError) {
        console.warn('Error encoding call data:', encodeError);
        // Fallback method
        try {
          const fragment = window.ethers.utils.FunctionFragment.from(method);
          const encodedData = window.ethers.utils.defaultAbiCoder.encode(fragment.inputs, params);
          callData = fragment.sighash + encodedData.substring(2);
        } catch (fallbackError) {
          console.warn('Fallback encoding also failed:', fallbackError);
          callData = 'Error encoding call data';
        }
      }
      
      // Make the call
      const result = await contract[singleCall.methodName](...params);
      
      const formattedResult = JSON.stringify(result, (key, value) => {
        // Handle BigNumber from different ethers versions
        if (typeof value === 'object' && value !== null) {
          if (value._isBigNumber || (value.constructor && value.constructor.name === 'BigNumber')) {
            return value.toString();
          }
        }
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }, 2);
      
      setSingleResults({
        callData,
        response: formattedResult,
        message: 'Call successful!',
        messageType: 'success'
      });
      
      // Save to history
      addCallToHistory({
        type: 'single',
        rpcUrl: singleCall.rpcUrl,
        contractAddress: singleCall.contractAddress,
        abiType: singleCall.abiType,
        methodName: singleCall.methodName,
        parameters: Object.values(singleCall.parameters),
        callData,
        result: formattedResult,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Single call error:', error);
      setSingleResults({
        ...singleResults,
        response: 'Error during call.',
        message: `Error: ${error.message}`,
        messageType: 'error'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Add call to history
  const addCallToHistory = (callDetails) => {
    const updatedHistory = [callDetails, ...callHistory];
    if (updatedHistory.length > MAX_HISTORY_ITEMS) {
      updatedHistory.pop();
    }
    setCallHistory(updatedHistory);
    localStorage.setItem('contractReader_callHistory', JSON.stringify(updatedHistory));
  };

  // History selection handlers
  const handleHistoryItemSelect = (index) => {
    setSelectedHistoryItems(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  const handleSelectAllHistory = (e) => {
    if (e.target.checked) {
      setSelectedHistoryItems(callHistory.map((_, index) => index));
    } else {
      setSelectedHistoryItems([]);
    }
  };

  const clearCallHistory = () => {
    if (window.confirm('Are you sure you want to clear all call history?')) {
      setCallHistory([]);
      setSelectedHistoryItems([]);
      localStorage.removeItem('contractReader_callHistory');
    }
  };

  const createMulticallFromHistory = () => {
    if (selectedHistoryItems.length === 0) return;

    // Switch to multicall tab
    setActiveTab('multicall');

    // Collect calls from selected history items
    const callsToAdd = [];
    selectedHistoryItems.forEach(index => {
      const historyCall = callHistory[index];
      if (historyCall.type === 'single') {
        // Convert single call to multicall format
        callsToAdd.push({
          id: Date.now() + Math.random(),
          contractAddress: historyCall.contractAddress,
          abiType: historyCall.abiType,
          methodName: historyCall.methodName,
          parameters: historyCall.parameters
        });
      } else if (historyCall.type === 'multicall' && historyCall.calls) {
        // Add all calls from the multicall
        historyCall.calls.forEach(call => {
          callsToAdd.push({
            id: Date.now() + Math.random(),
            contractAddress: call.contractAddress,
            abiType: call.abiType,
            methodName: call.methodName,
            parameters: call.parameters
          });
        });
      }
    });

    // Update multicall state with the new calls
    setMulticall(prev => ({
      ...prev,
      calls: callsToAdd
    }));

    // Clear selections
    setSelectedHistoryItems([]);

    // Clear any previous results
    setMulticallResults({
      callData: '',
      response: '',
      message: `Loaded ${callsToAdd.length} call(s) from history. Ready to execute multicall.`,
      messageType: 'success'
    });
  };
  
  // Add multicall item
  const addMulticallItem = () => {
    const newCall = {
      id: Date.now(),
      contractAddress: '',
      abiType: '',
      methodName: '',
      parameters: {}
    };
    setMulticall({
      ...multicall,
      calls: [...multicall.calls, newCall]
    });
  };
  
  // Remove multicall item
  const removeMulticallItem = (id) => {
    setMulticall({
      ...multicall,
      calls: multicall.calls.filter(call => call.id !== id)
    });
  };
  
  // Update multicall item
  const updateMulticallItem = (id, updates) => {
    setMulticall({
      ...multicall,
      calls: multicall.calls.map(call => 
        call.id === id ? { ...call, ...updates } : call
      )
    });
  };
  
  // Execute multicall
  const executeMulticall = async () => {
    if (!multicall.rpcUrl || !multicall.multicallAddress || multicall.calls.length === 0) {
      setMulticallResults({
        ...multicallResults,
        message: 'Please fill in RPC URL, Multicall address, and add at least one call.',
        messageType: 'error'
      });
      return;
    }
    
    setLoading(true);
    saveRpcUrl(multicall.rpcUrl);
    
    try {
      // Initialize provider with better error handling
      let provider;
      if (window.ethers.providers) {
        provider = new window.ethers.providers.JsonRpcProvider(multicall.rpcUrl);
      } else if (window.ethers.JsonRpcProvider) {
        provider = new window.ethers.JsonRpcProvider(multicall.rpcUrl);
      } else {
        throw new Error('Ethers.js provider not available');
      }
      
      const multicallContract = new window.ethers.Contract(
        multicall.multicallAddress, 
        standardAbis.multicall3, 
        provider
      );
      
      // Prepare calls
      const calls = [];
      for (const call of multicall.calls) {
        const abi = extendedAbis[call.abiType] || [];
        const method = getMethod(call.abiType, call.methodName);
        
        if (!method) continue;
        
        const params = [];
        for (let i = 0; i < method.inputs.length; i++) {
          let paramValue = call.parameters[`param_${i}`] || '';
          const input = method.inputs[i];
          
          if (input.type.startsWith('uint') || input.type.startsWith('int')) {
            if (window.ethers.BigNumber) {
              paramValue = window.ethers.BigNumber.from(paramValue);
            } else {
              // Use string for large numbers if BigNumber is not available
              paramValue = paramValue.toString();
            }
          } else if (input.type === 'bool') {
            paramValue = paramValue.toLowerCase() === 'true';
          }
          params.push(paramValue);
        }
        
        const fragment = window.ethers.utils.FunctionFragment.from(method);
        let callData;
        try {
          const iface = new window.ethers.utils.Interface([method]);
          callData = iface.encodeFunctionData(call.methodName, params);
        } catch (encodeError) {
          // Fallback method
          const encodedData = window.ethers.utils.defaultAbiCoder.encode(fragment.inputs, params);
          callData = fragment.sighash + encodedData.substring(2);
        }
        
        calls.push({
          target: call.contractAddress,
          callData: callData
        });
      }
      
      // Generate aggregate call data for display
      let aggregateCallData = '';
      try {
        const tryBlockAndAggregateMethod = standardAbis.multicall3.find(
          item => item.type === 'function' && item.name === 'tryBlockAndAggregate'
        );
        if (tryBlockAndAggregateMethod) {
          const iface = new window.ethers.utils.Interface([tryBlockAndAggregateMethod]);
          aggregateCallData = iface.encodeFunctionData('tryBlockAndAggregate', [false, calls]);
        }
      } catch (encodeError) {
        console.warn('Error encoding aggregate call data:', encodeError);
        aggregateCallData = 'Error encoding aggregate call data';
      }
      
      // Execute tryBlockAndAggregate
      const result = await multicallContract.tryBlockAndAggregate(false, calls);
      
      // Decode results
      const decodedResults = result.returnData.map((item, index) => {
        const originalCall = multicall.calls[index];
        const method = getMethod(originalCall.abiType, originalCall.methodName);
        
        let decodedReturnData = item.returnData;
        
        if (item.success && method && method.outputs && method.outputs.length > 0) {
          try {
            const outputTypes = method.outputs.map(output => output.type);
            decodedReturnData = window.ethers.utils.defaultAbiCoder.decode(outputTypes, item.returnData);
            decodedReturnData = JSON.parse(JSON.stringify(decodedReturnData, (key, value) => {
              // Handle BigNumber from different ethers versions
              if (typeof value === 'object' && value !== null) {
                if (value._isBigNumber || (value.constructor && value.constructor.name === 'BigNumber')) {
                  return value.toString();
                }
              }
              if (typeof value === 'bigint') {
                return value.toString();
              }
              return value;
            }));
          } catch (decodeError) {
            decodedReturnData = `Error decoding: ${decodeError.message}`;
          }
        }
        
        return {
          callIndex: index + 1,
          success: item.success,
          returnData: decodedReturnData
        };
      });
      
      const formattedResult = JSON.stringify(decodedResults, null, 2);
      
      setMulticallResults({
        callData: aggregateCallData,
        response: formattedResult,
        message: 'Multicall successful!',
        messageType: 'success'
      });
      
      // Save to history
      addCallToHistory({
        type: 'multicall',
        rpcUrl: multicall.rpcUrl,
        multicallAddress: multicall.multicallAddress,
        calls: multicall.calls.map(call => ({
          contractAddress: call.contractAddress,
          abiType: call.abiType,
          methodName: call.methodName,
          parameters: Object.values(call.parameters)
        })),
        result: formattedResult,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Multicall error:', error);
      setMulticallResults({
        ...multicallResults,
        response: 'Error during multicall.',
        message: `Error: ${error.message}`,
        messageType: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-6 text-center">
          <i className="fas fa-code mr-3"></i>
          EVM Contract Reader
        </h1>
        
        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-6">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('single-call')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'single-call'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-blue-500'
              }`}
            >
              <i className="fas fa-phone mr-2"></i>
              Single Call
            </button>
            <button
              onClick={() => setActiveTab('multicall')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'multicall'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-blue-500'
              }`}
            >
              <i className="fas fa-layer-group mr-2"></i>
              Multicall3
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'history'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-blue-500'
              }`}
            >
              <i className="fas fa-history mr-2"></i>
              Call History ({callHistory.length})
            </button>
          </div>
        </div>
        
        {/* Single Call Tab */}
        {activeTab === 'single-call' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Single Read Call
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* RPC URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    RPC URL:
                  </label>
                  <select
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-2"
                    value={singleCall.rpcUrl}
                    onChange={(e) => setSingleCall({...singleCall, rpcUrl: e.target.value})}
                  >
                    <option value="">--Select RPC URL--</option>
                    {savedRpcUrls.map(url => (
                      <option key={url} value={url}>{url}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Or enter custom RPC URL"
                    value={singleCall.rpcUrl}
                    onChange={(e) => setSingleCall({...singleCall, rpcUrl: e.target.value})}
                  />
                </div>
                
                {/* Contract Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contract Address:
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Enter contract address"
                    value={singleCall.contractAddress}
                    onChange={(e) => setSingleCall({...singleCall, contractAddress: e.target.value})}
                  />
                </div>
                
                {/* ABI Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contract Type:
                  </label>
                  <select
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={singleCall.abiType}
                    onChange={(e) => setSingleCall({...singleCall, abiType: e.target.value, methodName: '', parameters: {}})}
                  >
                    <option value="">--Select Contract Type--</option>
                    <option value="erc20">ERC20</option>
                    <option value="uniswapv2_router">Uniswap V2 Router</option>
                    <option value="uniswapv2_factory">Uniswap V2 Factory</option>
                    <option value="uniswapv2_pair">Uniswap V2 Pair</option>
                    <option value="multicall3">Multicall3</option>
                  </select>
                </div>
                
                {/* Method */}
                {singleCall.abiType && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Method:
                    </label>
                    <select
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      value={singleCall.methodName}
                      onChange={(e) => setSingleCall({...singleCall, methodName: e.target.value, parameters: {}})}
                    >
                      <option value="">--Select Method--</option>
                      {getAvailableMethods(singleCall.abiType).map(method => (
                        <option key={method.name} value={method.name}>
                          {method.name}({method.inputs.map(input => input.type).join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Parameters */}
                {singleCall.methodName && (() => {
                  const method = getMethod(singleCall.abiType, singleCall.methodName);
                  return method && method.inputs.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Parameters:
                      </label>
                      <div className="space-y-2">
                        {method.inputs.map((input, index) => (
                          <div key={index}>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                              {input.name} ({input.type}):
                            </label>
                            <input
                              type="text"
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              placeholder={`Enter ${input.name}`}
                              value={singleCall.parameters[`param_${index}`] || ''}
                              onChange={(e) => setSingleCall({
                                ...singleCall,
                                parameters: {
                                  ...singleCall.parameters,
                                  [`param_${index}`]: e.target.value
                                }
                              })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Call Button */}
                <button
                  onClick={makeSingleCall}
                  disabled={loading || !isEthersReady}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {loading ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Making Call...</>
                  ) : (
                    <><i className="fas fa-play mr-2"></i>Make Read Call</>
                  )}
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Call Data */}
                <div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                    Call Data:
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 font-mono text-sm max-h-32 overflow-y-auto">
                    {singleResults.callData || 'Call data will appear here...'}
                  </div>
                </div>
                
                {/* Response */}
                <div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                    Response:
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 font-mono text-sm max-h-64 overflow-y-auto">
                    {singleResults.response || 'Response will appear here...'}
                  </div>
                </div>
                
                {/* Message */}
                {singleResults.message && (
                  <div className={`p-3 rounded-md text-sm font-medium ${
                    singleResults.messageType === 'success' 
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                  }`}>
                    <i className={`fas ${singleResults.messageType === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2`}></i>
                    {singleResults.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Multicall Tab */}
        {activeTab === 'multicall' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Multicall3 Builder
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* RPC URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    RPC URL:
                  </label>
                  <select
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-2"
                    value={multicall.rpcUrl}
                    onChange={(e) => setMulticall({...multicall, rpcUrl: e.target.value})}
                  >
                    <option value="">--Select RPC URL--</option>
                    {savedRpcUrls.map(url => (
                      <option key={url} value={url}>{url}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Or enter custom RPC URL"
                    value={multicall.rpcUrl}
                    onChange={(e) => setMulticall({...multicall, rpcUrl: e.target.value})}
                  />
                </div>
                
                {/* Multicall Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Multicall3 Address:
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={multicall.multicallAddress}
                    onChange={(e) => setMulticall({...multicall, multicallAddress: e.target.value})}
                  />
                </div>
                
                {/* Multicall Items */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Calls ({multicall.calls.length}):
                    </label>
                    <button
                      onClick={addMulticallItem}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm"
                    >
                      <i className="fas fa-plus mr-1"></i>Add Call
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {multicall.calls.map((call, index) => (
                      <div key={call.id} className="border border-gray-200 dark:border-gray-600 rounded-md p-3">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium text-gray-800 dark:text-gray-200">
                            Call #{index + 1}
                          </h4>
                          <button
                            onClick={() => removeMulticallItem(call.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                        
                        <div className="space-y-2">
                          <input
                            type="text"
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                            placeholder="Contract address"
                            value={call.contractAddress}
                            onChange={(e) => updateMulticallItem(call.id, {contractAddress: e.target.value})}
                          />
                          
                          <select
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                            value={call.abiType}
                            onChange={(e) => updateMulticallItem(call.id, {abiType: e.target.value, methodName: '', parameters: {}})}
                          >
                            <option value="">--Select Type--</option>
                            <option value="erc20">ERC20</option>
                            <option value="uniswapv2_router">Uniswap V2 Router</option>
                            <option value="uniswapv2_factory">Uniswap V2 Factory</option>
                            <option value="uniswapv2_pair">Uniswap V2 Pair</option>
                            <option value="multicall3">Multicall3</option>
                          </select>
                          
                          {call.abiType && (
                            <select
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              value={call.methodName}
                              onChange={(e) => updateMulticallItem(call.id, {methodName: e.target.value, parameters: {}})}
                            >
                              <option value="">--Select Method--</option>
                              {getAvailableMethods(call.abiType).map(method => (
                                <option key={method.name} value={method.name}>
                                  {method.name}
                                </option>
                              ))}
                            </select>
                          )}
                          
                          {call.methodName && (() => {
                            const method = getMethod(call.abiType, call.methodName);
                            return method && method.inputs.map((input, paramIndex) => (
                              <input
                                key={paramIndex}
                                type="text"
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                placeholder={`${input.name} (${input.type})`}
                                value={call.parameters[`param_${paramIndex}`] || ''}
                                onChange={(e) => updateMulticallItem(call.id, {
                                  parameters: {
                                    ...call.parameters,
                                    [`param_${paramIndex}`]: e.target.value
                                  }
                                })}
                              />
                            ));
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Execute Button */}
                <button
                  onClick={executeMulticall}
                  disabled={loading || !isEthersReady || multicall.calls.length === 0}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {loading ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Executing...</>
                  ) : (
                    <><i className="fas fa-play-circle mr-2"></i>Execute Multicall</>
                  )}
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Call Data */}
                <div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                    Aggregate Call Data:
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 font-mono text-sm max-h-32 overflow-y-auto">
                    {multicallResults.callData || 'Aggregate call data will appear here...'}
                  </div>
                </div>
                
                {/* Response */}
                <div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                    Response:
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 font-mono text-sm max-h-64 overflow-y-auto">
                    {multicallResults.response || 'Multicall response will appear here...'}
                  </div>
                </div>
                
                {/* Message */}
                {multicallResults.message && (
                  <div className={`p-3 rounded-md text-sm font-medium ${
                    multicallResults.messageType === 'success' 
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                  }`}>
                    <i className={`fas ${multicallResults.messageType === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2`}></i>
                    {multicallResults.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Call History
              </h2>
              {callHistory.length > 0 && (
                <button
                  onClick={clearCallHistory}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md"
                >
                  <i className="fas fa-trash mr-2"></i>Clear History
                </button>
              )}
            </div>
            
            {callHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <i className="fas fa-history text-4xl mb-4"></i>
                <p>No call history yet. Make some contract calls to see them here!</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {callHistory.map((call, index) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-md p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          call.type === 'single' 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                        }`}>
                          <i className={`fas ${call.type === 'single' ? 'fa-phone' : 'fa-layer-group'} mr-1`}></i>
                          {call.type === 'single' ? 'Single Call' : 'Multicall'}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(call.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">RPC:</p>
                        <p className="font-mono text-xs truncate">{call.rpcUrl}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">
                          {call.type === 'single' ? 'Contract:' : 'Multicall Address:'}
                        </p>
                        <p className="font-mono text-xs truncate">
                          {call.type === 'single' ? call.contractAddress : call.multicallAddress}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">Method/Calls:</p>
                        <p className="text-xs">
                          {call.type === 'single' 
                            ? call.methodName 
                            : `${call.calls.length} calls`
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">Result:</p>
                        <p className="text-xs truncate">
                          {call.result.substring(0, 50)}...
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Call History Section */}
        {callHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Call History</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">
                      <input
                        type="checkbox"
                        checked={selectedHistoryItems.length === callHistory.length}
                        onChange={handleSelectAllHistory}
                        className="rounded"
                      />
                    </th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Timestamp</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">RPC</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Contract</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Method</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Params</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {callHistory.map((call, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="border border-gray-300 dark:border-gray-600 p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedHistoryItems.includes(index)}
                          onChange={() => handleHistoryItemSelect(index)}
                          className="rounded"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        {new Date(call.timestamp).toLocaleString()}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2 font-mono text-xs">
                        {call.rpcUrl.length > 30 ? `${call.rpcUrl.substring(0, 30)}...` : call.rpcUrl}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2 font-mono text-xs">
                        {call.type === 'single' 
                          ? `${call.contractAddress.substring(0, 6)}...${call.contractAddress.slice(-4)}`
                          : `Multicall (${call.calls.length} calls)`
                        }
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        {call.type === 'single' ? call.methodName : 'Multiple'}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2 font-mono text-xs max-w-32 overflow-hidden">
                        {call.type === 'single' 
                          ? JSON.stringify(call.parameters).substring(0, 50) + '...'
                          : `${call.calls.length} calls`
                        }
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2 font-mono text-xs max-w-40 overflow-hidden">
                        {call.result.substring(0, 50)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4 mt-4">
              <button
                onClick={createMulticallFromHistory}
                disabled={selectedHistoryItems.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Multicall from Selected ({selectedHistoryItems.length})
              </button>
              <button
                onClick={clearCallHistory}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Clear History
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
