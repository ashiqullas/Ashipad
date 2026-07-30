#!/bin/bash
# build-extension.sh

echo "Building AshiPad Dedicated Chromium Extension..."

# Clean up previous build
rm -rf extension-build
mkdir -p extension-build/assets

# Copy dedicated extension files
cp extension-src/popup.html extension-build/index.html
cp extension-src/popup.css extension-build/popup.css
cp extension-src/popup.js extension-build/popup.js
cp assets/icon.svg extension-build/assets/

# Create the Extension manifest.json (Manifest V3)
cat <<EOF > extension-build/manifest.json
{
  "manifest_version": 3,
  "name": "AshiPad",
  "version": "2.0.0",
  "description": "Premium Rich Text Editor Extension",
  "action": {
    "default_popup": "index.html",
    "default_icon": {
      "128": "assets/icon.svg"
    }
  },
  "icons": {
    "128": "assets/icon.svg"
  },
  "permissions": [
    "storage"
  ]
}
EOF

# Zip the extension
cd extension-build
zip -r ../assets/ashipad-extension.zip *
cd ..

echo "Extension built at assets/ashipad-extension.zip"
echo "You can also load the unpacked extension directly from the extension-build/ folder!"
