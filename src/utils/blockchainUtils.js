// Blockchain utility functions for making calls and multicalls

// Standard ABIs
export const standardAbis = {
  erc20: [
    { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "payable": false, "stateMutability": "view", "type": "function" },
    { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" },
    { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" },
    { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }
  ],
  multicall3: [
    { "inputs": [{ "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall3.Call[]", "name": "calls", "type": "tuple[]" }], "name": "aggregate", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }, { "internalType": "bytes[]", "name": "returnData", "type": "bytes[]" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "bool", "name": "requireSuccess", "type": "bool" }, { "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall3.Call[]", "name": "calls", "type": "tuple[]" }], "name": "tryAggregate", "outputs": [{ "components": [{ "internalType": "bool", "name": "success", "type": "bool" }, { "internalType": "bytes", "name": "returnData", "type": "bytes" }], "internalType": "struct Multicall3.Result[]", "name": "returnData", "type": "tuple[]" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "bool", "name": "requireSuccess", "type": "bool" }, { "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall3.Call[]", "name": "calls", "type": "tuple[]" }], "name": "tryBlockAndAggregate", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }, { "internalType": "bytes32", "name": "blockHash", "type": "bytes32" }, { "components": [{ "internalType": "bool", "name": "success", "type": "bool" }, { "internalType": "bytes", "name": "returnData", "type": "bytes" }], "internalType": "struct Multicall3.Result[]", "name": "returnData", "type": "tuple[]" }], "stateMutability": "view", "type": "function" }
  ]
};

// Default Multicall3 address (same across most chains)
export const DEFAULT_MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Generate call data for a function call
export const generateCallData = (abi, methodName, parameters = []) => {
  if (!window.ethers) {
    throw new Error('Ethers.js not loaded');
  }

  const method = abi.find(item => item.type === 'function' && item.name === methodName);
  if (!method) {
    throw new Error(`Method "${methodName}" not found in ABI`);
  }

  try {
    const iface = new window.ethers.utils.Interface([method]);
    const callData = iface.encodeFunctionData(methodName, parameters);
    return callData;
  } catch (error) {
    throw new Error(`Error encoding call data: ${error.message}`);
  }
};

// Make a direct RPC call without provider (no eth_chainId needed)
const makeDirectRpcCall = async (rpcUrl, method, params) => {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: method,
      params: params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }

  return data.result;
};

// Make a multicall using direct RPC call (no provider needed - no eth_chainId!)
export const makeMulticall = async (rpcUrl, multicallAddress, calls) => {
  if (!window.ethers) {
    throw new Error('Ethers.js not loaded');
  }

  if (!rpcUrl || !multicallAddress || !calls || calls.length === 0) {
    throw new Error('Missing required parameters for multicall');
  }

  try {
    // Create interface for encoding the call
    const multicallInterface = new window.ethers.utils.Interface(standardAbis.multicall3);
    
    // Prepare calls array
    const formattedCalls = calls.map(call => ({
      target: call.target,
      callData: call.callData
    }));

    // Encode the tryAggregate call
    const requireSuccess = false;
    const callData = multicallInterface.encodeFunctionData('tryAggregate', [requireSuccess, formattedCalls]);

    // Make direct eth_call (no provider, no eth_chainId!)
    const result = await makeDirectRpcCall(rpcUrl, 'eth_call', [
      {
        to: multicallAddress,
        data: callData
      },
      'latest'
    ]);

    // Decode the result
    const decodedResult = multicallInterface.decodeFunctionResult('tryAggregate', result);
    const returnData = decodedResult[0]; // tryAggregate returns array of results

    // Process results
    const processedResults = returnData.map((item, index) => {
      const success = item.success;
      const returnDataItem = item.returnData;
      const originalCall = calls[index];

      let decodedResult = null;
      if (success && originalCall.abi && originalCall.methodName) {
        try {
          const contractInterface = new window.ethers.utils.Interface(originalCall.abi);
          const rawDecoded = contractInterface.decodeFunctionResult(originalCall.methodName, returnDataItem);
          
          // Convert BigNumber objects to strings to prevent React rendering errors
          if (Array.isArray(rawDecoded)) {
            decodedResult = rawDecoded.map(item => {
              if (item && typeof item === 'object' && item._hex && item._isBigNumber) {
                return item.toString();
              }
              return item;
            });
          } else if (rawDecoded && typeof rawDecoded === 'object' && rawDecoded._hex && rawDecoded._isBigNumber) {
            decodedResult = rawDecoded.toString();
          } else {
            decodedResult = rawDecoded;
          }
        } catch (error) {
          console.warn(`Failed to decode result for call ${index}:`, error);
        }
      }

      return {
        success,
        result: decodedResult || returnDataItem,
        rawData: returnDataItem,
        call: originalCall
      };
    });

    return {
      success: true,
      results: processedResults,
      blockNumber: null // Not available with direct RPC call
    };

  } catch (error) {
    throw new Error(`Multicall failed: ${error.message}`);
  }
};

