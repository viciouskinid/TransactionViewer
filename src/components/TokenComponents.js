import React from 'react';

/**
 * Token Image Component - displays token image with fallback
 */
export const TokenImage = ({ 
  token, 
  size = 'w-4 h-4', 
  className = '', 
  showTooltip = true 
}) => {
  if (!token?.image) return null;

  const tooltipText = showTooltip && token.name ? 
    `${token.name}${token.chainName ? ` (${token.chainName})` : ''}` : '';

  return (
    <img 
      src={token.image} 
      alt={token.name || 'Token'}
      className={`${size} rounded-full ${className}`}
      title={tooltipText}
    />
  );
};

/**
 * Token Symbol Component - displays token symbol
 */
export const TokenSymbol = ({ 
  token, 
  className = 'font-mono text-xs font-semibold text-green-600',
  showTooltip = true 
}) => {
  if (!token?.symbol) return null;

  const tooltipText = showTooltip ? 
    `${token.name}${token.chainName ? ` on ${token.chainName}` : ''}` : '';

  return (
    <span 
      className={className}
      title={tooltipText}
    >
      {token.symbol.toUpperCase()}
    </span>
  );
};

/**
 * Copy Address Button Component
 */
export const CopyAddressButton = ({ 
  address, 
  className = 'text-gray-400 hover:text-green-500 transition-colors',
  iconClass = 'fa-regular fa-copy text-xs'
}) => {
  if (!address) return null;

  return (
    <button 
      onClick={() => navigator.clipboard?.writeText(address)}
      className={className}
      title="Copy contract address"
    >
      <i className={iconClass}></i>
    </button>
  );
};

/**
 * Token Price Component - displays USD price
 */
export const TokenPrice = ({ 
  token, 
  amount = 1, 
  className = 'text-green-600 font-semibold',
  showPerTokenPrice = true 
}) => {
  if (!token?.price || amount <= 0) return null;

  const usdValue = amount * token.price;
  const tooltipText = showPerTokenPrice ? 
    `$${token.price.toFixed(6)} USD per token` : '';

  return (
    <span 
      className={className}
      title={tooltipText}
    >
      ${usdValue.toFixed(2)}
    </span>
  );
};

/**
 * Loading Spinner Component
 */
export const LoadingSpinner = ({ 
  size = 'h-4 w-4',
  className = 'animate-spin rounded-full border-b-2 border-green-500'
}) => {
  return <div className={`${size} ${className}`}></div>;
};

/**
 * Complete Token Display Component - combines image, symbol, and copy button
 */
export const TokenDisplay = ({ 
  token, 
  contractAddress,
  isLoading = false,
  imageSize = 'w-4 h-4',
  symbolClassName = 'font-mono text-xs font-semibold text-green-600',
  containerClassName = 'inline-flex items-center space-x-1',
  showFallback = true
}) => {
  // Show loading spinner
  if (isLoading) {
    return (
      <span className={containerClassName}>
        <LoadingSpinner />
      </span>
    );
  }

  // Show token info if available
  if (token) {
    const checksummedContract = contractAddress && window.ethers ? 
      window.ethers.utils.getAddress(contractAddress) : contractAddress;
    
    return (
      <span className={containerClassName}>
        <TokenImage 
          token={token} 
          size={imageSize}
        />
        <TokenSymbol 
          token={token}
          className={symbolClassName}
        />
        {contractAddress && (
          <CopyAddressButton address={checksummedContract} />
        )}
      </span>
    );
  }

  // Fallback display
  if (showFallback && contractAddress) {
    const checksummedContract = window.ethers ? 
      window.ethers.utils.getAddress(contractAddress) : contractAddress;
    const shortAddress = `${checksummedContract.slice(0, 6)}...${checksummedContract.slice(-4)}`;
    
    return (
      <span className={containerClassName}>
        <span 
          className="font-mono text-xs"
          title={checksummedContract}
        >
          {shortAddress}
        </span>
        <CopyAddressButton address={checksummedContract} />
      </span>
    );
  }

  return null;
};

/**
 * Token Value Display Component - shows formatted amount with USD value
 */
export const TokenValueDisplay = ({ 
  token,
  rawValue,
  contractAddress,
  isLoading = false,
  showUsdValue = true,
  amountClassName = 'font-mono font-semibold text-green-700',
  usdClassName = 'text-green-600 font-semibold'
}) => {
  // Show loading or fallback for value
  if (isLoading || !token) {
    const fallbackValue = rawValue ? `${rawValue} wei` : '0';
    return (
      <span className={amountClassName}>
        {fallbackValue}
      </span>
    );
  }

  // Calculate formatted value and USD amount
  let formattedValue = '0';
  let tokenAmount = 0;

  if (rawValue && token.decimals !== undefined && window.ethers) {
    try {
      const decimals = token.decimals;
      const divisor = window.ethers.BigNumber.from(10).pow(decimals);
      const valueInTokens = window.ethers.BigNumber.from(rawValue).div(divisor);
      const remainder = window.ethers.BigNumber.from(rawValue).mod(divisor);
      const decimalPart = remainder.toString().padStart(decimals, '0');
      formattedValue = `${valueInTokens.toString()}.${decimalPart}`.replace(/\.?0+$/, '');
      tokenAmount = parseFloat(formattedValue);
    } catch (err) {
      formattedValue = rawValue ? `${rawValue} wei` : '0';
      tokenAmount = 0;
    }
  }

  const usdValue = token?.price ? (tokenAmount * token.price) : 0;

  return (
    <>
      <span className={amountClassName}>{formattedValue}</span>
      {showUsdValue && usdValue > 0 && (
        <span 
          className={usdClassName}
          title={`$${token.price?.toFixed(6)} USD per token`}
        >
          {' '}(${usdValue.toFixed(2)})
        </span>
      )}
    </>
  );
};

export default TokenDisplay;
