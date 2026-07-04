// Popup with manual re-add button functionality
let currentTab = null;

// Get current tab when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  currentTab = tabs[0];
  updateUI();
});

document.getElementById('reAddButtons').addEventListener('click', () => {
  if (!currentTab || !currentTab.url.includes('linkedin.com')) {
    document.getElementById('status').textContent = 'Please navigate to LinkedIn first';
    return;
  }
  
  // Send message to content script to re-add buttons
  chrome.tabs.sendMessage(currentTab.id, { action: 'reAddButtons' }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById('status').textContent = 'Error: ' + chrome.runtime.lastError.message;
    } else {
      document.getElementById('status').textContent = 'Buttons re-added!';
    }
  });
});

function updateUI() {
  if (currentTab && currentTab.url && currentTab.url.includes('linkedin.com')) {
    document.getElementById('status').textContent = 'Extension active on LinkedIn feed';
    document.getElementById('reAddButtons').disabled = false;
  } else {
    document.getElementById('status').textContent = 'Please navigate to LinkedIn';
    document.getElementById('reAddButtons').disabled = true;
  }
}
