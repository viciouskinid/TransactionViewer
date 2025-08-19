import React, { useState, useEffect } from 'react';
import TransactionPage from './pages/Transaction';
import TransferPage from './pages/Transfer';

export default function App() {
  // Routing based on pathname
  const pathname = window.location.pathname;
  const isTransactionPage = pathname.startsWith('/transaction');
  const isTransferPage = pathname.startsWith('/transfer');

  // Navigation function
  const navigateToPage = (page) => {
    const newPath = `/${page}`;
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
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main>
        {isTransactionPage && <TransactionPage txHash={txParam} />}
        {isTransferPage && <TransferPage />}
      </main>
    </div>
  );
}