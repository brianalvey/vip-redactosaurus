// VIP Tour Anonymizer - Background Service Worker

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('VIP Tour Anonymizer installed');
    
    // Set default enabled state
    chrome.storage.local.set({ enabled: true });
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('VIP Tour Anonymizer started');
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggle') {
    // Store the enabled state
    chrome.storage.local.set({ enabled: request.enabled });
    
    // Notify all tabs about the toggle
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'toggle',
          enabled: request.enabled
        }).catch(() => {
          // Tab might not have content script loaded, ignore
        });
      });
    });
    
    sendResponse({ success: true });
  } else if (request.action === 'getStatus') {
    chrome.storage.local.get(['enabled'], (result) => {
      sendResponse({ enabled: result.enabled !== false });
    });
    return true; // Keep message channel open for async response
  }
});

// Handle tab updates to ensure content script is injected
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && tab.url.startsWith('http')) {
    // Content script is injected via manifest, but we can add additional logic here if needed
  }
}); 