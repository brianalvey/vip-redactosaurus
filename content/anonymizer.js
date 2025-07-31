// VIP Tour Anonymizer - Content Script
// Runs at document_start to prevent flash of non-anonymized content

(function() {
  'use strict';

  // Configuration
  let config = null;
  let isEnabled = true;
  let observer = null;
  let processedElements = new WeakSet(); // Track processed elements to prevent re-anonymization
  let capturedValues = {}; // Store captured values from URL/XPath

  // Transformation functions
  const transformers = {
    // Scramble text while preserving case, punctuation, and spaces
    scramble: function(text, options = {}) {
      const { preserveCase = true, preservePunctuation = true, preserveSpaces = true } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      // Split text into characters
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

    // Static text replacement
    static_replacement: function(text, options = {}) {
      const { replacements, caseSensitive = true } = options;
      
      if (!text || typeof text !== 'string') return text;
      
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
    dynamic_replacement: function(text, options = {}) {
      const { replacements = {}, caseSensitive = true } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      let result = text;
      const flags = caseSensitive ? 'g' : 'gi';
      
      // Apply each replacement rule
      Object.entries(replacements).forEach(([searchValue, replacementValue]) => {
        // Check if searchValue references a captured value (e.g., "{hostname}")
        if (searchValue.startsWith('{') && searchValue.endsWith('}')) {
          const captureKey = searchValue.slice(1, -1);
          if (capturedValues[captureKey]) {
            const regex = new RegExp(capturedValues[captureKey].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
            result = result.replace(regex, replacementValue);
          }
        } else {
          // Direct string replacement
          const regex = new RegExp(searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
          result = result.replace(regex, replacementValue);
        }
      });
      
      return result;
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
      const { blurAmount = '10px', fallbackImage } = options;
      
      if (!imgElement || imgElement.tagName !== 'IMG') return;
      
      // Apply blur filter
      imgElement.style.filter = `blur(${blurAmount})`;
      imgElement.style.transform = 'scale(1.1)'; // Prevent blur edges from showing
      imgElement.style.transformOrigin = 'center';
      
      // Add fallback image if specified
      if (fallbackImage) {
        imgElement.addEventListener('error', function() {
          imgElement.src = chrome.runtime.getURL(fallbackImage);
        });
      }
    },

    // Replace images with placeholder
    replace_image: function(imgElement, options = {}) {
      const { replacementImage, preserveDimensions = true } = options;
      
      if (!imgElement || imgElement.tagName !== 'IMG') return;
      
      if (replacementImage) {
        // Store original dimensions if needed
        if (preserveDimensions) {
          const originalWidth = imgElement.width || imgElement.offsetWidth;
          const originalHeight = imgElement.height || imgElement.offsetHeight;
          
          imgElement.addEventListener('load', function() {
            if (originalWidth) imgElement.style.width = `${originalWidth}px`;
            if (originalHeight) imgElement.style.height = `${originalHeight}px`;
          });
        }
        
        imgElement.src = chrome.runtime.getURL(replacementImage);
      }
    }
  };

  // Apply transformation to an element
  function applyTransformation(element, transformation) {
    if (!element || !transformation) return;
    
    // Check if anonymization is enabled
    if (!isEnabled) {
      return;
    }
    
    // Check if element has already been processed
    if (processedElements.has(element)) {
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
          
        case 'dynamic_replacement':
          if (element.textContent) {
            element.textContent = transformers.dynamic_replacement(element.textContent, transformation.options);
            processedElements.add(element);
          }
          break;
          
        case 'replace_subdirectory':
          if (element.textContent) {
            element.textContent = transformers.replace_subdirectory(element.textContent, transformation.options);
            processedElements.add(element);
          }
          break;
      }
    } catch (error) {
      console.warn('VIP Tour Anonymizer: Error applying transformation:', error);
    }
  }

  // Process elements with given selectors
  function processElements(selectors, transformation) {
    if (!selectors || !Array.isArray(selectors)) return;
    
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          applyTransformation(element, transformation);
        });
      } catch (error) {
        console.warn(`VIP Tour Anonymizer: Invalid selector "${selector}":`, error);
      }
    });
  }

  // Process all transformations
  function processAllTransformations() {
    if (!config || !config.transformations || !isEnabled) return;
    
    config.transformations.forEach(transformation => {
      processElements(transformation.selectors, transformation);
    });
  }

  // Process only new elements (for dynamic content)
  function processNewElements(rootElement) {
    if (!config || !config.transformations || !isEnabled) return;
    
    config.transformations.forEach(transformation => {
      transformation.selectors.forEach(selector => {
        try {
          // Find elements within the new content that match our selectors
          const elements = rootElement.querySelectorAll ? rootElement.querySelectorAll(selector) : [];
          if (rootElement.matches && rootElement.matches(selector)) {
            elements.push(rootElement);
          }
          
          elements.forEach(element => {
            // Only process if not already processed and anonymization is enabled
            if (!processedElements.has(element) && isEnabled) {
              applyTransformation(element, transformation);
            }
          });
        } catch (error) {
          console.warn(`VIP Tour Anonymizer: Invalid selector "${selector}":`, error);
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
      attributes: false // Disable attribute monitoring to prevent re-processing on hover
    };
    
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Only process new nodes, not attribute changes
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Process only the new element and its children
              processNewElements(node);
            }
          });
        }
      });
    });
    
    observer.observe(document.body || document.documentElement, options);
  }

  // Capture values from URL and XPath
  function captureValues() {
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
      
      // Capture values from XPath (if configured)
      if (config && config.valueCapture && config.valueCapture.xpath) {
        Object.entries(config.valueCapture.xpath).forEach(([key, xpath]) => {
          try {
            const result = document.evaluate(xpath, document, null, XPathResult.STRING_TYPE, null);
            if (result.stringValue) {
              capturedValues[key] = result.stringValue.trim();
            }
          } catch (error) {
            console.warn(`VIP Tour Anonymizer: Error evaluating XPath "${xpath}":`, error);
          }
        });
      }
      
      // Capture values from URL regex (if configured)
      if (config && config.valueCapture && config.valueCapture.urlRegex) {
        Object.entries(config.valueCapture.urlRegex).forEach(([key, regexPattern]) => {
          try {
            const regex = new RegExp(regexPattern);
            const match = url.match(regex);
            if (match && match[1]) {
              capturedValues[key] = match[1].trim();
            }
          } catch (error) {
            console.warn(`VIP Tour Anonymizer: Error evaluating URL regex "${regexPattern}":`, error);
          }
        });
      }

      // Print siteName and customerDomain specifically
      console.log('VIP Tour Anonymizer: siteName:', capturedValues.siteName);
      console.log('VIP Tour Anonymizer: customerDomain:', capturedValues.customerDomain);
      
      console.log('VIP Tour Anonymizer: Captured values:', capturedValues);
    } catch (error) {
      console.warn('VIP Tour Anonymizer: Error capturing values:', error);
    }
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
      
      // Fallback to basic config with your updated selectors
      config = {
        transformations: [
          {
            "name": "headlines",
            "selectors": [
              "h1", "h2", "h3", "h4", "h5", "h6", "a",
              ".headline", ".title", ".article-title", ".post-title",
              "[data-testid*='headline']", "[data-testid*='title']"
            ],
            "type": "scramble",
            "options": {
              "preserveCase": true,
              "preservePunctuation": true,
              "preserveSpaces": true
            }
          },
          {
            "name": "author_names",
            "selectors": [
              ".author", ".author-name", ".byline",
              "[data-testid*='author']", "[data-testid*='byline']",
              ".user-name", ".profile-name"
            ],
            "type": "static_replacement",
            "options": {
              "replacements": {
                "first_names": ["Alex", "Sam", "Jordan", "Casey", "Taylor", "Morgan", "Riley", "Quinn"],
                "last_names": ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"]
              }
            }
          },
          {
            "name": "customer_names",
            "selectors": [
              ".customer-name", ".client-name", ".company-name",
              "[data-testid*='customer']", "[data-testid*='client']",
              ".org-name", ".business-name"
            ],
            "type": "static_replacement",
            "options": {
              "replacements": {
                "company_names": ["Acme Corp", "TechStart Inc", "Global Solutions", "Innovation Labs", "Future Systems"]
              }
            }
          },
          {
            "name": "subdirectory_replacement",
            "selectors": [
              ".domain-name", ".site-name", ".customer-domain",
              "[data-testid*='domain']", "[data-testid*='site']",
              ".url-display", ".path-display"
            ],
            "type": "replace_subdirectory",
            "options": {
              "replacementValue": "example.com"
            }
          },
          {
            "name": "profile_photos",
            "selectors": [
              "img[src*='avatar']", "img[src*='profile']", "img[src*='user']",
              ".avatar img", ".profile-photo img", ".user-photo img",
              "[data-testid*='avatar'] img", "[data-testid*='profile'] img"
            ],
            "type": "blur",
            "options": {
              "blurAmount": "10px",
              "fallbackImage": "assets/placeholder.jpg"
            }
          },
          {
            "name": "article_thumbnails",
            "selectors": [
              ".article-thumbnail img", ".post-image img", ".content-image img",
              "[data-testid*='thumbnail'] img", "[data-testid*='image'] img"
            ],
            "type": "replace_image",
            "options": {
              "replacementImage": "assets/placeholder.jpg",
              "preserveDimensions": true
            }
          }
        ],
        globalOptions: { 
          enableOnLoad: true, 
          observeMutations: true,
          mutationObserverOptions: {
            childList: true,
            subtree: true,
            attributes: false // Disable attribute monitoring to prevent re-processing
          }
        }
      };
    }
  }

  // Initialize the anonymizer
  async function init() {
    await loadConfig();
    
    // Capture values from URL and XPath
    captureValues();
    
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
          if (isEnabled) {
            processAllTransformations();
          }
          setupMutationObserver();
        });
      } else {
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

  // Start the anonymizer
  init();

})(); 