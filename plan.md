# PLAN.md

## 🧩 Project Overview

Build a **Chrome Extension** that anonymizes specific content on a webpage **before it renders**, enabling safe demos of our product dashboards without revealing private customer data to other customers and prospects. As new content and markup is loaded, either by navigating to a new screen within the SPA, by interacting with elements or by loading a hover panel, the plugin will also run transformations in that new markup. Run these transformations every 100ms and make that timer value configurable.

The two most important items to hide are the customer name and customer domain. Depending on the URL pattern of the webpage, we might know the customer ID. If so, we can map that to a list of known customer names and domains to be replaced. If not, we will have to grab those two values from the webpage itself and use those values to hide customer data throughout the page.

Each time an element has its contents transformed, we should store the original and new data in HTML attributes so we can detect which elements do or don't change over time and not repeat anonymization on those elements.

Anonymized content includes:
- Headlines
- Author names
- Article thumbnail photos
- Customer names
- Link URLs

Anonymization transformations:
- Scrambling text where spaces, punctuation and capitlization are preserved
- Static text replacement from preset arrays for example replacing all author first names that start with a "J" with "Fred" and all author last names that start with "S" with "Jones".
- Blurring images or replacing images with either online or local placeholders, while retaining the original dimensions and styling

## ⚙️ Technical Requirements

- Chrome Extension (Manifest V3)
- Content scripts injected at `document_start`
- Configurable selectors (CSS, XPath)
- Configurable transformation strategy per target
- NO flash of unstyled content (FOUC)

---

## 🛠 Project Structure

chrome-anonymizer/
├── manifest.json
├── content/
│ ├── redactosaurus.js # Main logic
│ └── config.json # List of selectors + transformation instructions
├── background/
│ └── background.js # Service worker
├── popup/
│ ├── popup.html # Extension popup UI
│ └── popup.js # Popup functionality
├── assets/
│ ├── placeholder.jpg 📝 # Image used for swaps (needs actual image)
│ ├── icon16.png 📝 # Extension icon (needs actual icon)
│ ├── icon48.png 📝 # Extension icon (needs actual icon)
│ └── icon128.png 📝 # Extension icon (needs actual icon)
└── README.md ✅

## ✅ Completed Features

### Core Functionality
- [ ] Chrome Extension Manifest V3 setup
- [ ] Content script that runs at `document_start`
- [ ] Configuration-driven transformation system
- [ ] Multiple transformation types:
  - [ ] Text scrambling with case/punctuation preservation
  - [ ] Static text replacement
  - [ ] Image blurring
  - [ ] Image replacement with placeholders
- [ ] MutationObserver for dynamic content handling
- [ ] Popup UI with toggle functionality
- [ ] Background service worker
- [ ] Comprehensive documentation

### Technical Implementation
- [ ] No flash of non-anonymized content
- [ ] Configurable CSS selectors
- [ ] Error handling and logging
- [ ] Performance optimized transformations
- [ ] Cross-tab communication
- [ ] Extension state persistence

## 📝 Next Steps

### Immediate Tasks
1. **Replace placeholder assets**:
   - Create actual placeholder image (400x300px JPG)
   - Create extension icons (16x16, 48x48, 128x128 PNG)
   - Replace placeholder files in `assets/` directory

2. **Test the extension**:
   - Load in Chrome as unpacked extension
   - Test on various websites
   - Verify no flash of original content
   - Test with SPAs and dynamic content

3. **Customize configuration**:
   - Update `content/config.json` with your specific selectors
   - Add transformations for your dashboard elements
   - Test with your actual product pages

### Future Enhancements
- [ ] Custom transformation functions
- [ ] Site-specific configurations
- [ ] Manage some configuration from plugin settings UI

### Testing Checklist
- [ ] Extension loads without errors
- [ ] Content is anonymized before page renders
- [ ] Dynamic content is handled properly
- [ ] Toggle functionality works
- [ ] No performance impact
- [ ] Works across different websites
- [ ] Handles various content types (text, images, etc.)

## 🎯 Usage Instructions

1. Replace placeholder assets with actual images/icons
2. Load extension in Chrome (chrome://extensions/ → Developer mode → Load unpacked)
3. Navigate to target website
4. Click extension icon to toggle anonymization
5. Content will be automatically anonymized based on configuration


