# VIP Redactosaurus

A Chrome extension that anonymizes specific content patterns on webpages **before they render**, allowing safe product demos that don't reveal private customer data. This extension prevents flashes of non-anonymized content, making it perfect for walkthrough videos and screen recordings.

## 🚀 Features

- **No Flash of Content**: Content is anonymized before the page loads
- **Configurable Selectors**: Target content using CSS selectors, IDs, and XPath
- **Multiple Transformation Types**:
  - **Text Scrambling**: Can preserve case, punctuation, vowels, and spaces
  - **Static Replacement**: Replace strings with preset alternatives via JavaScript functions
  - **Image Blurring**: Blur sensitive images
  - **Image Replacement**: Swap images with placeholders
  - **Custom CSS Injection**: Apply arbitrary CSS rules with RGBA colors
- **Dynamic Content Support**: Handles SPAs and dynamically loaded content
- **Easy Toggle**: Enable/disable anonymization via popup

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
       "preserveSpaces": true,
       "preserveEnds": true,
       "preserveVowels": true
     }
   }
   ```

2. **`static_replacement`**: Replaces all of the contents
   ```json
   {
     "name": "swap_nav_items",
      "type": "replace_full",
      "selectors": [
        ".my-custom-class",
        "#specific-id",
        "[data-testid='sensitive-data']",
        "img[src*='private']"
      ],
      "replacements": {
        "contents": [
          "Customer Name Goes Here"
        ]
      }
   }
   ```

3. **`dynamic_replacement`**: Replaces some of the contents with strings or functions
   ```json
   {
     "name": "swap_names_in_headings",
      "type": "replace_partial",
      "selectors": [
        ".my-custom-class",
        "#specific-id",
        "[data-testid='sensitive-data']",
        "img[src*='private']"
      ],
      "replacements": {
        "{customerDomain}": [
          "customerx.com"
        ],
        "{customerName}": [
          "{functionRandomNames}"
        ]
      }
   }
   ```

4. **`blur`**: Applies blur filter to images
   ```json
   {
     "type": "blur",
     "options": {
       "blurAmount": "10px",
       "fallbackImage": "assets/placeholder.jpg"
     }
   }
   ```

5. **`replace_image`**: Swaps images with placeholders
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

### Limiting this to Specific Websites

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
