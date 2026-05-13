# Fix Komutu

Verilen hatayı analiz et:

1. Hangi paketi etkilediğini belirle: core / server / metro-plugin / ui
2. Hata mesajını ve stack trace'i incele
3. İlgili dosyayı düzelt
4. Eğer packages/ui değiştiyse şunu hatırlat:
   cd packages/ui && npm run build && cp -r dist/* ../server/public/
5. Metro cache gerektiriyorsa: yarn start --reset-cache
