import React, { useState, useEffect } from 'react';

// Helper functions for local storage
const getStoredTags = () => {
  try {
    const stored = localStorage.getItem('addressTags');
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error loading stored tags:', error);
    return {};
  }
};

const saveTagsToStorage = (tags) => {
  try {
    localStorage.setItem('addressTags', JSON.stringify(tags));
  } catch (error) {
    console.error('Error saving tags:', error);
  }
};

// Copy button component
const CopyAddressButton = ({ address, className = "", iconClass = "fa-regular fa-copy" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`${className} ${copied ? 'text-green-500' : ''}`}
      title={copied ? 'Copied!' : 'Copy address'}
    >
      <i className={copied ? 'fa-solid fa-check' : iconClass}></i>
    </button>
  );
};

export default function AddressTagsPage() {
  const [addressTags, setAddressTags] = useState({});
  const [newAddress, setNewAddress] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNotes, setEditingNotes] = useState(null);
  const [tempNotes, setTempNotes] = useState('');

  // Load stored tags on component mount
  useEffect(() => {
    const storedTags = getStoredTags();
    setAddressTags(storedTags);
  }, []);

  // Clear messages after 3 seconds
  useEffect(() => {
    if (error || successMessage) {
      const timer = setTimeout(() => {
        setError('');
        setSuccessMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, successMessage]);

  // Validate and normalize address
  const normalizeAddress = (address) => {
    if (!address) return null;
    
    // Remove whitespace and convert to lowercase
    const cleaned = address.trim().toLowerCase();
    
    // Check if it's a valid Ethereum address format
    if (!/^0x[a-f0-9]{40}$/i.test(cleaned)) {
      return null;
    }
    
    return cleaned;
  };

  // Add or update a tag for an address
  const handleAddTag = () => {
    setError('');
    setSuccessMessage('');

    if (!newAddress.trim()) {
      setError('Please enter an address');
      return;
    }

    if (!newTag.trim()) {
      setError('Please enter a tag');
      return;
    }

    const normalizedAddress = normalizeAddress(newAddress);
    if (!normalizedAddress) {
      setError('Please enter a valid Ethereum address (0x followed by 40 hex characters)');
      return;
    }

    const updatedTags = {
      ...addressTags,
      [normalizedAddress]: {
        tag: newTag.trim(),
        notes: newNotes.trim(),
        dateAdded: new Date().toISOString(),
        originalAddress: newAddress.trim() // Keep original casing for display
      }
    };

    setAddressTags(updatedTags);
    saveTagsToStorage(updatedTags);
    
    setNewAddress('');
    setNewTag('');
    setNewNotes('');
    setSuccessMessage(`Tag "${newTag.trim()}" added for address ${normalizedAddress}`);
  };

  // Remove a tag
  const handleRemoveTag = (address) => {
    const updatedTags = { ...addressTags };
    delete updatedTags[address];
    
    setAddressTags(updatedTags);
    saveTagsToStorage(updatedTags);
    setSuccessMessage('Tag removed successfully');
  };

  // Update notes for an address
  const handleUpdateNotes = (address, newNotesValue) => {
    const updatedTags = {
      ...addressTags,
      [address]: {
        ...addressTags[address],
        notes: newNotesValue.trim(),
        lastModified: new Date().toISOString()
      }
    };

    setAddressTags(updatedTags);
    saveTagsToStorage(updatedTags);
    setEditingNotes(null);
    setTempNotes('');
    setSuccessMessage('Notes updated successfully');
  };

  // Start editing notes
  const startEditingNotes = (address) => {
    setEditingNotes(address);
    setTempNotes(addressTags[address]?.notes || '');
  };

  // Cancel editing notes
  const cancelEditingNotes = () => {
    setEditingNotes(null);
    setTempNotes('');
  };

  // Export data as CSV
  const handleExportCSV = () => {
    if (Object.keys(addressTags).length === 0) {
      setError('No tagged addresses to export');
      return;
    }

    const csvHeaders = ['Address', 'Tag', 'Notes', 'Date Added', 'Last Modified'];
    const csvRows = Object.entries(addressTags).map(([address, data]) => [
      data.originalAddress || address,
      data.tag,
      data.notes || '',
      new Date(data.dateAdded).toLocaleString(),
      data.lastModified ? new Date(data.lastModified).toLocaleString() : ''
    ]);

    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `address-tags-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setSuccessMessage(`Exported ${Object.keys(addressTags).length} tagged addresses to CSV`);
  };

  // Filter addresses based on search query
  const filteredAddresses = Object.entries(addressTags).filter(([address, data]) => {
    const query = searchQuery.toLowerCase();
    return (
      address.toLowerCase().includes(query) ||
      data.tag.toLowerCase().includes(query) ||
      (data.notes && data.notes.toLowerCase().includes(query))
    );
  });

  // Sort addresses by date added (newest first)
  const sortedAddresses = filteredAddresses.sort((a, b) => {
    return new Date(b[1].dateAdded) - new Date(a[1].dateAdded);
  });

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">
          <i className="fas fa-tags mr-3"></i>
          Address Tags
        </h1>

        {/* Add New Tag Section */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <i className="fas fa-plus mr-2"></i>
            Add New Tag
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="address" className="block text-sm font-medium mb-1">
                Address
              </label>
              <input
                type="text"
                id="address"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 font-mono text-sm"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="0x1234567890123456789012345678901234567890"
              />
            </div>
            
            <div>
              <label htmlFor="tag" className="block text-sm font-medium mb-1">
                Tag
              </label>
              <input
                type="text"
                id="tag"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="e.g., My Wallet, Exchange, DeFi Protocol"
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              />
            </div>
          </div>
          
          <div className="mb-4">
            <label htmlFor="notes" className="block text-sm font-medium mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 resize-vertical"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Add any additional notes about this address..."
              rows={3}
            />
          </div>
          
          <button
            onClick={handleAddTag}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 font-semibold"
          >
            <i className="fas fa-tag mr-2"></i>
            Add Tag
          </button>

          {/* Messages */}
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-700">
              <i className="fas fa-exclamation-circle mr-2"></i>
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="mt-4 p-3 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded-lg border border-green-200 dark:border-green-700">
              <i className="fas fa-check-circle mr-2"></i>
              {successMessage}
            </div>
          )}
        </div>

        {/* Tagged Addresses Section */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <h2 className="text-xl font-semibold mb-4 md:mb-0 flex items-center">
              <i className="fas fa-list mr-2"></i>
              Tagged Addresses ({Object.keys(addressTags).length})
            </h2>
            
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
              {/* Export Button */}
              {Object.keys(addressTags).length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-200 font-medium"
                  title="Export to CSV"
                >
                  <i className="fas fa-download mr-2"></i>
                  Export CSV
                </button>
              )}
              
              {/* Search */}
              <div className="w-full md:w-auto">
                <input
                  type="text"
                  className="w-full md:w-64 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search addresses, tags, or notes..."
                />
              </div>
            </div>
          </div>

          {sortedAddresses.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {Object.keys(addressTags).length === 0 ? (
                <>
                  <i className="fas fa-tags text-4xl mb-4"></i>
                  <p className="text-lg">No tagged addresses yet</p>
                  <p>Add your first address tag above to get started</p>
                </>
              ) : (
                <>
                  <i className="fas fa-search text-4xl mb-4"></i>
                  <p className="text-lg">No addresses match your search</p>
                  <p>Try a different search term</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Tag</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Address</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Notes</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Date Added</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAddresses.map(([address, data]) => (
                    <tr key={address} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          <i className="fas fa-tag mr-1"></i>
                          {data.tag}
                        </span>
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm break-all">
                            {data.originalAddress || address}
                          </span>
                          <CopyAddressButton 
                            address={address} 
                            className="text-gray-400 hover:text-green-500 transition-colors cursor-pointer" 
                            iconClass="fa-regular fa-copy text-sm" 
                          />
                        </div>
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                        {editingNotes === address ? (
                          <div className="space-y-2">
                            <textarea
                              value={tempNotes}
                              onChange={(e) => setTempNotes(e.target.value)}
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 resize-vertical text-sm"
                              rows={2}
                              placeholder="Add notes..."
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleUpdateNotes(address, tempNotes)}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                              >
                                <i className="fas fa-check mr-1"></i>Save
                              </button>
                              <button
                                onClick={cancelEditingNotes}
                                className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition-colors"
                              >
                                <i className="fas fa-times mr-1"></i>Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between group">
                            <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 pr-2">
                              {data.notes || (
                                <span className="italic">No notes</span>
                              )}
                            </span>
                            <button
                              onClick={() => startEditingNotes(address)}
                              className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-all"
                              title="Edit notes"
                            >
                              <i className="fas fa-edit text-sm"></i>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-sm">
                        <div>
                          {new Date(data.dateAdded).toLocaleDateString()} {new Date(data.dateAdded).toLocaleTimeString()}
                        </div>
                        {data.lastModified && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Modified: {new Date(data.lastModified).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                        <button
                          onClick={() => handleRemoveTag(address)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Remove tag"
                        >
                          <i className="fas fa-trash text-sm"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
