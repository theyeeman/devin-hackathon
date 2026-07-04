// Content script for LinkedIn feed interaction
console.log('Content script loaded on:', window.location.href);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'reAddButtons') {
    console.log('Manual re-add buttons requested');
    addButtonsToPosts();
    sendResponse({ success: true });
  }
});

// Only run on main feed
if (!window.location.href.includes('linkedin.com/feed/')) {
  console.log('Not on LinkedIn feed, skipping');
} else {
  console.log('On LinkedIn feed, initializing buttons');
  // Delay button insertion to let LinkedIn finish initial rendering
  setTimeout(() => {
    initializeInlineButtons();
  }, 1000);
}

function initializeInlineButtons() {
  // Inject CSS for buttons
  injectButtonStyles();
  
  // Add buttons to existing posts
  addButtonsToPosts();
  
  // Start observing for comment inputs (for Write Comment button)
  observeAllCommentInputs();
  
  // Observe for new posts (infinite scroll)
  observeNewPosts();
}

function injectButtonStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .trolledin-read-button {
      background: #dc2626 !important;
      color: white !important;
      border: none !important;
      padding: 8px 16px !important;
      border-radius: 16px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      margin: 4px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      z-index: 99999 !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      text-transform: none !important;
      letter-spacing: normal !important;
    }
    .trolledin-read-button:hover {
      background: #b91c1c !important;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
    }
    .trolledin-read-button:disabled {
      background: #9ca3af !important;
      cursor: not-allowed !important;
    }
    .trolledin-spinner {
      width: 14px !important;
      height: 14px !important;
      border: 2px solid #ffffff !important;
      border-top: 2px solid transparent !important;
      border-radius: 50% !important;
      animation: trollspin 1s linear infinite !important;
    }
    @keyframes trollspin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function addButtonsToPosts() {
  // Try multiple selector strategies to find posts
  const selectorStrategies = [
    '[data-urn]',
    '[data-id]', 
    '.feed-shared-update-v2',
    '.feed-shared-update',
    '[data-test-id="feed-update"]',
    'article',
    '.occludable-update'
  ];
  
  let posts = [];
  let usedSelector = '';
  
  for (const selector of selectorStrategies) {
    const found = document.querySelectorAll(selector);
    if (found.length > 0) {
      posts = found;
      usedSelector = selector;
      break;
    }
  }
  
  // If still no posts, try a broader approach
  if (posts.length === 0) {
    // Look for elements that might be posts by checking for common post content
    const allDivs = document.querySelectorAll('div');
    
    // Try to find divs that contain "Follow" buttons (likely posts)
    // But be more selective - look for actual post containers
    for (const div of allDivs) {
      // Skip if this div is already marked as having a button (prevents nested duplicates)
      if (div.classList.contains('trolledin-post-marker')) {
        continue;
      }
      
      // Skip if any ancestor is marked (prevents nested duplicates within same post)
      // Limit depth to 5 to avoid blocking unrelated posts
      let ancestor = div.parentElement;
      let depth = 0;
      let hasMarkedAncestor = false;
      while (ancestor && depth < 5) {
        if (ancestor.classList.contains('trolledin-post-marker')) {
          hasMarkedAncestor = true;
          break;
        }
        ancestor = ancestor.parentElement;
        depth++;
      }
      if (hasMarkedAncestor) {
        continue; // Skip this div, it's nested within a marked post
      }
      
      const text = div.textContent;
      const textLower = text.toLowerCase();
      
      // Skip if this looks like a reaction bar (only has action buttons)
      const actionWords = ['like', 'comment', 'repost', 'send'];
      const actionWordCount = actionWords.filter(word => textLower.includes(word)).length;
      const totalWords = text.split(/\s+/).length;
      
      // If it's mostly action words and very little other content, skip it
      if (actionWordCount >= 3 && totalWords < 20) {
        continue; // Skip reaction bars
      }
      
      // Must have multiple post indicators to reduce false positives
      const hasFollow = text.includes('Follow') || text.includes('+ Follow');
      const hasLike = text.includes('Like');
      const hasComment = text.includes('Comment');
      const hasRepost = text.includes('Repost') || text.includes('Repost');
      
      // Only consider it a post if it has at least 2 of these indicators
      const indicators = [hasFollow, hasLike, hasComment, hasRepost].filter(Boolean).length;
      
      if (indicators >= 2 && !div.querySelector('.trolledin-read-button')) {
        // Also check that it's not too small (likely a button itself)
        if (div.offsetHeight > 50 && div.offsetWidth > 200) {
          // Check minimum content length to avoid false positives (at least 300 characters)
          if (text.trim().length >= 300) {
            // Must contain a profile URL (linkedin.com/in/*) to be a valid post
            const hasProfileUrl = div.querySelector('a[href*="/in/"]');
            if (hasProfileUrl) {
              posts.push(div);
            }
          }
        }
      }
    }
  }
  
  posts.forEach(post => {
    // Skip if button already exists (check for our button by text content)
    const existingButtons = post.querySelectorAll('button');
    for (const btn of existingButtons) {
      if (btn.textContent.includes('Read Contents')) {
        return; // Skip this post, button already exists
      }
    }
    
    // Apply character filter to all posts (not just fallback detection)
    const text = post.textContent || '';
    if (text.trim().length < 300) {
      return; // Skip posts with less than 300 characters
    }
    
    addReadButton(post);
  });
}