// Create ERC20 balance call data
export const createERC20BalanceCall = (tokenAddress, holderAddress) => {
  try {
    const callData = generateCallData(standardAbis.erc20, 'balanceOf', [holderAddress]);
    return {
      target: tokenAddress,
      callData,
      abi: standardAbis.erc20,
      methodName: 'balanceOf',
      parameters: [holderAddress]
    };
  } catch (error) {
    throw new Error(`Error creating ERC20 balance call: ${error.message}`);
  }
};

// Create ERC20 token info calls (name, symbol, decimals)
export const createERC20InfoCalls = (tokenAddress) => {
  const calls = [];
  const methods = ['name', 'symbol', 'decimals'];
  
  methods.forEach(method => {
    try {
      const callData = generateCallData(standardAbis.erc20, method, []);
      calls.push({
        target: tokenAddress,
        callData,
        abi: standardAbis.erc20,
        methodName: method,
        parameters: []
      });
    } catch (error) {
      console.warn(`Error creating ${method} call for ${tokenAddress}:`, error.message);
    }
  });
  
  return calls;
};

// Format token balance with decimals
export const formatTokenBalance = (balance, decimals = 18) => {
  try {
    if (!balance || balance === '0') return '0';
    
    // Convert balance to string if it's an object or array
    let balanceStr = balance;
    
    // Handle array format (common from multicall results)
    if (Array.isArray(balance)) {
      if (balance.length === 0) return '0';
      balanceStr = balance[0];
    }
    
    if (typeof balanceStr === 'object' && balanceStr !== null) {
      if (balanceStr.toString) {
        balanceStr = balanceStr.toString();
      } else if (balanceStr.hex) {
        balanceStr = window.ethers ? window.ethers.BigNumber.from(balanceStr.hex).toString() : balanceStr.hex;
      } else {
        balanceStr = '0';
      }
    } else {
      balanceStr = String(balanceStr);
    }
    
    // Clean up the string (remove quotes, whitespace, etc.)
    balanceStr = balanceStr.replace(/["\s]/g, '');
    
    // Handle cases where the string looks like "[123]" - parse as JSON
    if (balanceStr.startsWith('[') && balanceStr.endsWith(']')) {
      try {
        const parsed = JSON.parse(balanceStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          balanceStr = String(parsed[0]);
        }
      } catch (jsonError) {
        // If JSON parsing fails, try to extract the number manually
        const match = balanceStr.match(/\[(\d+)\]/);
        if (match && match[1]) {
          balanceStr = match[1];
        }
      }
    }
    
    if (!balanceStr || balanceStr === '0') return '0';
    
    // Handle ethers.js
    if (window.ethers && window.ethers.BigNumber) {
      const balanceNum = window.ethers.BigNumber.from(balanceStr);
      const formatted = window.ethers.utils.formatUnits(balanceNum, decimals);
      
      // Remove trailing zeros and unnecessary decimal point
      return parseFloat(formatted).toString();
    } else {
      // Fallback manual calculation using native BigInt if available
      try {
        // eslint-disable-next-line no-undef
        const balanceNum = BigInt(balanceStr);
        // eslint-disable-next-line no-undef
        const divisor = BigInt(10) ** BigInt(decimals);
        const wholePart = balanceNum / divisor;
        const fractionalPart = balanceNum % divisor;
        
        if (fractionalPart === 0n) {
          return wholePart.toString();
        } else {
          const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
          const trimmedFractional = fractionalStr.replace(/0+$/, '');
          return trimmedFractional ? `${wholePart}.${trimmedFractional}` : wholePart.toString();
        }
      } catch (bigIntError) {
        // If BigInt isn't available, return the raw balance
        console.warn('BigInt not available, returning raw balance');
        return balanceStr;
      }
    }
  } catch (error) {
    console.error('Error formatting token balance:', error);
    console.error('Input balance was:', balance);
    return String(balance || '0');
  }
};
