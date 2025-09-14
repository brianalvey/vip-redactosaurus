// VIP Redactosaurus - Chrome Extension for Safe Content Anonymization
// Built for Manifest V3 with zero FOUC (Flash of Unstyled Content)

(function() {
  'use strict';

  // === GLOBAL STATE ===
  let config = null;
  let isEnabled = true;
  let isInitialized = false;
  let processedElements = new WeakSet();
  let processedElementsMap = new Map(); // element -> Set of transformation names applied
  let elementContentHashes = new Map(); // element -> content hash for change detection
  let mutationObserver = null;
  let processTimer = null;
  let detectedCustomer = null; // Will store { id, name, domain } if detected
  let processingCounter = 0; // Track processing cycles

  // === UTILITY FUNCTIONS ===
  
  function log(message, ...args) {
    if (config?.settings?.debug) {
      console.log(`[VIP Redactosaurus] ${message}`, ...args);
    }
  }

  function error(message, ...args) {
    console.error(`[VIP Redactosaurus] ${message}`, ...args);
  }

  // === CUSTOMER DETECTION ===

  function detectCustomerFromUrl() {
    if (!config || !config.urlPatterns) {
      error('No URL patterns configured for customer detection');
      return null;
    }

    const currentUrl = window.location.href;
    log('=== CUSTOMER DETECTION START ===');
    log('Current URL:', currentUrl);
    log('Available URL patterns:', Object.keys(config.urlPatterns));
    const mappingsSummary = {};
    if (config.customerMapping) {
      Object.keys(config.customerMapping).forEach(groupId => {
        const group = config.customerMapping[groupId];
        mappingsSummary[groupId] = {
          name: group.name,
          customerCount: Object.keys(group.customers || {}).length
        };
      });
    }
    log('Available customer mappings:', mappingsSummary);

    // Try each URL pattern
    for (const [patternName, patternConfig] of Object.entries(config.urlPatterns)) {
      try {
        log(`Trying pattern '${patternName}': ${patternConfig.pattern}`);
        const regex = new RegExp(patternConfig.pattern);
        const match = currentUrl.match(regex);
        
        log(`Pattern '${patternName}' match result:`, match);
        
        if (match && match[patternConfig.customerIdGroup]) {
          const customerId = match[patternConfig.customerIdGroup];
          const customerGroup = patternConfig.customerIdGroup.toString();
          log(`✅ Customer ID detected using pattern '${patternName}':`, customerId);
          log(`Looking in customer group: ${customerGroup}`);
          
          // Look up customer details in the appropriate group
          const groupMapping = config.customerMapping?.[customerGroup];
          log(`Customer group mapping for '${customerGroup}':`, groupMapping);
          
          if (groupMapping && groupMapping.customers) {
            const customerDetails = groupMapping.customers[customerId];
            log(`Customer mapping lookup for '${customerId}' in group '${customerGroup}':`, customerDetails);
            
            if (customerDetails) {
              const customer = {
                id: customerId,
                name: customerDetails.customerName,
                domain: customerDetails.customerDomain,
                relatedWords: customerDetails.relatedWords || [],
                group: customerGroup,
                groupName: groupMapping.name,
                pattern: patternName
              };
              log('✅ Known customer detected:', customer);
              log('Related words for replacement:', customer.relatedWords);
              log('=== CUSTOMER DETECTION SUCCESS ===');
              return customer;
            } else {
              log(`⚠️ Customer ID '${customerId}' not found in group '${customerGroup}' customer mapping`);
            }
          } else {
            log(`⚠️ Customer group '${customerGroup}' not found in mapping`);
          }
          
          // Return basic customer info even if not in mapping
          const customer = {
            id: customerId,
            name: null,
            domain: null,
            group: customerGroup,
            groupName: groupMapping?.name || `Group ${customerGroup}`,
            pattern: patternName
          };
          log('=== CUSTOMER DETECTION PARTIAL ===');
          return customer;
        } else {
          log(`❌ Pattern '${patternName}' did not match`);
        }
      } catch (err) {
        error(`Error processing URL pattern '${patternName}':`, err);
      }
    }

    log('❌ No customer ID detected from URL');
    log('=== CUSTOMER DETECTION FAILED ===');
    return null;
  }

  function getCustomerValue(type) {
    if (!detectedCustomer) {
      log(`No detected customer, using fallback for ${type}`);
      
      // Use fallback values
      switch (type) {
        case 'name':
          const fallbackNames = config?.transformations?.staticReplacements?.fallbackCustomerNames || [];
          return fallbackNames.length > 0 ? getRandomFromArray(fallbackNames) : 'Customer X';
        case 'domain':
          const fallbackDomains = config?.transformations?.staticReplacements?.fallbackCustomerDomains || [];
          return fallbackDomains.length > 0 ? getRandomFromArray(fallbackDomains) : 'customerx.com';
        default:
          return null;
      }
    }

    // Use detected customer values or configured replacements
    switch (type) {
      case 'name':
        return detectedCustomer.name || config?.transformations?.customerSpecific?.customerNameReplacement || 'Customer X';
      case 'domain':
        return detectedCustomer.domain || config?.transformations?.customerSpecific?.customerDomainReplacement || 'customerx.com';
      case 'id':
        return detectedCustomer.id;
      default:
        return null;
    }
  }

  function generateRandomString(length, preserveCase = true, template = '') {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let result = '';
    for (let i = 0; i < length; i++) {
      const templateChar = template[i];
      
      if (templateChar && /[A-Z]/.test(templateChar) && preserveCase) {
        result += upperChars[Math.floor(Math.random() * upperChars.length)];
      } else if (templateChar && /[0-9]/.test(templateChar)) {
        result += numbers[Math.floor(Math.random() * numbers.length)];
      } else {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return result;
  }

  // === ELEMENT TRACKING ===

  function getContentHash(element) {
    // Create a simple hash of the element's text content for change detection
    const content = element.textContent || '';
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  function hasContentChanged(element) {
    // Check if the element's content has changed since last processing
    const currentHash = getContentHash(element);
    const previousHash = elementContentHashes.get(element);
    
    if (previousHash === undefined) {
      // First time seeing this element
      return true;
    }
    
    return currentHash !== previousHash;
  }

  function updateContentHash(element) {
    // Update the stored content hash for this element
    const currentHash = getContentHash(element);
    elementContentHashes.set(element, currentHash);
  }

  function hasBeenProcessed(element, transformationName) {
    // Check if element has been processed by this specific transformation
    // AND if its content hasn't changed since processing
    const processedTransformations = processedElementsMap.get(element);
    const wasProcessed = processedTransformations && processedTransformations.has(transformationName);
    
    if (!wasProcessed) {
      return false; // Never processed
    }
    
    // Check if content has changed since processing
    const contentChanged = hasContentChanged(element);
    if (contentChanged) {
      log(`Content changed in ${getElementSignature(element)}, will reprocess`);
      // Remove from processed list for this transformation so it gets reprocessed
      processedTransformations.delete(transformationName);
      return false;
    }
    
    return true; // Processed and content unchanged
  }

  function markAsProcessed(element, transformationName) {
    // Mark element as processed by this specific transformation
    if (!processedElementsMap.has(element)) {
      processedElementsMap.set(element, new Set());
    }
    processedElementsMap.get(element).add(transformationName);
    
    // Update content hash to track future changes
    updateContentHash(element);
    
    // Also add to WeakSet for backwards compatibility
    processedElements.add(element);
  }

  function resetProcessedElements() {
    // Clear all processing tracking (used when re-enabling extension)
    processedElements = new WeakSet();
    processedElementsMap.clear();
    elementContentHashes.clear();
    log('Cleared all processed element tracking and content hashes');
  }

  function getElementSignature(element) {
    // Create a signature for an element to help with debugging
    let sig = element.tagName.toLowerCase();
    if (element.id) sig += `#${element.id}`;
    if (element.className) sig += `.${element.className.split(' ').join('.')}`;
    return sig;
  }

  function getRandomFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // === REPLACEMENT FUNCTIONS ===

  const replacementFunctions = {
    generateRandomAuthorName: function(args) {
      const { firstNames = [], lastNames = [] } = args || {};
      
      if (firstNames.length === 0 || lastNames.length === 0) {
        log('generateRandomAuthorName: Missing firstNames or lastNames arrays');
        return 'Anonymous Author';
      }
      
      const firstName = getRandomFromArray(firstNames);
      const lastName = getRandomFromArray(lastNames);
      
      return `${firstName} ${lastName}`;
    },

    generateRandomCompany: function(args) {
      const { 
        prefixes = ['Global', 'Dynamic', 'Prime', 'Elite', 'Advanced'],
        suffixes = ['Corp', 'Inc', 'LLC', 'Solutions', 'Industries'],
        types = ['Media', 'Tech', 'Digital', 'Systems', 'Networks']
      } = args || {};
      
      const prefix = getRandomFromArray(prefixes);
      const type = getRandomFromArray(types);
      const suffix = getRandomFromArray(suffixes);
      
      return `${prefix} ${type} ${suffix}`;
    },

    generateRandomEmail: function(args) {
      const {
        usernames = ['contact', 'info', 'hello', 'support', 'team', 'admin'],
        domains = ['example.com', 'demo-site.com', 'sample.org', 'test.net']
      } = args || {};
      
      const username = getRandomFromArray(usernames);
      const domain = getRandomFromArray(domains);
      
      return `${username}@${domain}`;
    },

    generateRandomPhoneNumber: function(args) {
      const { format = '(###) ###-####' } = args || {};
      
      return format.replace(/#/g, () => Math.floor(Math.random() * 10));
    },

    generateLoremText: function(args) {
      const { 
        words = 10,
        sentences = 1,
        wordList = [
          'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
          'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
          'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud'
        ]
      } = args || {};
      
      let result = '';
      
      for (let s = 0; s < sentences; s++) {
        let sentence = '';
        for (let w = 0; w < words; w++) {
          const word = getRandomFromArray(wordList);
          sentence += (w === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word);
          if (w < words - 1) sentence += ' ';
        }
        sentence += '.';
        result += sentence;
        if (s < sentences - 1) result += ' ';
      }
      
      return result;
    }
  };

  function executeReplacementFunction(functionName, functionArgs) {
    if (!replacementFunctions[functionName]) {
      error(`Unknown replacement function: ${functionName}`);
      return 'Unknown Function';
    }
    
    try {
      const result = replacementFunctions[functionName](functionArgs);
      log(`Executed function ${functionName}:`, result);
      return result;
    } catch (err) {
      error(`Error executing function ${functionName}:`, err);
      return 'Function Error';
    }
  }

  // === TRANSFORMATION FUNCTIONS ===

  function scrambleText(text, options = {}) {
    if (!text || typeof text !== 'string') return text;
    
    const { 
      preserveCase = true, 
      preservePunctuation = true, 
      preserveSpaces = true,
      preserveLength = true,
      preserveEnds = false
    } = options;

    // If preserveEnds is enabled, use word-based scrambling
    if (preserveEnds) {
      return scrambleByWords(text, options);
    }

    // Character-by-character scrambling (original behavior)
    let result = text.split('').map(char => {
      // Handle spaces
      if (/\s/.test(char)) {
        if (preserveSpaces) {
          return char; // Keep original space
        } else {
          // Replace space with random character
          const randomChar = String.fromCharCode(Math.floor(Math.random() * 26) + 97);
          return Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
        }
      }
      
      // Handle punctuation
      if (/[^\w\s]/.test(char)) {
        if (preservePunctuation) {
          return char; // Keep original punctuation
        } else {
          // Replace punctuation with random character
          const randomChar = String.fromCharCode(Math.floor(Math.random() * 26) + 97);
          return Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
        }
      }
      
      // Handle letters
      if (/[a-zA-Z]/.test(char)) {
        const isUpper = char === char.toUpperCase();
        const randomChar = String.fromCharCode(
          Math.floor(Math.random() * 26) + 97 // Always start with lowercase
        );
        
        if (preserveCase) {
          // Preserve original case
          return isUpper ? randomChar.toUpperCase() : randomChar.toLowerCase();
        } else {
          // Randomly mix case
          return Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
        }
      }
      
      // Handle numbers
      if (/[0-9]/.test(char)) {
        return Math.floor(Math.random() * 10).toString();
      }
      
      // Keep other characters as-is
      return char;
    }).join('');

    // If we replaced spaces with characters, inject some random spaces back for readability
    if (!preserveSpaces && result.length > 10) {
      // Count approximate words in original text (spaces + 1)
      const originalWordCount = (text.match(/\s+/g) || []).length + 1;
      const targetSpaces = Math.max(1, Math.floor(originalWordCount * 0.3)); // 30% of original spaces
      
      // Insert random spaces at random positions
      for (let i = 0; i < targetSpaces; i++) {
        const insertPos = Math.floor(Math.random() * (result.length - 2)) + 1; // Not at start/end
        result = result.slice(0, insertPos) + ' ' + result.slice(insertPos);
      }
    }

    // Enforce maximum word length to prevent layout-breaking long strings
    result = enforceMaxWordLength(result, options, text);

    // Handle length preservation
    if (!preserveLength) {
      // Randomly shorten or lengthen the text (10-150% of original length)
      const targetLength = Math.floor(text.length * (0.1 + Math.random() * 1.4));
      
      if (result.length < targetLength) {
        // Add random characters
        while (result.length < targetLength) {
          const randomChar = String.fromCharCode(Math.floor(Math.random() * 26) + 97);
          result += Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
        }
      } else if (result.length > targetLength) {
        // Truncate
        result = result.substring(0, targetLength);
      }
    }

    return result;
  }

  function scrambleByWords(text, options = {}) {
    const { 
      preserveCase = true, 
      preservePunctuation = true, 
      preserveSpaces = true
    } = options;

    // Split text into tokens (words, spaces, punctuation)
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
    
    // Process tokens and scramble words
    let result = tokens.map(token => {
      if (token.type === 'word') {
        return scrambleWord(token.content, options);
      } else if (token.type === 'space') {
        if (preserveSpaces) {
          return token.content; // Keep original spaces
        } else {
          // Replace spaces with random characters
          return token.content.split('').map(() => {
            const randomChar = String.fromCharCode(Math.floor(Math.random() * 26) + 97);
            return Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
          }).join('');
        }
      } else if (token.type === 'punctuation') {
        if (preservePunctuation) {
          return token.content; // Keep original punctuation
        } else {
          // Replace punctuation with random characters
          return token.content.split('').map(() => {
            const randomChar = String.fromCharCode(Math.floor(Math.random() * 26) + 97);
            return Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
          }).join('');
        }
      }
      return token.content;
    }).join('');

    // If we replaced spaces with characters, inject some random spaces back for readability
    if (!preserveSpaces && result.length > 10) {
      // Count original space tokens
      const originalSpaceCount = tokens.filter(token => token.type === 'space').length;
      const targetSpaces = Math.max(1, Math.floor(originalSpaceCount * 0.4)); // 40% of original spaces
      
      // Insert random spaces at random positions
      for (let i = 0; i < targetSpaces; i++) {
        const insertPos = Math.floor(Math.random() * (result.length - 2)) + 1; // Not at start/end
        result = result.slice(0, insertPos) + ' ' + result.slice(insertPos);
      }
    }

    // Enforce maximum word length to prevent layout-breaking long strings
    result = enforceMaxWordLength(result, options, text);

    return result;
  }

  function scrambleWord(word, options = {}) {
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
        const isUpper = char === char.toUpperCase();
        const randomChar = String.fromCharCode(
          Math.floor(Math.random() * 26) + 97 // Always start with lowercase
        );
        
        if (preserveCase) {
          // Preserve original case
          return isUpper ? randomChar.toUpperCase() : randomChar.toLowerCase();
        } else {
          // Randomly mix case
          return Math.random() < 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase();
        }
      } else if (/[0-9]/.test(char)) {
        return Math.floor(Math.random() * 10).toString();
      }
      return char;
    });
    
    return first + scrambledMiddle.join('') + last;
  }

  function enforceMaxWordLength(text, options = {}, originalText = '') {
    let { maxWordLength = 0 } = options; // Default 0 means "auto" mode
    
    // Auto mode: determine max word length from original content
    if (maxWordLength === 0) {
      const sourceText = originalText || text;
      const originalWords = sourceText.split(/\s+/);
      
      if (originalWords.length > 0) {
        // Find the longest word in the original text
        const longestWordLength = Math.max(...originalWords.map(word => word.length));
        maxWordLength = Math.max(8, longestWordLength); // Minimum of 8 characters
        log(`Auto-detected maxWordLength: ${maxWordLength} (longest original word: ${longestWordLength})`);
      } else {
        maxWordLength = 20; // Fallback if no words found
      }
    }
    
    if (!text || text.length <= maxWordLength) {
      return text;
    }

    // Split text by spaces to get individual words
    const words = text.split(' ');
    
    // Process each word and break it up if it's too long
    const processedWords = words.map(word => {
      if (word.length <= maxWordLength) {
        return word;
      }
      
      // Break long word into chunks
      const chunks = [];
      for (let i = 0; i < word.length; i += maxWordLength) {
        chunks.push(word.slice(i, i + maxWordLength));
      }
      
      // Join chunks with spaces
      return chunks.join(' ');
    });
    
    return processedWords.join(' ');
  }

  function replaceWithStatic(text, replacements) {
    if (!replacements || !Array.isArray(replacements)) return text;
    return getRandomFromArray(replacements);
  }

  function blurImage(element, blurAmount = '8px') {
    if (element.tagName !== 'IMG') return;
    element.style.filter = `blur(${blurAmount})`;
    element.style.transform = 'scale(1.02)'; // Prevent blur edge artifacts
  }

  function replaceImageSrc(element, placeholderUrl) {
    if (element.tagName !== 'IMG') return;
    try {
      const newSrc = chrome.runtime.getURL(placeholderUrl);
      element.src = newSrc;
    } catch (err) {
      error('Failed to replace image:', err);
    }
  }

  // === ELEMENT PROCESSING ===

  function processElement(element, transformation) {
    const { type, options = {}, name } = transformation;
    
    // CSS injection doesn't need an element and should only run once
    if (type === 'injectCSS') {
      // Check if this CSS transformation has already been processed globally
      if (hasBeenProcessed(document.documentElement, name)) {
        return; // Skip already processed
      }
      
      try {
        log(`Processing "${name}" (${type}) - global CSS injection`);
        processInjectCSS(options, name);
        
        // Mark as processed on document element to prevent re-injection
        markAsProcessed(document.documentElement, name);
        log(`✅ Completed "${name}" (${type}) - CSS injected`);
      } catch (err) {
        error(`Error processing CSS transformation "${name}":`, err);
      }
      return;
    }
    
    // All other transformations require an element
    if (!element || !transformation) return;
    
    // Check if this specific transformation has already been applied to this element
    if (hasBeenProcessed(element, name)) {
      return; // Skip already processed
    }
    
    try {
      const elementSig = getElementSignature(element);
      log(`Processing "${name}" (${type}) on ${elementSig}`);

      switch (type) {
        case 'customerReplace':
          processCustomerReplace(element, options);
          break;

        case 'scramble':
          processScramble(element, options);
          break;

        case 'staticReplace':
          processStaticReplace(element, options);
          break;

        case 'functionReplace':
          processFunctionReplace(element, options);
          break;

        case 'partialReplace':
          processPartialReplace(element, options);
          break;

        case 'blur':
          processBlur(element, options);
          break;

        case 'sensitiveText':
          processSensitiveText(element, options);
          break;

        default:
          error(`Unknown transformation type: ${type} in transformation "${name}"`);
          return;
      }

      // Mark this transformation as applied to this element
      markAsProcessed(element, name);
      log(`✅ Completed "${name}" (${type}) on ${elementSig}`);

    } catch (err) {
      error(`Error processing transformation "${transformation.name}":`, err);
    }
  }

  // === TRANSFORMATION PROCESSORS ===

  function processCustomerReplace(element, options) {
    if (!element.textContent.trim()) return;

    const { replaceWith, fallback = 'Unknown' } = options;
    let replacement;

    switch (replaceWith) {
      case 'customerName':
        replacement = getCustomerValue('name') || fallback;
        break;
      case 'customerDomain':
        replacement = getCustomerValue('domain') || fallback;
        break;
      default:
        replacement = fallback;
    }

    element.textContent = replacement;
  }

  function processScramble(element, options) {
    if (!element.textContent.trim()) return;
    scrambleDirectTextNodes(element, options);
  }

  function scrambleDirectTextNodes(element, options) {
    // Get all direct child nodes (including text nodes)
    const childNodes = Array.from(element.childNodes);
    
    childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        // This is a direct text node - scramble it
        const originalText = node.textContent;
        if (originalText.trim()) {
          node.textContent = scrambleText(originalText, options);
          log(`Scrambled direct text node: "${originalText}" → "${node.textContent}"`);
        }
      }
      // Leave element nodes (HTML tags) completely untouched
      // This preserves <span>, <strong>, <em>, <a>, etc. and their content
    });
  }

  function processStaticReplace(element, options) {
    if (!element.textContent.trim()) return;
    
    const { replacements = [] } = options;
    if (replacements.length > 0) {
      element.textContent = getRandomFromArray(replacements);
    }
  }

  function processFunctionReplace(element, options) {
    if (!element.textContent.trim()) return;
    
    const { functionName, functionArgs = {} } = options;
    
    if (!functionName) {
      error('processFunctionReplace: No functionName specified');
      return;
    }
    
    const replacement = executeReplacementFunction(functionName, functionArgs);
    element.textContent = replacement;
  }

  function processPartialReplace(element, options) {
    if (!element.textContent.trim()) return;
    
    const { 
      replacements = {},
      caseSensitive = false,
      useRegex = false,
      preserveHtml = true // Default to true since we want to preserve HTML
    } = options;
    
    if (Object.keys(replacements).length === 0) {
      log('processPartialReplace: No replacements specified');
      return;
    }

    let hasChanges = false;

    // Collect all replacements to perform
    const allReplacements = [];

    // First, automatically replace detected customer values
    if (detectedCustomer) {
      log('processPartialReplace: Detected customer, applying automatic replacements:', detectedCustomer);
      
      // Add customer name replacement
      if (detectedCustomer.name) {
        allReplacements.push({
          search: detectedCustomer.name,
          replace: getCustomerValue('name'),
          isRegex: false,
          description: 'auto customer name'
        });
      }
      
      // Add customer domain replacement
      if (detectedCustomer.domain) {
        allReplacements.push({
          search: detectedCustomer.domain,
          replace: getCustomerValue('domain'),
          isRegex: false,
          description: 'auto customer domain'
        });
      }
      
      // Add related words replacements (only if relatedWordsMode is explicitly configured)
      if (detectedCustomer.relatedWords && detectedCustomer.relatedWords.length > 0 && options.relatedWordsMode) {
        log(`Adding ${detectedCustomer.relatedWords.length} related words for replacement:`, detectedCustomer.relatedWords);
        
        const relatedWordsMode = options.relatedWordsMode;
        log(`Related words mode: ${relatedWordsMode}`);
        
        detectedCustomer.relatedWords.forEach((relatedWord, index) => {
          let replacement;
          
          if (relatedWordsMode === 'fixed') {
            // Use fixed replacement string
            replacement = options.relatedWordsReplacement || '[REDACTED]';
          } else if (relatedWordsMode === 'scramble') {
            // Scramble the related word
            const scrambleOptions = options.relatedWordsScrambleOptions || {};
            replacement = scrambleText(relatedWord, scrambleOptions);
          } else if (relatedWordsMode === 'smart') {
            // Smart mode - simple generic replacement
            replacement = '[REDACTED]';
          }
          
          allReplacements.push({
            search: relatedWord,
            replace: replacement,
            isRegex: false,
            description: `auto related word (${relatedWordsMode}): ${relatedWord}`
          });
          
          log(`Related word "${relatedWord}" → "${replacement}" (mode: ${relatedWordsMode})`);
        });
      }
      
      // Add customer ID replacement (if different from domain)
      if (detectedCustomer.id && detectedCustomer.id !== detectedCustomer.domain) {
        allReplacements.push({
          search: detectedCustomer.id,
          replace: getCustomerValue('domain'),
          isRegex: false,
          description: 'auto customer ID'
        });
      }
    }

    // Add manual replacements from config
    Object.entries(replacements).forEach(([searchPattern, replaceValue]) => {
      try {
        // Process replacement value for customer-specific placeholders
        let processedReplaceValue = replaceValue;
        
        // Handle customer value placeholders like {customerName}, {customerDomain}
        const customerMatches = replaceValue.match(/\{(customerName|customerDomain|customerId)\}/g);
        if (customerMatches) {
          customerMatches.forEach(match => {
            const valueType = match.slice(1, -1);
            let customerValue;
            
            switch (valueType) {
              case 'customerName':
                customerValue = getCustomerValue('name');
                break;
              case 'customerDomain':
                customerValue = getCustomerValue('domain');
                break;
              case 'customerId':
                customerValue = getCustomerValue('id');
                break;
              default:
                customerValue = match;
            }
            
            processedReplaceValue = processedReplaceValue.replace(match, customerValue);
          });
        }
        
        // Handle function placeholders like {generateRandomAuthorName}
        const functionMatches = replaceValue.match(/\{(\w+)\}/g);
        if (functionMatches) {
          functionMatches.forEach(match => {
            const functionName = match.slice(1, -1);
            if (replacementFunctions[functionName]) {
              try {
                const functionResult = executeReplacementFunction(functionName, {});
                processedReplaceValue = processedReplaceValue.replace(match, functionResult);
              } catch (err) {
                error(`Error executing function ${functionName} in partial replace:`, err);
              }
            }
          });
        }

        allReplacements.push({
          search: searchPattern,
          replace: processedReplaceValue,
          isRegex: useRegex,
          description: 'manual replacement'
        });
        
      } catch (err) {
        error(`Error processing replacement pattern "${searchPattern}":`, err);
      }
    });

    // Apply all replacements while preserving HTML structure
    if (allReplacements.length > 0) {
      hasChanges = replaceTextInElement(element, allReplacements, caseSensitive);
    }

    if (hasChanges) {
      log('processPartialReplace: Successfully applied text replacements while preserving HTML');
    }
  }

  // Helper function to replace text content while preserving HTML structure
  function replaceTextInElement(element, replacements, caseSensitive = false) {
    let hasChanges = false;

    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Process text nodes only
        let text = node.textContent;
        let originalText = text;

        replacements.forEach(({ search, replace, isRegex, description }) => {
          try {
            let newText;
            if (isRegex) {
              const flags = caseSensitive ? 'g' : 'gi';
              const regex = new RegExp(search, flags);
              newText = text.replace(regex, replace);
            } else {
              // Escape special regex characters for literal matching
              const escapedPattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const flags = caseSensitive ? 'g' : 'gi';
              const regex = new RegExp(escapedPattern, flags);
              newText = text.replace(regex, replace);
            }

            if (newText !== text) {
              text = newText;
              log(`Text replacement (${description}): "${search}" → "${replace}"`);
            }
          } catch (err) {
            error(`Error in text replacement for "${search}":`, err);
          }
        });

        if (text !== originalText) {
          node.textContent = text;
          hasChanges = true;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Recursively process child nodes of elements
        // Create a copy of childNodes since the list can change during processing
        const childNodes = Array.from(node.childNodes);
        childNodes.forEach(childNode => {
          processNode(childNode);
        });
      }
    }

    processNode(element);
    return hasChanges;
  }

  function processBlur(element, options) {
    const { blurAmount = '8px' } = options;
    blurImage(element, blurAmount);
  }

  function processInjectCSS(options, transformationName) {
    const { cssRules = [], cssFiles = [] } = options;
    
    log(`Processing CSS injection for "${transformationName}"`);
    
    // Inject CSS rules from config
    if (cssRules.length > 0) {
      injectCSSRules(cssRules, `redactosaurus-${transformationName}`);
    }
    
    // Load and inject external CSS files
    if (cssFiles.length > 0) {
      loadAndInjectCSSFiles(cssFiles, transformationName);
    }
  }

  function injectCSSRules(cssRules, styleId) {
    // Check if style already exists
    let styleElement = document.getElementById(styleId);
    if (styleElement) {
      log(`CSS already injected for ${styleId}, skipping`);
      return;
    }

    // Create CSS text from rules
    let cssText = '';
    cssRules.forEach(rule => {
      if (rule.selector && rule.properties) {
        cssText += `${rule.selector} {\n`;
        Object.entries(rule.properties).forEach(([property, value]) => {
          // Ensure !important is added if not present for critical styles
          const importantValue = value.includes('!important') ? value : `${value}`;
          cssText += `  ${property}: ${importantValue};\n`;
        });
        cssText += '}\n\n';
      }
    });

    if (cssText) {
      // Create and inject style element
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.setAttribute('data-redactosaurus', 'true');
      styleElement.textContent = cssText;
      
      // Insert into head as early as possible
      if (document.head) {
        document.head.appendChild(styleElement);
      } else {
        document.documentElement.appendChild(styleElement);
      }
      
      log(`Injected CSS rules for ${styleId}:`, cssRules.length, 'rules');
    }
  }

  async function loadAndInjectCSSFiles(cssFiles, transformationName) {
    for (const cssFile of cssFiles) {
      try {
        log(`Loading CSS file: ${cssFile}`);
        const cssUrl = chrome.runtime.getURL(cssFile);
        const response = await fetch(cssUrl);
        
        if (!response.ok) {
          error(`Failed to load CSS file ${cssFile}: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const cssContent = await response.text();
        
        // Create style element for this file
        const styleId = `redactosaurus-${transformationName}-${cssFile.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let styleElement = document.getElementById(styleId);
        
        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = styleId;
          styleElement.setAttribute('data-redactosaurus', 'true');
          styleElement.setAttribute('data-css-file', cssFile);
          styleElement.textContent = cssContent;
          
          if (document.head) {
            document.head.appendChild(styleElement);
          } else {
            document.documentElement.appendChild(styleElement);
          }
          
          log(`Injected CSS file: ${cssFile}`);
        }
        
      } catch (err) {
        error(`Error loading CSS file ${cssFile}:`, err);
      }
    }
  }

  function processSensitiveText(element, options) {
    if (!element.textContent.trim()) return;

    const { 
      scrambleAfterReplace = true,
      skipElementsContaining = [],
      preserveCase = true,
      preservePunctuation = true,
      preserveSpaces = true,
      preserveLength = true
    } = options;

    // Check if element contains children we should skip
    const hasImportantChildren = skipElementsContaining.some(tag => 
      element.querySelector(tag)
    );
    
    if (hasImportantChildren) {
      log('Skipping element with important children:', element);
      return;
    }

    let text = element.textContent;

    // First, replace any customer-specific values if detected
    if (detectedCustomer) {
      // Replace customer name variations
      if (detectedCustomer.name) {
        const nameRegex = new RegExp(detectedCustomer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        text = text.replace(nameRegex, getCustomerValue('name'));
      }
      
      // Replace customer domain variations
      if (detectedCustomer.domain) {
        const domainRegex = new RegExp(detectedCustomer.domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        text = text.replace(domainRegex, getCustomerValue('domain'));
      }
      
      // Replace customer ID variations
      if (detectedCustomer.id) {
        const idRegex = new RegExp(detectedCustomer.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        text = text.replace(idRegex, getCustomerValue('name'));
      }
    }

    // Then scramble the text if requested
    if (scrambleAfterReplace) {
      text = scrambleText(text, {
        preserveCase,
        preservePunctuation,
        preserveSpaces,
        preserveLength
      });
    }

    element.textContent = text;
  }

  // === CONTENT HIDING & REVEALING ===

  function hideContentImmediately() {
    if (!config || !config.transformations || !isEnabled) return;

    log('Hiding sensitive content immediately...');

    const hidingCSS = [];
    
    config.transformations.forEach(transformation => {
      if (!transformation.selectors) return;
      
      transformation.selectors.forEach(selector => {
        if (transformation.type === 'blur') {
          // Hide images with opacity
          hidingCSS.push(`${selector} { opacity: 0 !important; transition: opacity 0.3s ease; }`);
        } else {
          // Hide text content with visibility
          hidingCSS.push(`${selector} { visibility: hidden !important; }`);
        }
      });
    });

    if (hidingCSS.length > 0) {
      const style = document.createElement('style');
      style.id = 'redactosaurus-hide-style';
      style.textContent = hidingCSS.join('\n');
      
      // Insert as early as possible
      if (document.head) {
        document.head.appendChild(style);
      } else {
        document.documentElement.appendChild(style);
      }
      
      log('Content hidden with CSS');
    }
  }

  function revealAnonymizedContent() {
    const hideStyle = document.getElementById('redactosaurus-hide-style');
    if (hideStyle) {
      hideStyle.remove();
      log('Content revealed');
    }
  }

  function injectGlobalCSS() {
    if (!config || !config.globalCSS || !config.globalCSS.enabled) {
      return;
    }

    log('Injecting global CSS...');

    // Inject global CSS rules
    if (config.globalCSS.rules && config.globalCSS.rules.length > 0) {
      injectCSSRules(config.globalCSS.rules, 'redactosaurus-global-css');
    }

    // Load global CSS files
    if (config.globalCSS.files && config.globalCSS.files.length > 0) {
      loadAndInjectCSSFiles(config.globalCSS.files, 'global');
    }

    // Add demo mode indicator
    showDemoModeIndicator();
  }

  function showDemoModeIndicator() {
    // Check if demo indicator is enabled in config
    if (!config?.settings?.showDemoIndicator) {
      return;
    }

    // Check if indicator already exists
    if (document.getElementById('redactosaurus-demo-indicator')) {
      return;
    }

    // Create demo mode indicator element
    const indicator = document.createElement('div');
    indicator.id = 'redactosaurus-demo-indicator';
    indicator.className = 'redactosaurus-demo-mode';
    indicator.textContent = '🦕 DEMO MODE';
    indicator.title = 'VIP Redactosaurus is actively anonymizing content on this page';

    // Add to page as early as possible
    if (document.body) {
      document.body.appendChild(indicator);
    } else if (document.documentElement) {
      document.documentElement.appendChild(indicator);
    } else {
      // If neither body nor documentElement exist yet, wait a bit
      setTimeout(() => {
        if (document.body) {
          document.body.appendChild(indicator);
        } else if (document.documentElement) {
          document.documentElement.appendChild(indicator);
        }
      }, 100);
    }

    log('Demo mode indicator shown');
  }

  function hideDemoModeIndicator() {
    const indicator = document.getElementById('redactosaurus-demo-indicator');
    if (indicator) {
      indicator.remove();
      log('Demo mode indicator hidden');
    }
  }

  // === MAIN PROCESSING FUNCTIONS ===

  function processAllElements() {
    if (!config || !config.transformations || !isEnabled) return;

    processingCounter++;
    const cycleStart = performance.now();
    
    log(`=== PROCESSING CYCLE #${processingCounter} START ===`);

    let totalElementsFound = 0;
    let totalElementsProcessed = 0;
    let totalElementsSkipped = 0;

    config.transformations.forEach(transformation => {
      if (!transformation.selectors) return;
      
      log(`Processing transformation: ${transformation.name} (${transformation.type})`);
      
      transformation.selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          totalElementsFound += elements.length;
          
          log(`  Selector "${selector}": ${elements.length} elements found`);
          
          if (elements.length === 0) {
            log(`  ⚠️ No elements found for selector "${selector}"`);
          }
          
          elements.forEach((element, index) => {
            const elementSig = getElementSignature(element);
            
            if (hasBeenProcessed(element, transformation.name)) {
              totalElementsSkipped++;
              // Only log skipped elements occasionally to reduce noise
              if (processingCounter <= 3 || processingCounter % 10 === 0) {
                log(`  Skipping already processed ${elementSig}`);
              }
            } else {
              totalElementsProcessed++;
              processElement(element, transformation);
            }
          });
        } catch (err) {
          error(`Invalid selector "${selector}" in transformation "${transformation.name}":`, err);
        }
      });
    });

    const cycleTime = performance.now() - cycleStart;
    
    if (totalElementsProcessed > 0 || processingCounter <= 3 || processingCounter % 10 === 0) {
      log(`=== CYCLE #${processingCounter} COMPLETE ===`);
      log(`  Found: ${totalElementsFound}, Processed: ${totalElementsProcessed}, Skipped: ${totalElementsSkipped}`);
      log(`  Cycle time: ${cycleTime.toFixed(2)}ms`);
    }

    // Clean up orphaned elements from tracking occasionally
    if (processingCounter % 50 === 0) {
      cleanupOrphanedElements();
    }
  }

  function cleanupOrphanedElements() {
    // Remove tracking for elements that are no longer in the DOM
    let cleanedCount = 0;
    const elementsToRemove = [];
    
    // Check processed elements map
    for (const [element] of processedElementsMap) {
      if (!document.contains(element)) {
        elementsToRemove.push(element);
        cleanedCount++;
      }
    }
    
    // Check content hashes map
    for (const [element] of elementContentHashes) {
      if (!document.contains(element) && !elementsToRemove.includes(element)) {
        elementsToRemove.push(element);
        cleanedCount++;
      }
    }
    
    // Remove orphaned elements from all tracking
    elementsToRemove.forEach(element => {
      processedElementsMap.delete(element);
      elementContentHashes.delete(element);
    });
    
    if (cleanedCount > 0) {
      log(`Cleaned up ${cleanedCount} orphaned elements from tracking and content hashes`);
    }
  }

  function startContinuousProcessing() {
    if (processTimer) return;

    const interval = config?.settings?.processInterval || 100;
    
    processTimer = setInterval(() => {
      if (!isEnabled) return;
      processAllElements();
    }, interval);

    log(`Started continuous processing every ${interval}ms`);
  }

  function stopContinuousProcessing() {
    if (processTimer) {
      clearInterval(processTimer);
      processTimer = null;
      log('Stopped continuous processing');
    }
  }

  // === MUTATION OBSERVER ===

  function setupMutationObserver() {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      let hasNewContent = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              hasNewContent = true;
            }
          });
        }
      });

      if (hasNewContent && isEnabled) {
        // Debounce the processing
        setTimeout(processAllElements, 50);
      }
    });

    mutationObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    log('MutationObserver setup complete');
  }

  // === CONFIGURATION & STATE ===

  async function loadConfiguration() {
    const maxRetries = config?.settings?.maxRetries ?? 10; // Default fallback
    let retryCount = 0;

    while (maxRetries === 0 || retryCount < maxRetries) {
      try {
        const configUrl = chrome.runtime.getURL('content/config.json');
        const response = await fetch(configUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        config = await response.json();
        log('Configuration loaded successfully');
        return true;
      } catch (err) {
        retryCount++;
        
        if (maxRetries === 0) {
          error(`Failed to load configuration (attempt ${retryCount}), retrying indefinitely:`, err);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        } else if (retryCount >= maxRetries) {
          error(`Failed to load configuration after ${maxRetries} attempts:`, err);
          return false;
        } else {
          error(`Failed to load configuration (attempt ${retryCount}/${maxRetries}), retrying:`, err);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }
    }
    
    return false;
  }

  async function loadExtensionState() {
    try {
      const result = await chrome.storage.local.get(['enabled']);
      isEnabled = result.enabled !== false; // Default to true
      log('Extension state loaded:', { isEnabled });
    } catch (err) {
      error('Failed to load extension state:', err);
      isEnabled = true;
    }
  }

  // === INITIALIZATION ===

  async function initialize() {
    if (isInitialized) return;

    log('Initializing VIP Redactosaurus...');

    // Load configuration and state
    const configLoaded = await loadConfiguration();
    if (!configLoaded) {
      error('Failed to load configuration, aborting initialization');
      return;
    }

    await loadExtensionState();

    // FIRST THING: Detect customer from URL
    detectedCustomer = detectCustomerFromUrl();
    if (detectedCustomer) {
      log('Customer detection complete:', detectedCustomer);
    } else {
      log('No customer detected, will use fallback values');
    }

    if (isEnabled) {
      // Phase 1: Hide content immediately
      hideContentImmediately();

      // Phase 1.5: Inject global CSS immediately
      injectGlobalCSS();

      // Phase 2: Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', continueInitialization);
      } else {
        continueInitialization();
      }
    }

    isInitialized = true;
    log('Initialization complete');
  }

  function continueInitialization() {
    if (!isEnabled) return;

    log('Continuing initialization after DOM ready...');

    // Wait for document.body with retry logic
    waitForBody(() => {
      // Process existing content
      processAllElements();

      // Set up continuous processing and mutation observer
      setupMutationObserver();
      startContinuousProcessing();

      // Reveal content after initial processing
      setTimeout(revealAnonymizedContent, 300);
    });
  }

  function waitForBody(callback) {
    const maxRetries = config?.settings?.maxRetries ?? 10;
    let retryCount = 0;

    function checkBody() {
      if (document.body) {
        log('Document body found, proceeding with initialization');
        callback();
        return;
      }

      retryCount++;
      
      if (maxRetries === 0) {
        log(`Document body not ready (attempt ${retryCount}), retrying indefinitely...`);
        setTimeout(checkBody, 50);
      } else if (retryCount >= maxRetries) {
        error(`Document body not ready after ${maxRetries} attempts, giving up`);
        return;
      } else {
        log(`Document body not ready (attempt ${retryCount}/${maxRetries}), retrying...`);
        setTimeout(checkBody, 50);
      }
    }

    checkBody();
  }

  // === MESSAGE HANDLING ===

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request);

    switch (request.action) {
      case 'toggle':
        isEnabled = request.enabled;
        
        if (isEnabled) {
          hideContentImmediately();
          processAllElements();
          setupMutationObserver();
          startContinuousProcessing();
          setTimeout(revealAnonymizedContent, 300);
        } else {
          stopContinuousProcessing();
          revealAnonymizedContent();
          hideDemoModeIndicator();
          // Reset processed elements to allow re-processing when re-enabled
          resetProcessedElements();
        }
        
        sendResponse({ success: true, enabled: isEnabled });
        break;

      case 'getStatus':
        sendResponse({ 
          enabled: isEnabled, 
          initialized: isInitialized,
          hasConfig: !!config 
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  });

  // === STARTUP ===

  // Start initialization immediately
  initialize();

})();