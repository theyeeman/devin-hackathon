// Popup script
let currentTab = null;

// Get current tab when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  currentTab = tabs[0];
  updateUI();
});

function updateUI() {
  if (currentTab && currentTab.url && currentTab.url.includes('linkedin.com')) {
    document.getElementById('status').textContent = 'Extension active on LinkedIn feed';
  } else {
    document.getElementById('status').textContent = 'Please navigate to LinkedIn';
  }
}
