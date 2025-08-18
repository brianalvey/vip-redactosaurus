// VIP Redactosaurus - Clean Chrome Extension for Content Anonymization
// Runs at document_start to prevent flash of non-anonymized content

(function() {
  'use strict';

  // Global state
  let config = null;
  let isEnabled = true;
  let processedElements = new WeakSet();
  let observer = null;

  // JavaScript functions for dynamic value generation
  const dynamicFunctions = {
    randomAuthorName: function() {
      const firstNames = ["Aisha", "Benjamin", "Carmen", "Dmitri", "Elena", "Finn", "Grace", "Hassan", "Isabella", "Jin", "Kenji", "Lucia", "Miguel", "Nora", "Omar", "Priya", "Quinn", "Raj", "Sofia", "Tomoko", "Ulrich", "Veronica", "Wei", "Ximena", "Yuki", "Zara", "Adrian", "Beatrice", "Carlos", "Diana", "Ethan", "Fatima", "Gabriel", "Hana", "Ivan", "Jasmine", "Klaus", "Leila", "Marco", "Natasha", "Oscar", "Petra", "Quincy", "Rosa", "Sebastian", "Tara", "Uri", "Victoria", "Wolfgang", "Xander", "Yvette", "Zachary"];
      const lastNames = ["Anderson", "Blackwood", "Chen", "Delacroix", "Eriksson", "Fernandez", "Gonzalez", "Hoffman", "Ivanov", "Jackson", "Kim", "Lopez", "Murphy", "Nakamura", "O'Brien", "Patel", "Quinn", "Rodriguez", "Singh", "Thompson", "Ueda", "Volkov", "Williams", "Xu", "Yamamoto", "Ziegler", "Abramovich", "Brennan", "Castillo", "Davies", "Engström", "Fischer", "García", "Hashimoto", "Ibrahim", "Jensen", "Kowalski", "Laurent", "Martínez", "Nielsen", "Okafor", "Petrov", "Qureshi", "Rossi", "Swanson", "Taylor", "Underwood", "Varga", "Walsh", "Xiang", "Yoshida", "Zimmerman"];
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      return `${firstName} ${lastName}`;
    },

    randomCompanyName: function() {
      const adjectives = ['Global', 'Dynamic', 'Innovation', 'Prime', 'Elite', 'Advanced', 'Strategic', 'Digital'];
      const nouns = ['Solutions', 'Systems', 'Technologies', 'Media', 'Networks', 'Industries', 'Corp', 'Group'];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      return `${adj} ${noun}`;
    },

    randomDomain: function() {
      const domains = ['example.com', 'sample-site.com', 'demo-company.org', 'test-domain.net', 'placeholder.co'];
      return domains[Math.floor(Math.random() * domains.length)];
    },

    randomEmail: function() {
      const users = ['contact', 'info', 'hello', 'support', 'team'];
      const user = users[Math.floor(Math.random() * users.length)];
      return `${user}@${this.randomDomain()}`;
    },

    randomPhoneNumber: function() {
      const areaCodes = ['555', '123', '456', '789'];
      const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
      const number = Math.floor(Math.random() * 9000000) + 1000000;
      return `(${areaCode}) ${Math.floor(number / 10000)}-${number % 10000}`;
    },

    placeholderText: function(length = 'medium') {
      const short = 'Lorem ipsum dolor sit amet';
      const medium = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod';
      const long = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
      
      switch(length) {
        case 'short': return short;
        case 'long': return long;
        default: return medium;
      }
    }
  };

  // Core transformation functions
  const transformers = {
    
    // Scramble text while preserving structure
    scramble: function(text, options = {}) {
      const { 
        preserveCase = true, 
        preservePunctuation = true, 
        preserveSpaces = true,
        preserveEnds = false,
        preservePosition = true,
        preserveVowels = false
      } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      // If preserveEnds is enabled, use word-based scrambling
      if (preserveEnds) {
        return this.scrambleByWords(text, options);
      }
      
      // Character-by-character scrambling
      const chars = text.split('');
      const scrambled = [];
      
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        
        if (preserveSpaces && char === ' ') {
          scrambled.push(' ');
        } else if (preservePunctuation && /[^\w\s]/.test(char)) {
          scrambled.push(char);
        } else if (/[a-zA-Z]/.test(char)) {
          // Scramble letters with vowel/consonant awareness
          const isUpperCase = char === char.toUpperCase();
          let randomChar;
          
          if (preserveVowels) {
            const isVowel = /[aeiouAEIOU]/.test(char);
            if (isVowel) {
              // Replace vowel with random vowel
              const vowels = isUpperCase ? 'AEIOU' : 'aeiou';
              randomChar = vowels[Math.floor(Math.random() * vowels.length)];
            } else {
              // Replace consonant with random consonant
              const consonants = isUpperCase ? 'BCDFGHJKLMNPQRSTVWXYZ' : 'bcdfghjklmnpqrstvwxyz';
              randomChar = consonants[Math.floor(Math.random() * consonants.length)];
            }
          } else {
            // Regular random letter replacement
            randomChar = String.fromCharCode(
              isUpperCase ? 
                Math.floor(Math.random() * 26) + 65 : // A-Z
                Math.floor(Math.random() * 26) + 97    // a-z
            );
          }
          
          scrambled.push(randomChar);
        } else if (/[0-9]/.test(char)) {
          // Replace with random digit
          scrambled.push(Math.floor(Math.random() * 10).toString());
        } else {
          scrambled.push(char);
        }
      }
      
      return scrambled.join('');
    },

    // Word-based scrambling that preserves first/last characters
    scrambleByWords: function(text, options = {}) {
      const { 
        preserveCase = true, 
        preservePunctuation = true, 
        preserveSpaces = true,
        preservePosition = true,
        preserveVowels = false
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
          const scrambledWord = this.scrambleWord(token.content, { preserveCase, preserveVowels });
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
      const { preserveCase = true, preserveVowels = false } = options;
      
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
          
          if (preserveVowels) {
            const isVowel = /[aeiouAEIOU]/.test(char);
            if (isVowel) {
              // Replace vowel with random vowel
              const vowels = isUpperCase ? 'AEIOU' : 'aeiou';
              return vowels[Math.floor(Math.random() * vowels.length)];
            } else {
              // Replace consonant with random consonant
              const consonants = isUpperCase ? 'BCDFGHJKLMNPQRSTVWXYZ' : 'bcdfghjklmnpqrstvwxyz';
              return consonants[Math.floor(Math.random() * consonants.length)];
            }
          } else {
            // Original random letter logic
            return String.fromCharCode(
              isUpperCase ? 
                Math.floor(Math.random() * 26) + 65 : // A-Z
                Math.floor(Math.random() * 26) + 97    // a-z
            );
          }
        } else if (/[0-9]/.test(char)) {
          return Math.floor(Math.random() * 10).toString();
        }
        return char;
      });
      
      return first + scrambledMiddle.join('') + last;
    },

    // Replace text with predefined alternatives or JavaScript functions
    staticReplace: function(text, options = {}) {
      const { replacements = {}, caseSensitive = false } = options;
      
      if (!text || typeof text !== 'string') return text;
      
      // Handle arrays of replacement options
      if (replacements.names && Array.isArray(replacements.names)) {
        const randomName = replacements.names[Math.floor(Math.random() * replacements.names.length)];
        return randomName;
      }
      
      // Handle JavaScript function replacements
      if (replacements.jsFunction) {
        const functionName = replacements.jsFunction;
        if (dynamicFunctions[functionName] && typeof dynamicFunctions[functionName] === 'function') {
          try {
            return dynamicFunctions[functionName]();
          } catch (error) {
            console.warn(`VIP Redactosaurus: Error calling function ${functionName}:`, error);
            return text; // Return original text on error
          }
        } else {
          console.warn(`VIP Redactosaurus: Function ${functionName} not found`);
          return text;
        }
      }
      
      // Handle direct string replacements with function interpolation
      let result = text;
      Object.entries(replacements).forEach(([search, replace]) => {
        if (typeof replace === 'string') {
          // Check if replacement contains JavaScript function references {functionName}
          let processedReplace = replace;
          const functionMatches = replace.match(/\{(\w+)\}/g);
          
          if (functionMatches) {
            functionMatches.forEach(match => {
              const functionName = match.slice(1, -1); // Remove { }
              if (dynamicFunctions[functionName] && typeof dynamicFunctions[functionName] === 'function') {
                try {
                  const functionResult = dynamicFunctions[functionName]();
                  processedReplace = processedReplace.replace(match, functionResult);
                } catch (error) {
                  console.warn(`VIP Redactosaurus: Error calling function ${functionName}:`, error);
                }
              }
            });
          }
          
          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
          result = result.replace(regex, processedReplace);
        }
      });
      
      return result;
    },

    // Blur images
    blur: function(element, options = {}) {
      const { blurAmount = '10px' } = options;
      
      if (!element || element.tagName !== 'IMG') return;
      
      element.style.filter = `blur(${blurAmount})`;
      element.style.transform = 'scale(1.03)'; // Prevent blur edge artifacts
    },

    // Replace images with placeholder
    replaceImage: function(element, options = {}) {
      const { placeholderUrl = 'assets/placeholder.jpg' } = options;
      
      if (!element || element.tagName !== 'IMG') return;
      
      try {
        const newSrc = chrome.runtime.getURL(placeholderUrl);
        element.src = newSrc;
      } catch (error) {
        console.warn('VIP Redactosaurus: Failed to replace image:', error);
      }
    },

    // Mask link URLs
    maskLinks: function(element, options = {}) {
      const { maskUrl = 'https://example.com' } = options;
      
      if (!element || element.tagName !== 'A') return;
      if (element.hasAttribute('data-redacto-masked')) return;
      
      const originalHref = element.href;
      if (!originalHref || originalHref === maskUrl) return;
      
      // Store original URL
      element.setAttribute('data-redacto-original', originalHref);
      element.setAttribute('data-redacto-masked', 'true');
      
      // Mask the URL
      element.href = maskUrl;
      
      // Restore on click
      element.addEventListener('click', function(e) {
        e.preventDefault();
        const original = element.getAttribute('data-redacto-original');
        if (original) {
          if (e.ctrlKey || e.metaKey || element.target === '_blank') {
            window.open(original, '_blank');
          } else {
            window.location.href = original;
          }
        }
      });
    }
  };

  // Apply a transformation to an element
  function applyTransformation(element, transformation) {
    if (!element || !transformation || !isEnabled) return;
    
    // Skip if already processed
    if (processedElements.has(element)) return;
    
    try {
      switch (transformation.type) {
        case 'scramble':
          if (element.textContent) {
            element.textContent = transformers.scramble(element.textContent, transformation.options);
          }
          break;
          
        case 'static_replace':
          if (element.textContent) {
            element.textContent = transformers.staticReplace(element.textContent, transformation.options);
          }
          break;
          
        case 'blur':
          transformers.blur(element, transformation.options);
          break;
          
        case 'replace_image':
          transformers.replaceImage(element, transformation.options);
          break;
          
        case 'mask_links':
          transformers.maskLinks(element, transformation.options);
          break;
      }
      
      // Mark as processed
      processedElements.add(element);
      
    } catch (error) {
      console.warn('VIP Redactosaurus: Transformation error:', error);
    }
  }

  // Process elements matching selectors
  function processSelectors(selectors, transformation) {
    if (!selectors || !Array.isArray(selectors)) return;
    
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (!processedElements.has(element)) {
            applyTransformation(element, transformation);
          }
        });
      } catch (error) {
        console.warn(`VIP Redactosaurus: Invalid selector "${selector}":`, error);
      }
    });
  }

  // Process all configured transformations
  function processAllTransformations() {
    if (!config || !config.transformations || !isEnabled) return;
    
    config.transformations.forEach(transformation => {
      if (transformation.selectors) {
        processSelectors(transformation.selectors, transformation);
      }
    });
  }

  // Set up MutationObserver for dynamic content
  function setupObserver() {
    if (observer) return; // Already set up
    
    observer = new MutationObserver(mutations => {
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
      
      // Debounce: only process if we actually have new content
      if (hasNewContent) {
        setTimeout(processAllTransformations, 10);
      }
    });
    
    // Start observing
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Load configuration
  async function loadConfig() {
    try {
      const configUrl = chrome.runtime.getURL('content/config.json');
      const response = await fetch(configUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      config = await response.json();
      console.log('VIP Redactosaurus: Config loaded successfully');
    } catch (error) {
      console.error('VIP Redactosaurus: Failed to load config:', error);
      // Use minimal fallback config
      config = { transformations: [] };
    }
  }

  // Load extension state
  async function loadState() {
    try {
      const result = await chrome.storage.local.get(['enabled']);
      isEnabled = result.enabled !== false; // Default to true
    } catch (error) {
      console.warn('VIP Redactosaurus: Could not load state:', error);
      isEnabled = true;
    }
  }

  // Initialize the extension
  async function init() {
    // Load config and state
    await loadConfig();
    await loadState();
    
    console.log('VIP Redactosaurus: Initialized, enabled:', isEnabled);
    
    // Process existing content if enabled
    if (isEnabled) {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processAllTransformations);
      } else {
        processAllTransformations();
      }
    }
    
    // Set up observer for dynamic content
    if (document.body) {
      setupObserver();
    } else {
      document.addEventListener('DOMContentLoaded', setupObserver);
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      isEnabled = request.enabled;
      console.log('VIP Redactosaurus: Toggled to:', isEnabled);
      
      if (isEnabled) {
        // Re-process content when re-enabling
        processAllTransformations();
      }
      
      sendResponse({ success: true });
    } else if (request.action === 'getStatus') {
      sendResponse({ enabled: isEnabled });
    }
  });

  // Start the extension
  init();

})();
