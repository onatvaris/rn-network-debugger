# UI Build

UI'da değişiklik yapıldıktan sonra çalıştır:

cd packages/ui && npm run build && cp -r dist/* ../server/public/

Ardından Metro'yu yeniden başlat:
yarn start --reset-cache