function getButtonStyles() {
  return `
    background: #dc2626 !important;
    color: white !important;
    padding: 8px 16px !important;
    border-radius: 16px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
    margin: 4px !important;
    position: relative !important;
    z-index: 999999 !important;
    border: none !important;
    text-decoration: none !important;
    pointer-events: auto !important;
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    visibility: visible !important;
    opacity: 1 !important;
  `;
}

function addReadButton(post) {
  // Insert button directly into the post's DOM so it scrolls naturally
  const button = createReadButton(post);
  
  const buttonId = 'trolledin-btn-' + Math.random().toString(36).substr(2, 9);
  button.id = buttonId;
  
  // Mark the post AFTER button insertion to avoid nested detection issues
  post.classList.add('trolledin-post-marker');
  
  // Try to find a good insertion point
  const followButton = findFollowButton(post);
  
  if (followButton && followButton.parentNode) {
    // Insert next to Follow button
    followButton.parentNode.insertBefore(button, followButton.nextSibling);
  } else {
    // Fallback: insert at the beginning of the post
    post.insertBefore(button, post.firstChild);
  }
  
  // Apply strong inline styles to protect from LinkedIn CSS
  button.style.cssText = getButtonStyles();
  
  // Use MutationObserver to protect button from removal
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === button || (node.contains && node.contains(button))) {
          // Re-insert the button
          if (followButton && followButton.parentNode) {
            followButton.parentNode.insertBefore(button, followButton.nextSibling);
          } else {
            post.insertBefore(button, post.firstChild);
          }
          // Re-apply styles
          button.style.cssText = getButtonStyles();
        }
      });
    });
  });
  
  observer.observe(post, { childList: true, subtree: true });
  
  // Store observer on button for cleanup
  button._observer = observer;
}

function findFollowButton(post) {
  // Try multiple ways to find the Follow button
  // 1. By text content
  const allButtons = post.querySelectorAll('button, a');
  for (const btn of allButtons) {
    if (btn.textContent.trim() === 'Follow' || btn.textContent.trim() === '+ Follow') {
      return btn;
    }
  }
  
  // 2. By aria-label
  const ariaButtons = post.querySelectorAll('[aria-label*="Follow" i], [aria-label*="follow" i]');
  if (ariaButtons.length > 0) {
    return ariaButtons[0];
  }
  
  // 3. By data-testid
  const dataTestButton = post.querySelector('[data-testid*="follow" i]');
  if (dataTestButton) {
    return dataTestButton;
  }
  
  return null;
}

function createReadButton(post) {
  const button = document.createElement('button');
  button.innerHTML = '<span>Read Contents</span>';
  button.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleReadClick(button, post);
  };
  return button;
}

function handleReadClick(button, post) {
  // Show loading state
  const originalContent = button.innerHTML;
  button.innerHTML = '<div class="trolledin-spinner"></div><span>Reading...</span>';
  button.disabled = true;
  
  // Extract post data
  const postData = extractPostData(post);
  
  // Log to console
  console.log('Post data extracted:', JSON.stringify(postData, null, 2));
  
  // Send to background
  chrome.runtime.sendMessage({ action: 'postSelected', post: postData });
  
  // Reset button after short delay
  setTimeout(() => {
    button.innerHTML = originalContent;
    button.disabled = false;
  }, 500);
}

