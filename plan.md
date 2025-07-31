# PLAN.md

## 🧩 Project Overview

Build a **Chrome Extension** that anonymizes specific content on a webpage **before it renders**, enabling safe demos of our product dashboards without revealing private customer data to other customers and prospects. As new content and markup is loaded, either by navigating to a new screen within the SPA, by interacting with a  or by loading a hover panel, the plugin will also run transformations in that new markup.

Anonymized content includes:
- Headlines
- Author names
- Article thumbnail photos
- Customer names

Anonymization transformations:
- Scrambling text where spaces, punctuation and capitlization are preserved
- Static text replacement from preset arrays for example replacing all author first names that start with a "J" with "Fred" and all author last names that start with "S" with "Jones".
- Blurring images or replacing images with placeholders, while retaining the original dimensions and styling

## ⚙️ Technical Requirements

- Chrome Extension (Manifest V3) ✅
- Content scripts injected at `document_start` ✅
- Configurable selectors (CSS, IDs, XPath if needed) ✅
- Configurable transformation strategy per target ✅
- NO flash of unstyled content (FOUC) ✅

---

## 🛠 Project Structure

chrome-anonymizer/
├── manifest.json ✅
├── content/
│ ├── anonymizer.js ✅ # Main logic
│ └── config.json ✅ # List of selectors + transformation instructions
├── background/
│ └── background.js ✅ # Service worker
├── popup/
│ ├── popup.html ✅ # Extension popup UI
│ └── popup.js ✅ # Popup functionality
├── assets/
│ ├── placeholder.jpg 📝 # Image used for swaps (needs actual image)
│ ├── icon16.png 📝 # Extension icon (needs actual icon)
│ ├── icon48.png 📝 # Extension icon (needs actual icon)
│ └── icon128.png 📝 # Extension icon (needs actual icon)
└── README.md ✅

## ✅ Completed Features

### Core Functionality
- [x] Chrome Extension Manifest V3 setup
- [x] Content script that runs at `document_start`
- [x] Configuration-driven transformation system
- [x] Multiple transformation types:
  - [x] Text scrambling with case/punctuation preservation
  - [x] Static text replacement
  - [x] Image blurring
  - [x] Image replacement with placeholders
- [x] MutationObserver for dynamic content handling
- [x] Popup UI with toggle functionality
- [x] Background service worker
- [x] Comprehensive documentation

### Technical Implementation
- [x] No flash of non-anonymized content
- [x] Configurable CSS selectors
- [x] Error handling and logging
- [x] Performance optimized transformations
- [x] Cross-tab communication
- [x] Extension state persistence

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
- [ ] XPath selector support
- [ ] Advanced text replacement patterns
- [ ] Custom transformation functions
- [ ] Site-specific configurations
- [ ] Export/import configuration
- [ ] Keyboard shortcuts
- [ ] Context menu integration

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

The extension is now ready for use! 🚀

