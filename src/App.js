import React from 'react';
import TransactionPage from './pages/Transaction';
import TransferPage from './pages/Transfer';
import AddressTagsPage from './pages/AddressTags';
import ContractReaderPage from './pages/ContractReader';
import TokenBalancePage from './pages/TokenBalance';
import AdvancedTokenBalancePage from './pages/AdvancedTokenBalance';
import BlockAnalyticsPage from './pages/BlockAnalytics';

export default function App() {
  // Routing based on pathname and hash
  const pathname = window.location.pathname;
  const hash = window.location.hash;
  
  // Support both direct paths and hash-based routing for GitHub Pages
  const isTransactionPage = pathname.includes('/transaction') || hash.includes('/transaction');
  const isTransferPage = pathname.includes('/transfer') || hash.includes('/transfer');
  const isAddressTagsPage = pathname.includes('/address-tags') || hash.includes('/address-tags');
  const isContractReaderPage = pathname.includes('/contract-reader') || hash.includes('/contract-reader');
  const isTokenBalancePage = pathname.includes('/token-balance') || hash.includes('/token-balance');
  const isAdvancedTokenBalancePage = pathname.includes('/advanced-token-balance') || hash.includes('/advanced-token-balance');
  const isBlockAnalyticsPage = pathname.includes('/block-analytics') || hash.includes('/block-analytics');
  
  // Default to transaction page if no specific page is detected
  const isRootPage = !isTransactionPage && !isTransferPage && !isAddressTagsPage && !isContractReaderPage && !isTokenBalancePage && !isAdvancedTokenBalancePage && !isBlockAnalyticsPage;

  // Navigation function
  const navigateToPage = (page) => {
  const base = '/TransactionViewer';
  const newPath = `${base}/${page}`;
  window.history.pushState({}, '', newPath);
  // Force reload to update page (SPA would use router, but this is manual)
  window.location.replace(newPath + window.location.search);
  };

  // Get tx parameter from URL
  const urlParams = new URLSearchParams(window.location.search);
  const txParam = urlParams.get('tx');

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navigation Header */}
      <nav className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-800">
                <i className="fas fa-search mr-2"></i>
                Blockchain Explorer
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigateToPage('transaction')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isTransactionPage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-file-invoice mr-2"></i>
                Transaction
              </button>
              
              <button
                onClick={() => navigateToPage('transfer')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isTransferPage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-exchange-alt mr-2"></i>
                Transfer
              </button>
              
              <button
                onClick={() => navigateToPage('address-tags')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isAddressTagsPage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-tags mr-2"></i>
                Address Tags
              </button>
              
              <button
                onClick={() => navigateToPage('contract-reader')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isContractReaderPage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-code mr-2"></i>
                Contract Reader
              </button>
              
              <button
                onClick={() => navigateToPage('token-balance')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isTokenBalancePage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-coins mr-2"></i>
                Token Balance
              </button>
              
              <button
                onClick={() => navigateToPage('advanced-token-balance')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isAdvancedTokenBalancePage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-file-upload mr-2"></i>
                Advanced Balance
              </button>
              
              <button
                onClick={() => navigateToPage('block-analytics')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isBlockAnalyticsPage
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <i className="fas fa-chart-line mr-2"></i>
                Block Analytics
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main>
        {isRootPage && (
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-6xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                <i className="fas fa-search mr-4"></i>
                Transaction Viewer
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                Blockchain Explorer for Ethereum-compatible Networks
              </p>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 justify-center">
                  <button
                    onClick={() => navigateToPage('transaction')}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-file-invoice mr-2"></i>
                    View Transaction
                  </button>
                  <button
                    onClick={() => navigateToPage('transfer')}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-exchange-alt mr-2"></i>
                    Transfer Logs
                  </button>
                  <button
                    onClick={() => navigateToPage('address-tags')}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-tags mr-2"></i>
                    Address Tags
                  </button>
                  <button
                    onClick={() => navigateToPage('contract-reader')}
                    className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-code mr-2"></i>
                    Contract Reader
                  </button>
                  <button
                    onClick={() => navigateToPage('token-balance')}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-coins mr-2"></i>
                    Token Balance
                  </button>
                  <button
                    onClick={() => navigateToPage('advanced-token-balance')}
                    className="px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-file-upload mr-2"></i>
                    Advanced Balance
                  </button>
                  <button
                    onClick={() => navigateToPage('block-analytics')}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 flex items-center"
                  >
                    <i className="fas fa-chart-line mr-2"></i>
                    Block Analytics
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {isTransactionPage && <TransactionPage txHash={txParam} />}
        {isTransferPage && <TransferPage />}
        {isAddressTagsPage && <AddressTagsPage />}
        {isContractReaderPage && <ContractReaderPage />}
        {isTokenBalancePage && <TokenBalancePage />}
        {isAdvancedTokenBalancePage && <AdvancedTokenBalancePage />}
        {isBlockAnalyticsPage && <BlockAnalyticsPage />}
      </main>
    </div>
  );
}