function observeNewPosts() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        // Check if any added nodes contain posts
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is a post or contains posts
            if (node.matches && (node.matches('[data-urn], [data-id], .feed-shared-update-v2') ||
                node.querySelector('[data-urn], [data-id], .feed-shared-update-v2'))) {
              addButtonsToPosts();
            }
            // Also check for posts using our content-based detection
            const text = node.textContent || '';
            const hasFollow = text.includes('Follow') || text.includes('+ Follow');
            const hasLike = text.includes('Like');
            const hasComment = text.includes('Comment');
            const hasRepost = text.includes('Repost');
            const indicators = [hasFollow, hasLike, hasComment, hasRepost].filter(Boolean).length;
            if (indicators >= 2) {
              addButtonsToPosts();
            }
          }
        });
      }
    });
  });
  
  // Start observing the document body
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function extractPostData(postElement) {
  const data = {
    author_url: extractAuthor(postElement),
    content: extractContent(postElement)
  };
  
  return data;
}

function extractAuthor(post) {
  // Try to find the LinkedIn profile URL of the author (not reactors)
  
  // Comprehensive list of reaction keywords to filter out
  const reactionKeywords = [
    'likes this', 'liked this', 'reacted', 'reacts',
    'supports this', 'supported this',
    'celebrates this', 'celebrated this',
    'loves this', 'loved this',
    'insightful', 'funny',
    'and others', 'others reacted',
    'commented', 'reposted'
  ];
  
  // Strategy 1: Look for profile link in the same container as the Follow button
  // The Follow button is always in the author section
  const followButton = post.querySelector('button[aria-label*="Follow" i], button[aria-label*="follow" i]');
  if (followButton) {
    // Look for a sibling or nearby profile link in the same container
    let container = followButton.parentElement;
    let depth = 0;
    while (container && container !== post && depth < 10) {
      // Check siblings first
      const siblings = container.parentElement?.children || [];
      for (const sibling of siblings) {
        if (sibling !== container) {
          const profileLink = sibling.querySelector('a[href*="/in/"]');
          if (profileLink) {
            const match = profileLink.href.match(/https:\/\/www\.linkedin\.com\/in\/[^\/]+/);
            if (match) {
              return match[0];
            }
          }
        }
      }
      // Check current container
      const profileLink = container.querySelector('a[href*="/in/"]');
      if (profileLink) {
        const match = profileLink.href.match(/https:\/\/www\.linkedin\.com\/in\/[^\/]+/);
        if (match) {
          return match[0];
        }
      }
      container = container.parentElement;
      depth++;
    }
  }
  
  // Strategy 2: Look for the first profile link that appears BEFORE the post content
  // Author info is always before the actual post text
  const contentSelectors = [
    '[data-testid="expandable-text-box"]',
    '.feed-shared-text',
    '.update-components-text',
    '.feed-shared-update-v2__description'
  ];
  
  for (const selector of contentSelectors) {
    const contentElement = post.querySelector(selector);
    if (contentElement) {
      // Get all elements before this content element
      const allElements = post.querySelectorAll('*');
      for (const el of allElements) {
        if (el === contentElement) break;
        if (el.tagName === 'A' && el.href && el.href.includes('/in/')) {
          const match = el.href.match(/https:\/\/www\.linkedin\.com\/in\/[^\/]+/);
          if (match) {
            return match[0];
          }
        }
      }
    }
  }
  
  // Strategy 3: Look for profile links that are NOT in reaction sections
  // Use comprehensive keyword list to filter out reactions
  const profileLinks = post.querySelectorAll('a[href*="/in/"]');
  for (const link of profileLinks) {
    // Check if this link is in a reaction section
    let parent = link.parentElement;
    let isReaction = false;
    while (parent && parent !== post) {
      const text = parent.textContent || '';
      // Check against all reaction keywords
      for (const keyword of reactionKeywords) {
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          isReaction = true;
          break;
        }
      }
      if (isReaction) break;
      parent = parent.parentElement;
    }
    
    if (!isReaction) {
      const match = link.href.match(/https:\/\/www\.linkedin\.com\/in\/[^\/]+/);
      if (match) {
        return match[0];
      }
    }
  }
  
  return '';
}

