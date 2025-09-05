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

// Helper function to format BigNumber values for display
export const formatResult = (value) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (window.ethers && window.ethers.BigNumber && window.ethers.BigNumber.isBigNumber(value)) {
    return value.toString();
  }
  if (typeof value === 'object' && value !== null) {
    // Handle objects with hex property (common BigNumber format)
    if (value.hex) {
      try {
        if (window.ethers && window.ethers.BigNumber) {
          return window.ethers.BigNumber.from(value.hex).toString();
        } else {
          return value.hex;
        }
      } catch {
        return value.hex;
      }
    }
    
    // Handle other objects by stringifying with BigInt/BigNumber conversion
    try {
      return JSON.stringify(value, (key, val) => {
        if (typeof val === 'bigint') {
          return val.toString();
        }
        if (window.ethers && window.ethers.BigNumber && window.ethers.BigNumber.isBigNumber(val)) {
          return val.toString();
        }
        if (typeof val === 'object' && val !== null && val.hex) {
          try {
            return window.ethers ? window.ethers.BigNumber.from(val.hex).toString() : val.hex;
          } catch {
            return val.hex;
          }
        }
        return val;
      }, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

// Helper function to convert parameters based on type
export const convertParameter = (value, type) => {
  if (type.startsWith('uint') || type.startsWith('int')) {
    if (window.ethers.BigNumber) {
      return window.ethers.BigNumber.from(value);
    } else {
      return value.toString();
    }
  } else if (type === 'bool') {
    return value.toLowerCase() === 'true';
  } else if (type === 'address') {
    if (window.ethers.utils && window.ethers.utils.isAddress) {
      if (!window.ethers.utils.isAddress(value)) {
        throw new Error(`Invalid address: ${value}`);
      }
    }
    return value;
  }
  return value;
};

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
    const fragment = window.ethers.utils.FunctionFragment.from(method);
    let callData = '';
    
    if (window.ethers.utils.Interface) {
      // ethers v5
      const iface = new window.ethers.utils.Interface([method]);
      callData = iface.encodeFunctionData(methodName, parameters);
    } else if (window.ethers.Interface) {
      // ethers v6
      const iface = new window.ethers.Interface([method]);
      callData = iface.encodeFunctionData(methodName, parameters);
    } else {
      // Manual encoding fallback
      const encodedData = window.ethers.utils.defaultAbiCoder.encode(
        fragment.inputs.map(input => input.type),
        parameters
      );
      callData = fragment.selector + encodedData.substring(2);
    }
    
    return callData;
  } catch (error) {
    throw new Error(`Error encoding call data: ${error.message}`);
  }
};

// Make a single contract call
export const makeSingleCall = async (rpcUrl, contractAddress, abi, methodName, parameters = []) => {
  if (!window.ethers) {
    throw new Error('Ethers.js not loaded');
  }

  if (!rpcUrl || !contractAddress || !methodName) {
    throw new Error('Missing required parameters: rpcUrl, contractAddress, or methodName');
  }

  try {
    // Convert parameters to appropriate types
    const method = abi.find(item => item.type === 'function' && item.name === methodName);
    if (!method) {
      throw new Error(`Method "${methodName}" not found in ABI`);
    }

    const convertedParams = parameters.map((param, index) => {
      if (method.inputs[index]) {
        return convertParameter(param, method.inputs[index].type);
      }
      return param;
    });

    // Create provider and contract
    const provider = new window.ethers.providers.JsonRpcProvider(rpcUrl);
    const contract = new window.ethers.Contract(contractAddress, abi, provider);

    // Make the call
    const result = await contract[methodName](...convertedParams);
    
    // Generate call data for reference
    const callData = generateCallData(abi, methodName, convertedParams);

    return {
      result: formatResult(result),
      callData,
      success: true
    };

  } catch (error) {
    throw new Error(`Single call failed: ${error.message}`);
  }
};

// Make a multicall using Multicall3
export const makeMulticall = async (rpcUrl, multicallAddress, calls) => {
  if (!window.ethers) {
    throw new Error('Ethers.js not loaded');
  }

  if (!rpcUrl || !multicallAddress || !calls || calls.length === 0) {
    throw new Error('Missing required parameters for multicall');
  }

  try {
    const provider = new window.ethers.providers.JsonRpcProvider(rpcUrl);
    const multicallContract = new window.ethers.Contract(multicallAddress, standardAbis.multicall3, provider);

    // Prepare calls array
    const formattedCalls = calls.map(call => ({
      target: call.target,
      callData: call.callData
    }));

    // Use tryAggregate to allow individual call failures
    const requireSuccess = false;
    const result = await multicallContract.tryAggregate(requireSuccess, formattedCalls);

    // Process results
    const processedResults = result.map((item, index) => {
      const success = item.success;
      const returnData = item.returnData;
      const originalCall = calls[index];

      let decodedResult = returnData;

      // Attempt to decode the result if we have ABI information
      if (success && returnData && originalCall.abi && originalCall.methodName) {
        try {
          const method = originalCall.abi.find(abiItem => 
            abiItem.type === 'function' && abiItem.name === originalCall.methodName
          );

          if (method && method.outputs && method.outputs.length > 0) {
            const outputTypes = method.outputs.map(output => output.type);
            
            if (window.ethers.utils && window.ethers.utils.defaultAbiCoder) {
              const decoded = window.ethers.utils.defaultAbiCoder.decode(outputTypes, returnData);
              decodedResult = formatResult(decoded);
            }
          }
        } catch (decodeError) {
          decodedResult = `Decode error: ${decodeError.message} (Raw: ${returnData})`;
        }
      } else if (!success) {
        decodedResult = `Call failed (Raw: ${returnData})`;
      }

      return {
        callIndex: index,
        target: originalCall.target,
        methodName: originalCall.methodName || 'unknown',
        success,
        result: decodedResult,
        rawData: returnData
      };
    });

    // Generate aggregate call data for reference
    const tryAggregateMethod = standardAbis.multicall3.find(
      item => item.type === 'function' && item.name === 'tryAggregate'
    );

    let aggregateCallData = '';
    try {
      const fragment = window.ethers.utils.FunctionFragment.from(tryAggregateMethod);
      if (window.ethers.utils.Interface) {
        const iface = new window.ethers.utils.Interface([tryAggregateMethod]);
        aggregateCallData = iface.encodeFunctionData('tryAggregate', [requireSuccess, formattedCalls]);
      }
    } catch (error) {
      aggregateCallData = `Error encoding aggregate call data: ${error.message}`;
    }

    return {
      results: processedResults,
      aggregateCallData,
      success: true,
      totalCalls: calls.length,
      successfulCalls: processedResults.filter(r => r.success).length
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
