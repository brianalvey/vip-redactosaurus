// VIP Tour Anonymizer - Content Script
// Runs at document_start to prevent flash of non-anonymized content

(function() {
  'use strict';

  // Configuration
  let config = null;
  let isEnabled = true;
  let observer = null;
  let tooltipObserverDelay = 1000; // ms to retry
  let processedElements = new WeakSet(); // Track processed elements to prevent re-anonymization
  let capturedValues = {}; // Store captured values from URL/XPath

  // Transformation functions
  const transformers = {
    // Scramble text while preserving case, punctuation, and spaces
    scramble: function(text, options = {}) {
      const { 
        preserveCase = true, 
        preservePunctuation = true, 
        preserveSpaces = true,
        preserveEnds = false,
        preservePosition = true
      } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      // If preserveEnds is enabled, use word-based scrambling
      if (preserveEnds) {
        return this.scrambleByWords(text, options);
      }
      
      // Original character-by-character scrambling
      const chars = text.split('');
      const scrambled = [];
      
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        
        if (preserveSpaces && char === ' ') {
          scrambled.push(' ');
        } else if (preservePunctuation && /[^\w\s]/.test(char)) {
          scrambled.push(char);
        } else if (/[a-zA-Z]/.test(char)) {
          // Scramble letters while preserving case
          const isUpperCase = char === char.toUpperCase();
          const randomChar = String.fromCharCode(
            isUpperCase ? 
              Math.floor(Math.random() * 26) + 65 : // A-Z
              Math.floor(Math.random() * 26) + 97    // a-z
          );
          scrambled.push(randomChar);
        } else if (/[0-9]/.test(char)) {
          // Scramble numbers
          scrambled.push(Math.floor(Math.random() * 10).toString());
        } else {
          scrambled.push(char);
        }
      }
      
      return scrambled.join('');
    },

    // Word-based scrambling that preserves first/last characters and can shuffle word positions
    scrambleByWords: function(text, options = {}) {
      const { 
        preserveCase = true, 
        preservePunctuation = true, 
        preserveSpaces = true,
        preservePosition = true
      } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      // Parse text into tokens (words, spaces, punctuation)
      const tokens = [];
      let currentToken = '';
      let tokenType = null; // 'word', 'space', 'punctuation'
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (/\s/.test(char)) {
          // Space character
          if (tokenType !== 'space') {
            if (currentToken) tokens.push({ type: tokenType, content: currentToken });
            currentToken = char;
            tokenType = 'space';
          } else {
            currentToken += char;
          }
        } else if (/[^\w\s]/.test(char)) {
          // Punctuation character
          if (tokenType !== 'punctuation') {
            if (currentToken) tokens.push({ type: tokenType, content: currentToken });
            currentToken = char;
            tokenType = 'punctuation';
          } else {
            currentToken += char;
          }
        } else {
          // Word character
          if (tokenType !== 'word') {
            if (currentToken) tokens.push({ type: tokenType, content: currentToken });
            currentToken = char;
            tokenType = 'word';
          } else {
            currentToken += char;
          }
        }
      }
      
      // Don't forget the last token
      if (currentToken) tokens.push({ type: tokenType, content: currentToken });
      
      // Scramble word contents and collect words for position shuffling
      const words = [];
      const processedTokens = tokens.map(token => {
        if (token.type === 'word') {
          const scrambledWord = this.scrambleWord(token.content, { preserveCase });
          words.push(scrambledWord);
          return { ...token, content: scrambledWord, originalIndex: words.length - 1 };
        }
        return token;
      });
      
      // Shuffle word positions if preservePosition is false
      if (!preservePosition && words.length > 1) {
        const shuffledWords = [...words];
        // Fisher-Yates shuffle
        for (let i = shuffledWords.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
        }
        
        // Replace words in tokens with shuffled versions
        let wordIndex = 0;
        processedTokens.forEach(token => {
          if (token.type === 'word') {
            token.content = shuffledWords[wordIndex];
            wordIndex++;
          }
        });
      }
      
      // Reconstruct the text
      return processedTokens.map(token => token.content).join('');
    },

    // Scramble individual word while preserving first and last characters
    scrambleWord: function(word, options = {}) {
      const { preserveCase = true } = options;
      
      if (!word || word.length <= 2) {
        return word; // Can't scramble words with 2 or fewer characters
      }
      
      const chars = word.split('');
      const first = chars[0];
      const last = chars[chars.length - 1];
      const middle = chars.slice(1, -1);
      
      // Scramble middle characters
      const scrambledMiddle = middle.map(char => {
        if (/[a-zA-Z]/.test(char)) {
          const isUpperCase = char === char.toUpperCase();
          return String.fromCharCode(
            isUpperCase ? 
              Math.floor(Math.random() * 26) + 65 : // A-Z
              Math.floor(Math.random() * 26) + 97    // a-z
          );
        } else if (/[0-9]/.test(char)) {
          return Math.floor(Math.random() * 10).toString();
        }
        return char;
      });
      
      return first + scrambledMiddle.join('') + last;
    },

    // Inject custom CSS rules into the document
    custom_css: function(options = {}) {
      try {
        const { cssRules = [] } = options;
        
        if (!cssRules || !Array.isArray(cssRules) || cssRules.length === 0) {
          console.warn('VIP Tour Anonymizer: No CSS rules provided for custom_css transformation');
          return;
        }
        
        // Ensure DOM is ready
        if (!document || (!document.head && !document.body)) {
          console.warn(`VIP Tour Anonymizer: DOM not ready for CSS injection, retrying in ${tooltipObserverDelay}ms`);
          setTimeout(() => transformers.custom_css(options), tooltipObserverDelay);
          return;
        }
        
        // Apply styles directly to elements (Vue-compatible approach)
        this.applyStylesDirectly(cssRules);
        
      } catch (error) {
        console.error('VIP Tour Anonymizer: Error in custom_css function:', error);
        throw error; // Re-throw so the main error handler can catch it
      }
    },
    

    
    // Apply styles directly to elements (Vue-compatible approach)
    applyStylesDirectly: function(cssRules) {
      try {
        // Create a persistent style element that Vue can't easily override
        const persistentStyleId = 'vip-anonymizer-persistent-styles';
        let persistentStyle = document.getElementById(persistentStyleId);
        if (!persistentStyle) {
          persistentStyle = document.createElement('style');
          persistentStyle.id = persistentStyleId;
          persistentStyle.setAttribute('data-vip-anonymizer', 'persistent');
          document.head.appendChild(persistentStyle);
        }
        
        // Build CSS with very high specificity to override Vue styles
        let cssText = '';
        cssRules.forEach((rule) => {
          if (rule.selector && rule.properties) {
            try {
              const elements = document.querySelectorAll(rule.selector);
              
              // Create CSS rule with maximum specificity
              const highSpecificitySelector = `html body ${rule.selector}`;
              cssText += `${highSpecificitySelector} {\n`;
              Object.entries(rule.properties).forEach(([property, value]) => {
                cssText += `  ${property}: ${value} !important;\n`;
              });
              cssText += '}\n';
              
              // Apply styles directly to existing elements and mark them
              elements.forEach((element) => {
                if (!element.hasAttribute('data-vip-styled')) {
                  Object.entries(rule.properties).forEach(([property, value]) => {
                    try {
                      element.style.setProperty(property, value, 'important');
                    } catch (error) {
                      // Silently ignore style application errors
                    }
                  });
                  // Mark element as styled to avoid reprocessing
                  element.setAttribute('data-vip-styled', 'true');
                }
              });
            } catch (error) {
              // Silently ignore invalid selectors to prevent performance issues
            }
          }
        });
        
        // Apply the CSS to the persistent style element
        persistentStyle.textContent = cssText;
        
        // Set up a lightweight mutation observer for new elements only (can be disabled for performance)
        if (config.globalOptions && config.globalOptions.enableVueObserver !== false) {
          this.setupVueCompatibleObserver(cssRules);
        }
        
      } catch (error) {
        console.warn('VIP Tour Anonymizer: Direct style application failed:', error);
      }
    },
    
    // Set up observer to handle Vue DOM updates (optimized for performance)
    setupVueCompatibleObserver: function(cssRules) {
      try {
        let reapplyTimeout = null;
        
        // Create a debounced mutation observer that re-applies styles when Vue updates the DOM
        const vueObserver = new MutationObserver((mutations) => {
          let shouldReapply = false;
          
          // Only reapply if there are significant changes
          for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              // Only reapply if new elements are added (not removed)
              for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  shouldReapply = true;
                  break;
                }
              }
            }
            if (shouldReapply) break;
          }
          
          // Debounce the reapplication to prevent excessive calls
          if (shouldReapply) {
            if (reapplyTimeout) {
              clearTimeout(reapplyTimeout);
            }
            reapplyTimeout = setTimeout(() => {
              // Only reapply to new elements, not the entire page
              this.applyStylesToNewElements(cssRules);
            }, 500); // Increased delay to reduce frequency
          }
        });
        
        // Observe with more restrictive options to reduce performance impact
        vueObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false, // Disable attribute monitoring to reduce overhead
          characterData: false // Disable text monitoring
        });
        
      } catch (error) {
        console.warn('VIP Tour Anonymizer: Failed to set up Vue observer:', error);
      }
    },
    
    // Apply styles only to new elements (more efficient than reapplying to everything)
    applyStylesToNewElements: function(cssRules) {
      try {
        cssRules.forEach((rule) => {
          if (rule.selector && rule.properties) {
            try {
              // Only apply to elements that haven't been processed yet
              const elements = document.querySelectorAll(rule.selector);
              elements.forEach((element) => {
                // Check if element has already been styled by us
                if (!element.hasAttribute('data-vip-styled')) {
                  Object.entries(rule.properties).forEach(([property, value]) => {
                    try {
                      element.style.setProperty(property, value, 'important');
                    } catch (error) {
                      // Silently ignore style application errors
                    }
                  });
                  // Mark element as styled to avoid reprocessing
                  element.setAttribute('data-vip-styled', 'true');
                }
              });
            } catch (error) {
              // Silently ignore invalid selectors
            }
          }
        });
      } catch (error) {
        console.warn('VIP Tour Anonymizer: Failed to apply styles to new elements:', error);
      }
    },
    


    // Static text replacement
    static_replacement: function(text, options = {}) {
      const { replacements, caseSensitive = true, captureBeforeReplace = null } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      // Capture values before replacement if specified
      if (captureBeforeReplace) {
        Object.entries(captureBeforeReplace).forEach(([key, selector]) => {
          try {
            let value = null;
            
            // Check if it's an XPath (starts with // or contains XPath syntax)
            if (selector.startsWith('//') || selector.includes('[') && selector.includes(']')) {
              // Treat as XPath
              try {
                const result = document.evaluate(selector, document, null, XPathResult.STRING_TYPE, null);
                value = result.stringValue;
                console.log(`VIP Tour Anonymizer: Captured ${key} from XPath before replacement: "${value}"`);
              } catch (xpathError) {
                console.warn(`VIP Tour Anonymizer: XPath evaluation failed for "${selector}":`, xpathError);
              }
            } else {
              // Treat as CSS selector
              const element = document.querySelector(selector);
              if (element) {
                value = element.textContent || element.innerText || element.value;
                console.log(`VIP Tour Anonymizer: Captured ${key} from CSS selector before replacement: "${value}"`);
              }
            }
            
            if (value) {
              capturedValues[key] = value.trim();
            }
          } catch (error) {
            console.warn(`VIP Tour Anonymizer: Error capturing ${key} before replacement:`, error);
          }
        });
      }
      
      // Simple name replacement logic
      if (replacements.first_names || replacements.last_names) {
        const words = text.trim().split(' ');
        if (words.length >= 2) {
          const firstName = replacements.first_names ? 
            replacements.first_names[Math.floor(Math.random() * replacements.first_names.length)] : 
            words[0];
          const lastName = replacements.last_names ? 
            replacements.last_names[Math.floor(Math.random() * replacements.last_names.length)] : 
            words[1];
          return `${firstName} ${lastName}`;
        }
      }
      
      // Company name replacement
      if (replacements.company_names) {
        return replacements.company_names[Math.floor(Math.random() * replacements.company_names.length)];
      }
      
      return text;
    },

    // Replace captured values with configured replacements
    dynamic_replacement: function(html, options = {}) {
      const { replacements = {}, splitReplacements = {}, ignoreWords = [], caseSensitive = true } = options;
      
      if (!html || typeof html !== 'string') return html;
      
      // Create a temporary container to parse the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Function to recursively replace text in text nodes only
      function replaceInTextNodes(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          let text = node.textContent;
          const flags = caseSensitive ? 'g' : 'gi';
          
          // Apply regular replacements
          Object.entries(replacements).forEach(([searchValue, replacementValue]) => {
            // Check if searchValue references a captured value (e.g., "{hostname}")
            if (searchValue.startsWith('{') && searchValue.endsWith('}')) {
              const captureKey = searchValue.slice(1, -1);
              
              if (capturedValues[captureKey]) {
                const capturedValue = capturedValues[captureKey];
                const escapedValue = capturedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedValue, flags);
                text = text.replace(regex, replacementValue);
              }
            } else {
              // Direct string replacement
              const escapedValue = searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(escapedValue, flags);
              text = text.replace(regex, replacementValue);
            }
          });
          
          // Apply split replacements
          Object.entries(splitReplacements).forEach(([searchValue, replacementValue]) => {
            if (searchValue.startsWith('{') && searchValue.endsWith('}')) {
              const captureKey = searchValue.slice(1, -1);
              
              if (capturedValues[captureKey]) {
                const capturedValue = capturedValues[captureKey];
                // Split the captured value into individual words
                const words = capturedValue.split(/\s+/);
                
                // Process each word individually
                words.forEach(word => {
                  const cleanWord = word.trim();
                  if (cleanWord && !ignoreWords.includes(cleanWord.toLowerCase())) {
                    const escapedValue = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(escapedValue, flags);
                    text = text.replace(regex, replacementValue);
                  }
                });
              }
            }
          });
          
          node.textContent = text;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Recursively process child nodes
          Array.from(node.childNodes).forEach(childNode => {
            replaceInTextNodes(childNode);
          });
        }
      }
      
      // Process the entire DOM tree
      replaceInTextNodes(tempDiv);
      
      return tempDiv.innerHTML;
    },

    // Legacy support for replace_subdirectory
    replace_subdirectory: function(text, options = {}) {
      const { replacementValue = "example.com", caseSensitive = true } = options;
      
      if (!text || typeof text !== 'string') return text;
      if (!capturedValues.subdirectory) return text;
      
      // Replace the captured subdirectory with the replacement value
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(capturedValues.subdirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      return text.replace(regex, replacementValue);
    },

    // Blur images
    blur: function(imgElement, options = {}) {
      try {
        const { blurAmount = '10px', fallbackImage } = options;
        
        console.log('VIP Tour Anonymizer: Attempting to blur element:', imgElement);
        
        if (!imgElement) {
          console.warn('VIP Tour Anonymizer: No element provided to blur function');
          return;
        }
        
        if (imgElement.tagName !== 'IMG') {
          console.warn('VIP Tour Anonymizer: Element is not an IMG tag:', imgElement.tagName);
          return;
        }
        
        console.log('VIP Tour Anonymizer: Applying blur to image:', imgElement.src);
        console.log('VIP Tour Anonymizer: Image complete:', imgElement.complete);
        console.log('VIP Tour Anonymizer: Image natural dimensions:', imgElement.naturalWidth, 'x', imgElement.naturalHeight);
        
        // If image is not loaded yet, wait for it
        if (!imgElement.complete || imgElement.naturalWidth === 0) {
          console.log('VIP Tour Anonymizer: Image not loaded yet, waiting...');
          imgElement.addEventListener('load', function() {
            console.log('VIP Tour Anonymizer: Image loaded, applying blur now');
            transformers.blur(imgElement, options);
          });
          return;
        }
        
        // Apply blur filter
        imgElement.style.filter = `blur(${blurAmount})`;
        imgElement.style.transform = 'scale(1.03)'; // Prevent blur edges from showing
        imgElement.style.transformOrigin = 'center';
        
        // Add a visible border to confirm the element was processed
        // imgElement.style.border = '3px solid red';
        // imgElement.style.outline = '2px solid yellow';
        
        // Alternative blur method using backdrop-filter (for testing)
        // imgElement.style.backdropFilter = `blur(${blurAmount})`;
        
        // Force a repaint to ensure styles are applied
        imgElement.offsetHeight; // This triggers a reflow
        
        console.log('VIP Tour Anonymizer: Blur applied successfully');
        console.log('VIP Tour Anonymizer: Image styles after blur:', {
          filter: imgElement.style.filter,
          transform: imgElement.style.transform,
          border: imgElement.style.border,
          outline: imgElement.style.outline
        });
        
        // Add fallback image if specified
        if (fallbackImage) {
          imgElement.addEventListener('error', function() {
            try {
              console.log('VIP Tour Anonymizer: Image failed to load, using fallback:', fallbackImage);
              const fallbackUrl = chrome.runtime.getURL(fallbackImage);
              console.log('VIP Tour Anonymizer: Fallback URL:', fallbackUrl);
              imgElement.src = fallbackUrl;
            } catch (error) {
              console.error('VIP Tour Anonymizer: Error setting fallback image:', error);
            }
          });
        }
      } catch (error) {
        console.error('VIP Tour Anonymizer: Error in blur function:', error);
        throw error; // Re-throw so the main error handler can catch it
      }
    },

    // Replace images with placeholder
    replace_image: function(imgElement, options = {}) {
      try {
        const { replacementImage, preserveDimensions = true } = options;
        
        console.log('VIP Tour Anonymizer: Attempting to replace image:', imgElement);
        
        if (!imgElement) {
          console.warn('VIP Tour Anonymizer: No element provided to replace_image function');
          return;
        }
        
        if (imgElement.tagName !== 'IMG') {
          console.warn('VIP Tour Anonymizer: Element is not an IMG tag:', imgElement.tagName);
          return;
        }
        
        if (replacementImage) {
          console.log('VIP Tour Anonymizer: Replacing image with:', replacementImage);
          
          // Store original dimensions if needed
          if (preserveDimensions) {
            const originalWidth = imgElement.width || imgElement.offsetWidth;
            const originalHeight = imgElement.height || imgElement.offsetHeight;
            
            imgElement.addEventListener('load', function() {
              if (originalWidth) imgElement.style.width = `${originalWidth}px`;
              if (originalHeight) imgElement.style.height = `${originalHeight}px`;
            });
          }
          
          try {
            const replacementUrl = chrome.runtime.getURL(replacementImage);
            console.log('VIP Tour Anonymizer: Setting replacement image URL:', replacementUrl);
            imgElement.src = replacementUrl;
          } catch (error) {
            console.error('VIP Tour Anonymizer: Error setting replacement image:', error);
          }
        }
      } catch (error) {
        console.error('VIP Tour Anonymizer: Error in replace_image function:', error);
        throw error; // Re-throw so the main error handler can catch it
      }
    },

    // Mask link URLs to prevent preview leaks while preserving functionality
    mask_links: function(linkElement, options = {}) {
      try {
        const { maskUrl = 'https://dash.parsely.com', preserveFunction = true } = options;
        
        if (!linkElement) {
          console.warn('VIP Tour Anonymizer: No element provided to mask_links function');
          return;
        }
        
        if (linkElement.tagName !== 'A') {
          console.warn('VIP Tour Anonymizer: Element is not an A tag:', linkElement.tagName);
          return;
        }
        
        // Skip if already processed
        if (linkElement.hasAttribute('data-vip-link-masked')) {
          return;
        }
        
        const originalHref = linkElement.href;
        
        // Skip if no href or already a generic link
        if (!originalHref || originalHref === maskUrl) {
          return;
        }
        
        console.log('VIP Tour Anonymizer: Masking link:', originalHref, '→', maskUrl);
        
        // Store original href for click functionality
        linkElement.setAttribute('data-vip-original-href', originalHref);
        linkElement.setAttribute('data-vip-link-masked', 'true');
        
        // Set up mouseover/mouseout events for URL masking
        linkElement.addEventListener('mouseover', function() {
          // Mask the URL on hover to prevent preview
          linkElement.href = maskUrl;
        });
        
        linkElement.addEventListener('mouseout', function() {
          // Keep it masked even after mouseout to prevent any preview leaks
          linkElement.href = maskUrl;
        });
        
        // Set initial masked URL
        linkElement.href = maskUrl;
        
        if (preserveFunction) {
          // Add click handler to restore original functionality
          linkElement.addEventListener('click', function(e) {
            e.preventDefault();
            const originalUrl = linkElement.getAttribute('data-vip-original-href');
            
            if (originalUrl) {
              console.log('VIP Tour Anonymizer: Navigating to original URL:', originalUrl);
              
              // Check if it should open in new tab/window
              if (linkElement.target === '_blank' || e.ctrlKey || e.metaKey) {
                window.open(originalUrl, '_blank');
              } else {
                window.location.href = originalUrl;
              }
            }
          });
        }
        
      } catch (error) {
        console.error('VIP Tour Anonymizer: Error in mask_links function:', error);
        throw error; // Re-throw so the main error handler can catch it
      }
    }
  };

  // Apply transformation to an element
  function applyTransformation(element, transformation) {
    if (!transformation) return;
    
    // Check if anonymization is enabled
    if (!isEnabled) {
      return;
    }
    
    // Check if element has already been processed (only for element-based transformations)
    if (element && processedElements.has(element)) {
      return;
    }
    
    try {
      switch (transformation.type) {
        case 'scramble':
          if (element.textContent) {
            element.textContent = transformers.scramble(element.textContent, transformation.options);
            processedElements.add(element);
          }
          break;
          
        case 'static_replacement':
          if (element.textContent) {
            element.textContent = transformers.static_replacement(element.textContent, transformation.options);
            processedElements.add(element);
          }
          break;
          
        case 'blur':
          transformers.blur(element, transformation.options);
          processedElements.add(element);
          break;
          
        case 'replace_image':
          transformers.replace_image(element, transformation.options);
          processedElements.add(element);
          break;

        case 'mask_links':
          transformers.mask_links(element, transformation.options);
          processedElements.add(element);
          break;
          
        case 'dynamic_replacement':
          if (element.innerHTML) {
            console.log('VIP Tour Anonymizer: Applying dynamic_replacement to element:', element.tagName, element.id, element.className);
            console.log('VIP Tour Anonymizer: Original innerHTML:', element.innerHTML);
            console.log('VIP Tour Anonymizer: Transformation options:', transformation.options);
            console.log('VIP Tour Anonymizer: Captured values:', capturedValues);
            const newHTML = transformers.dynamic_replacement(element.innerHTML, transformation.options);
            console.log('VIP Tour Anonymizer: New innerHTML:', newHTML);
            element.innerHTML = newHTML;
            processedElements.add(element);
            console.log('VIP Tour Anonymizer: Dynamic replacement completed');
          } else {
            console.log('VIP Tour Anonymizer: Element has no innerHTML for dynamic_replacement');
          }
          break;
          
        case 'replace_subdirectory':
          if (element.textContent) {
            element.textContent = transformers.replace_subdirectory(element.textContent, transformation.options);
            processedElements.add(element);
          }
          break;
          
        case 'custom_css':
          // Custom CSS doesn't need an element - it applies globally
          setTimeout(() => {
            transformers.custom_css(transformation.options);
          }, 50);
          break;
      }
    } catch (error) {
      console.warn('VIP Tour Anonymizer: Error applying transformation:', transformation.name, 'type:', transformation.type, 'error:', error);
      console.warn('VIP Tour Anonymizer: Transformation details:', transformation);
    }
  }

  // Process elements with given selectors
  function processElements(selectors, transformation) {
    if (!selectors || !Array.isArray(selectors)) {
      return;
    }
    
    selectors.forEach((selector) => {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(`VIP Tour Anonymizer: Found ${elements.length} elements for selector: ${selector}`);
        
        // Special debugging for tooltip selector
        if (selector === '#tooltip') {
          console.log(`VIP Tour Anonymizer: Tooltip selector found ${elements.length} elements`);
          elements.forEach((element, index) => {
            console.log(`VIP Tour Anonymizer: Tooltip element ${index}:`, element.tagName, element.id, element.className);
            console.log(`VIP Tour Anonymizer: Tooltip content:`, element.innerHTML);
            console.log(`VIP Tour Anonymizer: Already processed:`, processedElements.has(element));
          });
        }
        
        elements.forEach((element) => {
          if (!processedElements.has(element) && isEnabled) {
            console.log(`VIP Tour Anonymizer: Processing element:`, element.tagName, element.id, element.className);
            applyTransformation(element, transformation);
          } else {
            console.log(`VIP Tour Anonymizer: Skipping element (already processed or disabled):`, element.tagName, element.id, element.className);
          }
        });
      } catch (error) {
        console.warn(`VIP Tour Anonymizer: Error processing selector "${selector}":`, error);
      }
    });
  }

  // Process all transformations in config order
  function processAllTransformations() {
    if (!config || !config.transformations || !isEnabled) {
      return;
    }
    
    console.log(`VIP Tour Anonymizer: Processing ${config.transformations.length} transformations in config order`);
    
    config.transformations.forEach((transformation, index) => {
      console.log(`VIP Tour Anonymizer: [${index + 1}/${config.transformations.length}] Processing transformation: ${transformation.name} (${transformation.type})`);
      
      // Handle transformations that don't require selectors (like custom_css)
      if (transformation.type === 'custom_css') {
        applyTransformation(null, transformation);
      } else {
        processElements(transformation.selectors, transformation);
      }
    });
    
    console.log(`VIP Tour Anonymizer: Completed processing all transformations in order`);
  }

  // Process only new elements (for dynamic content)
  function processNewElements(rootElement) {
    if (!config || !config.transformations || !isEnabled) return;
    
    console.log('VIP Tour Anonymizer: Processing new elements:', rootElement.tagName, rootElement.id, rootElement.className);
    
    config.transformations.forEach(transformation => {
      // Skip transformations that don't have selectors (like custom_css)
      if (!transformation.selectors || !Array.isArray(transformation.selectors)) {
        return;
      }
      
      console.log('VIP Tour Anonymizer: Checking transformation:', transformation.name, 'type:', transformation.type);
      
      transformation.selectors.forEach(selector => {
        try {
          console.log('VIP Tour Anonymizer: Testing selector:', selector);
          
          // Find elements within the new content that match our selectors
          const elements = rootElement.querySelectorAll ? rootElement.querySelectorAll(selector) : [];
          
          // Convert NodeList to Array and add rootElement if it matches
          const elementsArray = Array.from(elements);
          
          console.log('VIP Tour Anonymizer: querySelectorAll found', elements.length, 'elements for selector:', selector);
          elements.forEach((el, index) => {
            console.log(`VIP Tour Anonymizer: Found element ${index}:`, el.tagName, el.id, el.className);
          });
          
          // Debug the root element structure
          console.log('VIP Tour Anonymizer: Root element details:');
          console.log('  - tagName:', rootElement.tagName);
          console.log('  - id:', rootElement.id);
          console.log('  - className:', rootElement.className);
          console.log('  - classList:', Array.from(rootElement.classList || []));
          console.log('  - matches selector?', rootElement.matches ? rootElement.matches(selector) : 'matches() not supported');
          
          if (rootElement.matches && rootElement.matches(selector)) {
            console.log('VIP Tour Anonymizer: Root element matches selector:', selector);
            elementsArray.push(rootElement);
          } else {
            console.log('VIP Tour Anonymizer: Root element does NOT match selector:', selector);
          }
          
          console.log('VIP Tour Anonymizer: Found', elementsArray.length, 'elements for selector:', selector);
          
          elementsArray.forEach(element => {
            console.log('VIP Tour Anonymizer: Processing element:', element.tagName, element.id, element.className, 'text:', element.textContent?.substring(0, 50));
            
            // Only process if not already processed and anonymization is enabled
            if (!processedElements.has(element) && isEnabled) {
              console.log('VIP Tour Anonymizer: Applying transformation to element');
              applyTransformation(element, transformation);
            } else {
              console.log('VIP Tour Anonymizer: Skipping element - already processed or disabled');
            }
          });
        } catch (error) {
          console.warn(`VIP Tour Anonymizer: Error with selector "${selector}":`, error);
        }
      });
    });
  }

  // Setup mutation observer to handle dynamically loaded content
  function setupMutationObserver() {
    if (!config || !config.globalOptions || !config.globalOptions.observeMutations) return;
    
    const options = config.globalOptions.mutationObserverOptions || {
      childList: true,
      subtree: true,
      attributes: true, // Enable attribute monitoring for tooltip detection
      attributeFilter: ['style', 'class', 'id'] // Monitor style changes for tooltip visibility
    };
    
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Handle new nodes being added
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              console.log('VIP Tour Anonymizer: New element added:', node.tagName, node.className, node.id);
              
              // Process the element normally
              processNewElements(node);
            }
          });
          

        } else if (mutation.type === 'attributes') {
          // Handle attribute changes (like tooltip visibility)
          const target = mutation.target;
          if (target.nodeType === Node.ELEMENT_NODE) {
            console.log('VIP Tour Anonymizer: Element attribute changed:', target.tagName, target.className, target.id, mutation.attributeName);
            
            // Check if this is a tooltip becoming visible
            const isTooltip = target.id === 'tooltip' || 
                             (target.className && typeof target.className === 'string' && target.className.indexOf('tooltip') !== -1) ||
                             (target.className && typeof target.className === 'string' && target.className.indexOf('classic') !== -1);
            
            if (isTooltip) {
              console.log('VIP Tour Anonymizer: Tooltip detected, processing...');
              processNewElements(target);
            }
          }
        }
      });
    });
    
    observer.observe(document.body || document.documentElement, options);
  }

  // Capture URL-based values immediately (no waiting needed)
  function captureUrlValues() {
    try {
      const url = window.location.href;
      const urlObj = new URL(url);
      
      // Capture URL components
      capturedValues.hostname = urlObj.hostname;
      capturedValues.domain = urlObj.hostname.replace(/^www\./, '');
      capturedValues.protocol = urlObj.protocol.replace(':', '');
      capturedValues.port = urlObj.port;
      capturedValues.fullUrl = url;
      
      // Capture path components
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      if (pathParts.length > 0) {
        capturedValues.subdirectory = pathParts[0];
        capturedValues.firstPath = pathParts[0];
        capturedValues.lastPath = pathParts[pathParts.length - 1];
        capturedValues.fullPath = urlObj.pathname;
      }
      
      // Capture query parameters
      const searchParams = new URLSearchParams(urlObj.search);
      searchParams.forEach((value, key) => {
        capturedValues[`param_${key}`] = value;
      });
      
      // Capture values from URL regex (if configured)
      if (config && config.valueCapture && config.valueCapture.urlRegex) {
        Object.entries(config.valueCapture.urlRegex).forEach(([key, regexPattern]) => {
          try {
            const regex = new RegExp(regexPattern);
            const match = url.match(regex);
            if (match && match[1]) {
              capturedValues[key] = match[1].trim();
              console.log(`VIP Tour Anonymizer: Captured ${key} from URL regex: "${capturedValues[key]}"`);
            }
          } catch (error) {
            console.warn(`VIP Tour Anonymizer: Error evaluating URL regex "${regexPattern}":`, error);
          }
        });
      }

      console.log('VIP Tour Anonymizer: URL-based captured values:', capturedValues);
    } catch (error) {
      console.warn('VIP Tour Anonymizer: Error capturing URL values:', error);
    }
  }

  // Capture DOM-based values (wait for elements to appear)
  function captureDomValues() {
    try {
      // Capture values from CSS selectors (if configured)
      if (config && config.valueCapture && config.valueCapture.cssSelectors) {
        Object.entries(config.valueCapture.cssSelectors).forEach(([key, selector]) => {
          try {
            const element = document.querySelector(selector);
            if (element) {
              const value = element.textContent || element.innerText || element.value;
              capturedValues[key] = value.trim();
              console.log(`VIP Tour Anonymizer: Captured ${key}: "${capturedValues[key]}"`);
              
              // Re-process transformations now that we have this value
              if (isEnabled) {
                processAllTransformations();
              }
            } else {
              // Schedule retry if element not found
              scheduleDomValueRetry(key, selector);
            }
          } catch (error) {
            console.warn(`VIP Tour Anonymizer: Error evaluating selector "${selector}":`, error);
            scheduleDomValueRetry(key, selector);
          }
        });
      }
    } catch (error) {
      console.warn('VIP Tour Anonymizer: Error capturing DOM values:', error);
    }
  }

  // Schedule retry for DOM value capture
  function scheduleDomValueRetry(key, selector) {
    console.log(`VIP Tour Anonymizer: Scheduling retry for ${key} in 100ms`);
    setTimeout(() => {
      console.log(`VIP Tour Anonymizer: Retrying capture for ${key}...`);
      captureDomValues();
    }, 100);
  }

  // Load configuration
  async function loadConfig() {
    try {
      const configUrl = chrome.runtime.getURL('content/config.json');
      console.log('VIP Tour Anonymizer: Loading config from:', configUrl);
      
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      config = await response.json();
      console.log('VIP Tour Anonymizer: Config loaded successfully:', config);
    } catch (error) {
      console.error('VIP Tour Anonymizer: Failed to load config:', error);
      console.log('VIP Tour Anonymizer: Using fallback config');
      
      // Fallback to basic config
      config = {
        transformations: [],
        globalOptions: { 
          enableOnLoad: true, 
          observeMutations: true,
          mutationObserverOptions: {
            childList: true,
            subtree: true,
            attributes: false
          }
        }
      };
    }
  }

  // Initialize the anonymizer
  async function init() {
    await loadConfig();
    
    // Capture URL-based values immediately (no waiting needed)
    captureUrlValues();
    
    // Load initial enabled state from storage
    try {
      const result = await chrome.storage.local.get(['enabled']);
      isEnabled = result.enabled !== false; // Default to true if not set
      console.log('VIP Tour Anonymizer: Initial enabled state:', isEnabled);
    } catch (error) {
      console.warn('VIP Tour Anonymizer: Could not load initial state, defaulting to enabled');
      isEnabled = true;
    }
    
    // Process existing content only if enabled
    if (config.globalOptions.enableOnLoad && isEnabled) {
      // Use requestAnimationFrame to ensure DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          // Capture DOM-based values AFTER DOM is loaded
          captureDomValues();
          if (isEnabled) {
            processAllTransformations();
          }
          setupMutationObserver();
        });
      } else {
        // Capture DOM-based values AFTER DOM is loaded
        captureDomValues();
        if (isEnabled) {
          processAllTransformations();
        }
        setupMutationObserver();
      }
    } else {
      // Still setup observer even if not enabled initially
      setupMutationObserver();
    }
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      isEnabled = request.enabled;
      console.log('VIP Tour Anonymizer: Toggle changed to:', isEnabled);
      
      if (isEnabled) {
        // Re-process all elements when re-enabling
        processAllTransformations();
      } else {
        // When disabling, we can't easily restore original content
        // But we can prevent new transformations
        console.log('VIP Tour Anonymizer: Anonymization disabled - new content will not be processed');
      }
      sendResponse({ success: true });
    } else if (request.action === 'getStatus') {
      sendResponse({ enabled: isEnabled });
    }
  });



  // Smart retry scanner for dynamic content
  function startRetryScanner() {
    const retryInterval = 50; // 50ms interval - configurable
    console.log(`VIP Tour Anonymizer: Starting smart retry scanner with ${retryInterval}ms interval`);
    
    // Track tooltip content to prevent infinite loops
    const tooltipContentHashes = new Map();
    
    setInterval(() => {
      if (isEnabled && config && config.transformations) {
        // Process transformations in config order
        config.transformations.forEach((transformation, index) => {
          if (transformation.selectors && Array.isArray(transformation.selectors)) {
            transformation.selectors.forEach(selector => {
              try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                  // Special handling for tooltip elements - check for content changes to prevent loops
                  if (element.id === 'tooltip') {
                    const currentContent = element.innerHTML;
                    const contentHash = currentContent + element.textContent;
                    const previousHash = tooltipContentHashes.get(element);
                    
                    // Only process if content actually changed (not just our own modifications)
                    if (!previousHash || previousHash !== contentHash) {
                      // Check if this looks like original content (not already processed)
                      const replacementValue = transformation.options?.replacements?.['{customerName}'] || 
                                             transformation.options?.splitReplacements?.['{customerName}'] || 
                                             'Customer X';
                      
                      // Skip if content already contains our replacement text
                      if (currentContent.includes(replacementValue) && 
                          currentContent.split(replacementValue).length > 2) {
                        console.log(`VIP Tour Anonymizer: Skipping tooltip - already processed or contains multiple replacements`);
                        return;
                      }
                      
                      console.log(`VIP Tour Anonymizer: Processing tooltip:`, currentContent);
                      
                      // Store the original content hash before processing
                      tooltipContentHashes.set(element, contentHash);
                      
                      // Remove from processed elements to allow reprocessing
                      processedElements.delete(element);
                      
                      // Process the element
                      applyTransformation(element, transformation);
                      
                      // Update hash after processing to prevent immediate reprocessing
                      const newContentHash = element.innerHTML + element.textContent;
                      tooltipContentHashes.set(element, newContentHash);
                    }
                  } else {
                    // Regular elements - use the same processedElements tracking as the main system
                    if (!processedElements.has(element)) {
                      console.log(`VIP Tour Anonymizer: Retry scanner processing element:`, element.tagName, element.id, element.className, transformation.name);
                      applyTransformation(element, transformation);
                    }
                  }
                });
              } catch (error) {
                console.warn(`VIP Tour Anonymizer: Error processing selector "${selector}":`, error);
              }
            });
          }
        });
      }
    }, retryInterval);
  }

  // Start the anonymizer
  init();
  
  // Start retry scanner
  startRetryScanner();

})(); 