function extractContent(post) {
  const selectors = [
    '[data-testid="expandable-text-box"]',
    '.feed-shared-text',
    '.update-components-text',
    '.feed-shared-update-v2__description'
  ];
  
  for (const selector of selectors) {
    const element = post.querySelector(selector);
    if (element) {
      return element.textContent.trim();
    }
  }
  
  return post.textContent.substring(0, 5000).trim();
}

function findCommentButton(post) {
  // Find the Comment button within the post
  const buttons = post.querySelectorAll('button');
  for (const button of buttons) {
    const text = button.textContent.trim();
    if (text === 'Comment') {
      return button;
    }
  }
  return null;
}

function clickCommentButton(post) {
  const commentButton = findCommentButton(post);
  if (commentButton) {
    commentButton.click();
    // Start observing for the comment input to appear
    observeCommentInput(post);
    return true;
  }
  return false;
}

function findCommentInput(post) {
  // Wait for the comment input to appear after clicking the comment button
  // Look for the contenteditable div with aria-label "Text editor for creating comment"
  const input = post.querySelector('div[contenteditable="true"][aria-label="Text editor for creating comment"]');
  if (input) {
    return input;
  }
  
  // Fallback: look for p with data-placeholder "Add a comment..."
  const placeholder = post.querySelector('p[data-placeholder="Add a comment..."]');
  if (placeholder) {
    return placeholder.parentElement; // Return the parent contenteditable div
  }
  
  return null;
}

function writeComment(post, commentText) {
  const commentInput = findCommentInput(post);
  if (commentInput) {
    // Focus the input
    commentInput.focus();
    
    // Set the text content
    commentInput.textContent = commentText;
    
    // Trigger input events to ensure LinkedIn recognizes the change
    const inputEvent = new Event('input', { bubbles: true });
    commentInput.dispatchEvent(inputEvent);
    
    return true;
  }
  return false;
}

function addWriteCommentButton(commentInput, post) {
  // Check if button already exists
  if (commentInput.parentElement.querySelector('.trolledin-write-comment-button')) {
    return;
  }
  
  const button = document.createElement('button');
  button.textContent = 'Write Comment';
  button.className = 'trolledin-write-comment-button';
  button.style.cssText = `
    background: #0a66c2 !important;
    color: white !important;
    padding: 6px 12px !important;
    border-radius: 16px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    margin-left: 8px !important;
    border: none !important;
    white-space: nowrap !important;
  `;
  
  button.addEventListener('click', () => {
    writeComment(post, 'sample comment inserted');
  });
  
  // Insert button next to the comment input
  commentInput.parentElement.style.display = 'flex';
  commentInput.parentElement.style.alignItems = 'center';
  commentInput.parentElement.appendChild(button);
}

function observeCommentInput(post) {
  // Use MutationObserver to detect when comment input appears
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if the added node or its children contain the comment input
          const commentInput = node.querySelector?.('div[contenteditable="true"][aria-label="Text editor for creating comment"]') ||
                               (node.matches?.('div[contenteditable="true"][aria-label="Text editor for creating comment"]') ? node : null);
          
          if (commentInput) {
            addWriteCommentButton(commentInput, post);
          }
        }
      });
    });
  });
  
  observer.observe(post, { childList: true, subtree: true });
  
  // Also check immediately in case input already exists
  setTimeout(() => {
    const commentInput = findCommentInput(post);
    if (commentInput) {
      addWriteCommentButton(commentInput, post);
    }
  }, 100);
}

// Global observer to detect when user manually clicks Comment button
function observeAllCommentInputs() {
  const globalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if the added node or its children contain the comment input
          const commentInput = node.querySelector?.('div[contenteditable="true"][aria-label="Text editor for creating comment"]') ||
                               (node.matches?.('div[contenteditable="true"][aria-label="Text editor for creating comment"]') ? node : null);
          
          if (commentInput) {
            // Find the post this input belongs to
            let post = commentInput.closest('.trolledin-post-marker');
            if (!post) {
              // If not marked, try to find the closest post container
              post = commentInput.closest('[data-urn], [data-id], .feed-shared-update-v2, .feed-shared-update, article');
            }
            
            if (post) {
              addWriteCommentButton(commentInput, post);
            }
          }
        }
      });
    });
  });
  
  globalObserver.observe(document.body, { childList: true, subtree: true });
}

