// VIP Redactosaurus - Popup Interface Script

document.addEventListener('DOMContentLoaded', function() {
  console.log('[VIP Redactosaurus Popup] Initializing...');
  
  // DOM elements
  const toggleSwitch = document.getElementById('toggleSwitch');
  const wakeLockSwitch = document.getElementById('wakeLockSwitch');
  const status = document.getElementById('status');
  const processedCount = document.getElementById('processedCount');
  const uptime = document.getElementById('uptime');
  
  // State
  let isEnabled = false;
  let wakeLockEnabled = false;
  let wakeLock = null;
  let startTime = Date.now();
  
  // Initialize popup
  init();
  
  // Add toggle functionality
  toggleSwitch.addEventListener('click', handleToggle);
  wakeLockSwitch.addEventListener('click', handleWakeLockToggle);
  
  // Update uptime every second
  setInterval(updateUptime, 1000);

  // Handle visibility change to restore wake lock
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && wakeLockEnabled && !wakeLock) {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => {
            console.log('Wake lock released');
            wakeLock = null;
            wakeLockEnabled = false;
            updateUI();
          });
          console.log('Wake lock restored');
        }
      } catch (error) {
        console.error('Failed to restore wake lock:', error);
      }
    }
  });
  
  async function init() {
    try {
      console.log('[VIP Redactosaurus Popup] Loading status...');
      await loadStatus();
      updateUptime();
    } catch (error) {
      console.error('[VIP Redactosaurus Popup] Initialization error:', error);
      showError('Failed to load extension status');
    }
  }
  
  async function loadStatus() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'getStatus'
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success !== false) {
          isEnabled = response.enabled || false;
          wakeLockEnabled = response.wakeLockEnabled || false;
          
          if (response.installDate) {
            startTime = response.installDate;
          }
          
          updateUI();
          resolve(response);
          
          console.log('[VIP Redactosaurus Popup] Status loaded:', {
            enabled: isEnabled,
            wakeLockEnabled: wakeLockEnabled,
            installDate: response.installDate
          });
        } else {
          reject(new Error('Invalid response from background script'));
        }
      });
    });
  }
  
  async function handleToggle() {
    const newState = !isEnabled;
    
    try {
      console.log('[VIP Redactosaurus Popup] Toggling to:', newState);
      
      // Update UI immediately for responsiveness
      isEnabled = newState;
      updateUI(true);
      
      // Send toggle message to background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'toggle',
          enabled: newState
        }, resolve);
      });
      
      if (response && response.success) {
        console.log('[VIP Redactosaurus Popup] Toggle successful:', response);
        // UI is already updated
      } else {
        throw new Error('Toggle failed: ' + (response?.error || 'Unknown error'));
      }
      
    } catch (error) {
      console.error('[VIP Redactosaurus Popup] Toggle error:', error);
      
      // Revert state on error
      isEnabled = !newState;
      updateUI();
      showError('Failed to toggle anonymization');
    }
  }

  async function handleWakeLockToggle() {
    const newState = !wakeLockEnabled;
    
    try {
      console.log('[VIP Redactosaurus Popup] Toggling wake lock to:', newState);
      
      if (newState) {
        // Enable wake lock
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => {
            console.log('Wake lock released');
            wakeLock = null;
            wakeLockEnabled = false;
            updateUI();
          });
          wakeLockEnabled = true;
          console.log('Wake lock active');
        } else {
          showError('Wake lock not supported in this browser');
          return;
        }
      } else {
        // Disable wake lock
        if (wakeLock) {
          await wakeLock.release();
          wakeLock = null;
        }
        wakeLockEnabled = false;
        console.log('Wake lock inactive');
      }
      
      // Update UI
      updateUI();
      
      // Save state to background script
      chrome.runtime.sendMessage({
        action: 'updateWakeLock',
        enabled: wakeLockEnabled
      });
      
    } catch (error) {
      console.error('[VIP Redactosaurus Popup] Wake lock error:', error);
      showError('Failed to toggle wake lock');
    }
  }
  
  function updateUI(processing = false) {
    // Update anonymization toggle switch
    if (isEnabled) {
      toggleSwitch.classList.add('active');
    } else {
      toggleSwitch.classList.remove('active');
    }
    
    // Update wake lock toggle switch
    if (wakeLockEnabled) {
      wakeLockSwitch.classList.add('active');
    } else {
      wakeLockSwitch.classList.remove('active');
    }
    
    // Update status
    status.classList.remove('loading', 'enabled', 'disabled', 'processing');
    
    if (processing) {
      status.classList.add('processing');
      status.textContent = 'Processing...';
    } else if (isEnabled) {
      status.classList.add('enabled');
      status.textContent = '🛡️ Anonymization is ACTIVE';
    } else {
      status.classList.add('disabled');
      status.textContent = '⚠️ Anonymization is DISABLED';
    }
    
    // Update processed count (placeholder for now)
    processedCount.textContent = `Elements: ${isEnabled ? 'Active' : 'Inactive'}`;
  }
  
  function updateUptime() {
    const now = Date.now();
    const diff = now - startTime;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    let uptimeText;
    if (days > 0) {
      uptimeText = `Uptime: ${days}d ${hours}h`;
    } else if (hours > 0) {
      uptimeText = `Uptime: ${hours}h ${minutes}m`;
    } else {
      uptimeText = `Uptime: ${minutes}m`;
    }
    
    uptime.textContent = uptimeText;
  }
  
  function showError(message) {
    status.classList.remove('loading', 'enabled', 'disabled', 'processing');
    status.classList.add('disabled');
    status.textContent = `❌ ${message}`;
    
    // Clear error after 3 seconds
    setTimeout(() => {
      updateUI();
    }, 3000);
  }
  
  // Handle background script messages (if any)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[VIP Redactosaurus Popup] Message received:', request);
    
    switch (request.action) {
      case 'statusUpdate':
        isEnabled = request.enabled;
        updateUI();
        break;
        
      default:
        console.log('[VIP Redactosaurus Popup] Unknown message action:', request.action);
    }
  });
});