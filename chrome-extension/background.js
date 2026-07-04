// Background script for Chrome extension
let selectedPost = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'postSelected') {
    selectedPost = request.post;
    console.log('Post selected:', selectedPost);
    
    // Send to backend API
    sendToBackend(selectedPost);
    
    sendResponse({ success: true });
  } else if (request.action === 'getSelectedPost') {
    sendResponse({ post: selectedPost });
  } else if (request.action === 'clearSelection') {
    selectedPost = null;
    sendResponse({ success: true });
  }
});

async function sendToBackend(postData) {
  try {
    // For now, just log to console
    console.log('Sending post data to backend:', JSON.stringify(postData, null, 2));
    
    // TODO: Uncomment when backend is ready
    // const response = await fetch('http://localhost:8000/api/linkedin-post', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(postData)
    // });
    // const result = await response.json();
    // console.log('Backend response:', result);
  } catch (error) {
    console.error('Error sending to backend:', error);
  }
}
