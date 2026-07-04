// Content script for LinkedIn feed interaction
console.log('Content script loaded on:', window.location.href);

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
  
  // Start observing for comment inputs (for Generate Response button)
  observeAllCommentInputs();
}

function injectButtonStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .trolledin-generate-response-button {
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
    }
  `;
  document.head.appendChild(style);
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

function addGenerateResponseButton(commentInput, post) {
  // Check if button already exists
  if (commentInput.parentElement.querySelector('.trolledin-generate-response-button')) {
    return;
  }
  
  const button = document.createElement('button');
  button.textContent = 'Generate Response';
  button.className = 'trolledin-generate-response-button';
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
  
  button.addEventListener('click', async () => {
    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Generating...';
    button.disabled = true;
    
    try {
      // Extract post data
      const postData = extractPostData(post);
      console.log('Sending to API:', JSON.stringify(postData, null, 2));
      
      // Call the API
      const response = await fetch('http://localhost:8000/generate-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: postData.content,
          user: postData.author_url
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('API response:', JSON.stringify(result, null, 2));
      
      // Randomly select one comment
      if (result.comments && result.comments.length > 0) {
        const randomIndex = Math.floor(Math.random() * result.comments.length);
        const selectedComment = result.comments[randomIndex].comment;
        
        // Write the selected comment to the input field
        writeComment(post, selectedComment);
      } else {
        console.error('No comments returned from API');
      }
    } catch (error) {
      console.error('Error generating response:', error);
    } finally {
      // Reset button
      button.textContent = originalText;
      button.disabled = false;
    }
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
            addGenerateResponseButton(commentInput, post);
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
      addGenerateResponseButton(commentInput, post);
    }
  }, 100);
}

// Global observer to detect when user manually clicks Comment button
function observeAllCommentInputs() {
  console.log('Starting observer for comment inputs');
  const globalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if the added node or its children contain the comment input
          const commentInput = node.querySelector?.('div[contenteditable="true"][aria-label="Text editor for creating comment"]') ||
                               (node.matches?.('div[contenteditable="true"][aria-label="Text editor for creating comment"]') ? node : null);
          
          if (commentInput) {
            console.log('Found comment input:', commentInput);
            // Find the post this input belongs to
            let post = commentInput.closest('.trolledin-post-marker');
            if (!post) {
              // If not marked, try to find the closest post container with more selectors
              post = commentInput.closest('[data-urn], [data-id], .feed-shared-update-v2, .feed-shared-update, article, .feed-shared-update-v2__comment-list, .feed-shared-update-v2__comments-container');
            }
            
            // If still not found, try going up the DOM tree to find a container with post-like content
            if (!post) {
              let parent = commentInput.parentElement;
              let depth = 0;
              while (parent && depth < 15) {
                const text = parent.textContent || '';
                const hasFollow = text.includes('Follow') || text.includes('+ Follow');
                const hasLike = text.includes('Like');
                const hasComment = text.includes('Comment');
                const hasRepost = text.includes('Repost');
                const indicators = [hasFollow, hasLike, hasComment, hasRepost].filter(Boolean).length;
                
                // Also check for profile URL
                const hasProfileUrl = parent.querySelector('a[href*="/in/"]');
                
                if (indicators >= 2 && text.trim().length >= 300 && hasProfileUrl) {
                  post = parent;
                  console.log('Found post via DOM traversal at depth', depth);
                  break;
                }
                parent = parent.parentElement;
                depth++;
              }
            }
            
            console.log('Found post:', post);
            if (post) {
              addGenerateResponseButton(commentInput, post);
            } else {
              console.log('Could not find post for comment input, skipping button addition');
            }
          }
        }
      });
    });
  });
  
  globalObserver.observe(document.body, { childList: true, subtree: true });
  console.log('Observer started on document.body');
}

