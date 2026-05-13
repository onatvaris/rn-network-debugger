# Release

1. UI'ı build et ve server'a kopyala:
   cd packages/ui && npm run build && cp -r dist/* ../server/public/

2. Zip oluştur (node_modules hariç):
   cd ../.. && zip -r rn-network-debugger-release.zip \
     packages/core/src \
     packages/core/android \
     packages/core/ios \
     packages/core/package.json \
     packages/server/src \
     packages/server/public \
     packages/server/package.json \
     packages/metro-plugin/src \
     packages/metro-plugin/package.json \
     packages/ui/src \
     packages/ui/dist \
     packages/ui/index.html \
     packages/ui/vite.config.js \
     packages/ui/package.json \
     README.md \
     example/ \
     package.json

3. Zip'i paylaş.
