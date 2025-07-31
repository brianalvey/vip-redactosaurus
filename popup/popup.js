// VIP Tour Anonymizer - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  
  // Load current status
  loadStatus();
  
  // Add click handler to toggle switch
  toggleSwitch.addEventListener('click', function() {
    const isCurrentlyEnabled = toggleSwitch.classList.contains('active');
    const newState = !isCurrentlyEnabled;
    
    // Update UI immediately for responsiveness
    updateUI(newState);
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'toggle',
      enabled: newState
    }, (response) => {
      if (response && response.success) {
        console.log('Toggle successful');
      } else {
        console.error('Toggle failed');
        // Revert UI if failed
        updateUI(!newState);
      }
    });
  });
  
  function loadStatus() {
    chrome.runtime.sendMessage({
      action: 'getStatus'
    }, (response) => {
      if (response) {
        updateUI(response.enabled);
      } else {
        // Default to enabled if no response
        updateUI(true);
      }
    });
  }
  
  function updateUI(enabled) {
    if (enabled) {
      toggleSwitch.classList.add('active');
      status.classList.add('enabled');
      status.classList.remove('disabled');
      statusText.textContent = 'Anonymization is ENABLED';
    } else {
      toggleSwitch.classList.remove('active');
      status.classList.add('disabled');
      status.classList.remove('enabled');
      statusText.textContent = 'Anonymization is DISABLED';
    }
  }
}); 