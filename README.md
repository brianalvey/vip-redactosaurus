# VIP Tour Anonymizer

A Chrome extension that anonymizes specific content on webpages **before they render**, enabling safe product demos without revealing private customer data. The extension prevents any flash of non-anonymized content, making it perfect for walkthrough videos and screen recordings.

## 🚀 Features

- **No Flash of Content**: Content is anonymized before the page loads
- **Configurable Selectors**: Target content using CSS selectors, IDs, and XPath
- **Multiple Transformation Types**:
  - **Text Scrambling**: Preserves case, punctuation, and spaces
  - **Static Replacement**: Replace names with preset alternatives
  - **Image Blurring**: Blur sensitive images
  - **Image Replacement**: Swap images with placeholders
- **Dynamic Content Support**: Handles SPAs and dynamically loaded content
- **Easy Toggle**: Enable/disable anonymization via popup

## 📁 Project Structure

```
vip-tour/
├── manifest.json              # Chrome extension manifest
├── content/
│   ├── anonymizer.js          # Main content script
│   └── config.json            # Transformation configuration
├── background/
│   └── background.js          # Service worker
├── popup/
│   ├── popup.html            # Extension popup UI
│   └── popup.js              # Popup functionality
├── assets/
│   ├── placeholder.jpg        # Image replacement placeholder
│   ├── icon16.png            # Extension icon (16x16)
│   ├── icon48.png            # Extension icon (48x48)
│   └── icon128.png           # Extension icon (128x128)
└── README.md                 # This file
```

## 🛠 Installation

1. **Clone or download** this repository
2. **Replace placeholder assets**:
   - Replace `assets/placeholder.jpg` with an actual placeholder image
   - Replace icon files with actual PNG icons (16x16, 48x48, 128x128)
3. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked" and select this folder
4. **Configure** (optional):
   - Edit `content/config.json` to customize selectors and transformations

## ⚙️ Configuration

The extension uses `content/config.json` to define what content to anonymize and how:

### Transformation Types

1. **`scramble`**: Randomizes text while preserving formatting
   ```json
   {
     "type": "scramble",
     "options": {
       "preserveCase": true,
       "preservePunctuation": true,
       "preserveSpaces": true
     }
   }
   ```

2. **`static_replacement`**: Replaces text with preset alternatives
   ```json
   {
     "type": "static_replacement",
     "options": {
       "replacements": {
         "first_names": ["Alex", "Sam", "Jordan"],
         "last_names": ["Smith", "Johnson", "Williams"]
       }
     }
   }
   ```

3. **`blur`**: Applies blur filter to images
   ```json
   {
     "type": "blur",
     "options": {
       "blurAmount": "10px",
       "fallbackImage": "assets/placeholder.jpg"
     }
   }
   ```

4. **`replace_image`**: Swaps images with placeholders
   ```json
   {
     "type": "replace_image",
     "options": {
       "replacementImage": "assets/placeholder.jpg",
       "preserveDimensions": true
     }
   }
   ```

### Adding Custom Selectors

To target specific content, add selectors to the configuration:

```json
{
  "name": "custom_content",
  "selectors": [
    ".my-custom-class",
    "#specific-id",
    "[data-testid='sensitive-data']",
    "img[src*='private']"
  ],
  "type": "scramble"
}
```

## 🎯 Usage

1. **Install the extension** (see Installation above)
2. **Navigate to any webpage** where you want to anonymize content
3. **Click the extension icon** in Chrome's toolbar
4. **Toggle anonymization** on/off using the switch
5. **Content is automatically anonymized** based on your configuration

## 🔧 Customization

### Adding New Transformation Types

1. Add your transformation function to `transformers` object in `content/anonymizer.js`
2. Add the transformation type to the `applyTransformation` function
3. Update your `config.json` to use the new transformation type

### Targeting Specific Sites

Modify the `matches` field in `manifest.json` to target specific URLs:

```json
"matches": [
  "https://your-dashboard.com/*",
  "https://app.yourcompany.com/*"
]
```

## 🚨 Important Notes

- **Content Script Timing**: The extension runs at `document_start` to prevent flash of non-anonymized content
- **Dynamic Content**: Uses MutationObserver to handle SPAs and dynamically loaded content
- **Performance**: Transformations are applied efficiently to avoid performance impact
- **Privacy**: All processing happens locally in the browser

## 🐛 Troubleshooting

1. **Content not being anonymized**: Check your selectors in `config.json`
2. **Extension not working**: Ensure it's enabled in `chrome://extensions/`
3. **Images not loading**: Replace placeholder files with actual images
4. **Performance issues**: Reduce the number of selectors or transformations

## 📝 License

This project is open source and available under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Note**: Replace all placeholder files in the `assets/` directory with actual images before using the extension.
