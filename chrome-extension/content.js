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
      
      // Skip if immediate parent is marked (prevents direct nested duplicates)
      // But don't check all ancestors - that was too aggressive and blocked other posts
      const immediateParent = div.parentElement;
      if (immediateParent && immediateParent.classList.contains('trolledin-post-marker')) {
        continue;
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
            posts.push(div);
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
  button.style.cssText = `
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
          button.style.cssText = `
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

function extractTimestamp(post) {
  const selectors = [
    '.feed-shared-actor__sub-description',
    '.update-components-actor__sub-description',
    'span[aria-label*="ago"]'
  ];
  
  for (const selector of selectors) {
    const element = post.querySelector(selector);
    if (element) {
      return element.textContent.trim();
    }
  }
  
  return 'Unknown Time';
}

function extractLikes(post) {
  const selectors = [
    '[data-testid="social-actions__reaction-count"]',
    '.social-details-social-counts__reactions-count',
    'span[aria-label*="reaction"]'
  ];
  
  for (const selector of selectors) {
    const element = post.querySelector(selector);
    if (element) {
      return element.textContent.trim();
    }
  }
  
  return '0';
}

function extractComments(post) {
  const selectors = [
    '[data-testid="social-actions__comments-count"]',
    '.social-details-social-counts__comments-count'
  ];
  
  for (const selector of selectors) {
    const element = post.querySelector(selector);
    if (element) {
      return element.textContent.trim();
    }
  }
  
  const commentMatch = post.outerHTML.match(/(\d+)\s*comments?/i);
  return commentMatch ? commentMatch[1] : '0';
}

function extractReposts(post) {
  const selectors = [
    '[data-testid="social-actions__repost-count"]',
    '.social-details-social-counts__comments-count'
  ];
  
  for (const selector of selectors) {
    const element = post.querySelector(selector);
    if (element) {
      return element.textContent.trim();
    }
  }
  
  const repostMatch = post.outerHTML.match(/(\d+)\s*reposts?/i);
  return repostMatch ? repostMatch[1] : '0';
}

function extractUrl(post) {
  // Try to find data-urn or data-id attributes first (most reliable)
  const dataUrn = post.getAttribute('data-urn') || post.querySelector('[data-urn]')?.getAttribute('data-urn');
  const dataId = post.getAttribute('data-id') || post.querySelector('[data-id]')?.getAttribute('data-id');
  
  if (dataUrn) {
    // Extract activity ID from URN (format: urn:li:activity:1234567890)
    const activityMatch = dataUrn.match(/urn:li:activity:(\d+)/);
    if (activityMatch) {
      return `https://www.linkedin.com/feed/update/urn:li:activity:${activityMatch[1]}/`;
    }
  }
  
  if (dataId) {
    // Try to use data-id
    return `https://www.linkedin.com/feed/update/${dataId}/`;
  }
  
  // Try to find a direct link to the post
  const link = post.querySelector('a[href*="/posts/"], a[href*="/activity/"]');
  if (link) {
    return link.href;
  }
  
  // Try to find any link within the post that might be the post URL
  const allLinks = post.querySelectorAll('a[href]');
  for (const a of allLinks) {
    const href = a.href;
    if (href.includes('linkedin.com') && (href.includes('feed/update') || href.includes('posts') || href.includes('activity'))) {
      return href;
    }
  }
  
  // Return empty string if no URL found (better than returning wrong feed URL)
  return '';
}
