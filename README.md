# RN Network Debugger

React Native projeleri için sıfır bağımlılıklı, tarayıcı tabanlı network debugger.  
Hem **Bare React Native** hem **Expo** projelerinde çalışır. Android ve iOS'u destekler.

> **Herhangi bir üçüncü parti araç (Flipper, Proxyman, Charles vb.) gerektirmez.**  
> Metro başladığında DevTools server otomatik ayağa kalkar. Tarayıcıda `http://localhost:8788` açman yeterli.

---

## İçindekiler

- [Mimari](#mimari)
- [Özellikler](#özellikler)
- [Proje Yapısı](#proje-yapısı)
- [Bare React Native — Kurulum](#bare-react-native--kurulum)
- [Expo — Kurulum](#expo--kurulum)
- [Android Native HTTP (OkHttp)](#android-native-http-okhttp)
- [iOS Native HTTP (NSURLProtocol)](#ios-native-http-nsurlprotocol)
- [DevTools UI Kullanımı](#devtools-ui-kullanımı)
- [API Referansı](#api-referansı)
- [Sorun Giderme](#sorun-giderme)
- [Sık Sorulan Sorular](#sık-sorulan-sorular)

---

## Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                       React Native Uygulaması                    │
│                                                                  │
│  fetch()  ──┐                                                    │
│  XHR      ──┤                                                    │
│  Axios    ──┼──► NetworkEventEmitter ──► WebSocket Client        │
│  WS       ──┘                                  │                 │
│                                         (otomatik yeniden       │
│  [Android] OkHttp ─────────────────────  bağlanma)              │
│  [iOS] NSURLProtocol ───────────────────       │                 │
└────────────────────────────────────────────────┼────────────────┘
                                                 │ ws://<host>:8788/app
                              ┌──────────────────▼──────────────────┐
                              │          DevTools Server             │
                              │      Node.js / localhost:8788        │
                              │    Metro ile birlikte otomatik başlar│
                              └──────────────────┬───────────────────┘
                                                 │ ws://localhost:8788/ui
                              ┌──────────────────▼───────────────────┐
                              │           DevTools UI                 │
                              │       http://localhost:8788           │
                              │        Tarayıcıda açılır             │
                              └──────────────────────────────────────┘
```

**Veri akışı:**
1. Uygulamadaki her network isteği `core` paketi tarafından yakalanır
2. WebSocket üzerinden `server`'a iletilir (bağlantı yoksa kuyruğa alınır)
3. `server`, bağlı tüm tarayıcı panellerine olayı yayar
4. Tarayıcıdaki UI gerçek zamanlı güncellenir

---

## Özellikler

| Özellik | Durum | Not |
|---------|-------|-----|
| `fetch()` yakalama | ✅ | Otomatik, kurulum gerekmez |
| `XMLHttpRequest` yakalama | ✅ | Otomatik, kurulum gerekmez |
| `Axios` yakalama | ✅ | Axios yüklüyse otomatik algılanır |
| `WebSocket` yakalama | ✅ | Send/receive mesaj geçmişi dahil |
| Android Native HTTP (OkHttp) | ✅ | Ek kurulum gerekli → [bak](#android-native-http-okhttp) |
| iOS Native HTTP (NSURLProtocol) | ✅ | Ek kurulum gerekli → [bak](#ios-native-http-nsurlprotocol) |
| Request body | ✅ | JSON otomatik parse ve formatlanır |
| Response body | ✅ | JSON otomatik parse ve formatlanır |
| Header inceleme | ✅ | İstek ve yanıt header'ları ayrı gösterilir |
| Timing bilgisi | ✅ | Süre, başlangıç/bitiş zamanı, response boyutu |
| URL filtreleme | ✅ | Anlık arama, büyük/küçük harf duyarsız |
| Tür filtreleme | ✅ | fetch · xhr · axios · native · websocket |
| Durum filtreleme | ✅ | Başarılı · Hatalı · Bekleyen |
| Bağlantı sonrası geçmiş | ✅ | UI sonradan açılsa bile son 1000 istek yüklenir |
| Çoklu cihaz/simülatör | ✅ | Tüm cihazlardan gelen istekler tek panelde |
| Production'da sıfır maliyet | ✅ | `__DEV__` false olduğunda hiçbir kod çalışmaz |
| Otomatik yeniden bağlanma | ✅ | Bağlantı kopunca 2 saniyede yeniden dener |

---

## Proje Yapısı

```
rn-network-debugger/
├── packages/
│   ├── core/                        # RN uygulamasına eklenen interceptor paketi
│   │   ├── src/
│   │   │   ├── index.js             # startNetworkDebugger() — ana giriş noktası
│   │   │   ├── emitter.js           # Merkezi olay bus'ı
│   │   │   ├── transport.js         # WebSocket bağlantı yönetimi + kuyruk
│   │   │   └── interceptors/
│   │   │       ├── fetch.js         # global.fetch monkey-patch
│   │   │       ├── xhr.js           # XMLHttpRequest wrap
│   │   │       ├── axios.js         # Axios interceptor API entegrasyonu
│   │   │       └── websocket.js     # global.WebSocket proxy
│   │   ├── android/                 # OkHttp interceptor (Java)
│   │   │   └── .../
│   │   │       ├── RNNetworkDebuggerModule.java
│   │   │       └── DebugOkHttpClientFactory.java
│   │   └── ios/                     # NSURLProtocol (Objective-C)
│   │       ├── RNNetworkDebuggerURLProtocol.h
│   │       └── RNNetworkDebuggerURLProtocol.m
│   │
│   ├── server/                      # DevTools WebSocket + HTTP sunucusu
│   │   └── src/index.js             # Express + ws, port 8788
│   │
│   ├── metro-plugin/                # Metro config wrapper — server'ı otomatik başlatır
│   │   └── src/index.js
│   │
│   └── ui/                          # Tarayıcı tabanlı DevTools paneli (React + Vite)
│       ├── src/
│       │   ├── App.jsx              # Ana uygulama — istek listesi + detay paneli
│       │   └── main.jsx
│       └── index.html
│
├── example/
│   └── setup.js                     # Kopyalanabilir entegrasyon örneği
└── README.md
```

---

## Bare React Native — Kurulum

### Adım 1 — Server bağımlılıklarını kur

```bash
cd rn-network-debugger/packages/server
npm install
```

### Adım 2 — Projeye local paket olarak ekle

Projenin `package.json` dosyasına ekle (dizin yolunu kendi yapına göre ayarla):

```json
{
  "dependencies": {
    "@rn-network-debugger/core": "file:../rn-network-debugger/packages/core",
    "@rn-network-debugger/metro-plugin": "file:../rn-network-debugger/packages/metro-plugin"
  }
}
```

```bash
cd MyRNApp
npm install
```

### Adım 3 — metro.config.js

```js
const { getDefaultConfig } = require('@react-native/metro-config');
const { withNetworkDebugger } = require('@rn-network-debugger/metro-plugin');

const config = getDefaultConfig(__dirname);

module.exports = withNetworkDebugger(config, {
  port: 8788, // opsiyonel, varsayılan: 8788
});
```

> `withNetworkDebugger` Metro başladığında DevTools server'ını otomatik ayağa kaldırır.
> Ayrı terminal açmana gerek yok.

### Adım 4 — index.js

Dosyanın **en üstüne**, tüm diğer import'lardan önce ekle:

```js
// ✅ Doğru: en üstte
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@rn-network-debugger/core';

if (__DEV__) {
  const host = Platform.OS === 'android'
    ? '10.0.2.2'   // Android emülatör → host makineye erişim
    : 'localhost';  // iOS simülatör

  startNetworkDebugger({
    serverUrl: `ws://${host}:8788/app`,
  });
}

// Sonra diğer import'lar...
import { AppRegistry } from 'react-native';
import App from './App';
AppRegistry.registerComponent('MyApp', () => App);
```

> ⚠️ `startNetworkDebugger` diğer import'lardan önce çağrılmalı.
> Aksi hâlde uygulama başlar başlamaz yapılan ilk istekler yakalanamaz.

### Adım 5 — Android port yönlendirme

Her oturum başında bir kez çalıştır:

```bash
adb reverse tcp:8788 tcp:8788
```

### Adım 6 — Çalıştır

```bash
# Terminal 1 — Metro (DevTools server otomatik başlar)
npx react-native start

# Terminal 2
npx react-native run-ios     # iOS için
npx react-native run-android # Android için
```

Metro başladığında terminalde şunu görmelisin:

```
╔════════════════════════════════════════════╗
║  RN Network Debugger Server                ║
║  DevTools UI  → http://localhost:8788      ║
║  WS (app)     → ws://localhost:8788/app    ║
║  WS (ui)      → ws://localhost:8788/ui     ║
╚════════════════════════════════════════════╝
```

Tarayıcıda `http://localhost:8788` aç. Sol üstte yeşil nokta = bağlantı kuruldu.

---

## Expo — Kurulum

Expo Managed Workflow'da native modüller (OkHttp / NSURLProtocol) kullanılamaz,
ancak JS katmanı interceptor'ları (fetch, XHR, Axios, WebSocket) tam çalışır.

### Adım 1 — Server bağımlılıklarını kur

```bash
cd rn-network-debugger/packages/server
npm install
```

### Adım 2 — Projeye local paket olarak ekle

```json
{
  "dependencies": {
    "@rn-network-debugger/core": "file:../rn-network-debugger/packages/core"
  }
}
```

```bash
cd MyExpoApp
npm install
```

### Adım 3 — app/_layout.tsx veya App.tsx

```tsx
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@rn-network-debugger/core';
import Constants from 'expo-constants';

if (__DEV__) {
  const host =
    Platform.OS === 'android'
      ? '10.0.2.2'
      : Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

  startNetworkDebugger({
    serverUrl: `ws://${host}:8788/app`,
  });
}
```

### Adım 4 — Server'ı manuel başlat

Expo'da metro-plugin kullanılmadığı için server'ı ayrı bir terminalde başlat:

```bash
node rn-network-debugger/packages/server/src/index.js
```

### Adım 5 — Android port yönlendirme

```bash
adb reverse tcp:8788 tcp:8788
```

### Adım 6 — Çalıştır

```bash
# Terminal 1 — Server (açık kalsın)
node rn-network-debugger/packages/server/src/index.js

# Terminal 2 — Expo
npx expo start
```

Tarayıcıda `http://localhost:8788` aç.

---

## Android Native HTTP (OkHttp)

> **Opsiyoneldir.** Yalnızca `fetch`/XHR/Axios dışında native seviyede HTTP yapan
> kütüphanelerin trafiğini de görmek istiyorsan gereklidir.

`packages/core/android/` içindeki iki dosyayı Android modülüne kopyala:

```
android/app/src/main/java/com/yourapp/
├── RNNetworkDebuggerModule.java
└── DebugOkHttpClientFactory.java
```

`MainApplication.java`'ya ekle:

```java
import com.yourapp.DebugOkHttpClientFactory;
import com.yourapp.RNNetworkDebuggerModule;
import com.facebook.react.modules.network.OkHttpClientProvider;
import android.os.Handler;
import android.os.Looper;

public class MainApplication extends Application implements ReactApplication {

  @Override
  public void onCreate() {
    super.onCreate();

    if (BuildConfig.DEBUG) {
      new Handler(Looper.getMainLooper()).post(() -> {
        try {
          ReactInstanceManager manager =
            getReactNativeHost().getReactInstanceManager();
          manager.addReactInstanceEventListener(context -> {
            RNNetworkDebuggerModule module =
              context.getNativeModule(RNNetworkDebuggerModule.class);
            OkHttpClientProvider.setOkHttpClientFactory(
              new DebugOkHttpClientFactory(module)
            );
          });
        } catch (Exception ignored) {}
      });
    }
  }
}
```

---

## iOS Native HTTP (NSURLProtocol)

> **Opsiyoneldir.** Android OkHttp kurulumunun iOS karşılığı.

`packages/core/ios/` içindeki iki dosyayı Xcode projesine ekle:

1. Xcode'da projeye sağ tıkla → **Add Files to "YourApp"**
2. `RNNetworkDebuggerURLProtocol.h` ve `RNNetworkDebuggerURLProtocol.m` dosyalarını seç

`AppDelegate.mm`'e ekle:

```objc
#if DEBUG
#import "RNNetworkDebuggerURLProtocol.h"
#endif

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  RCTBridge *bridge = [[RCTBridge alloc] initWithDelegate:self
                                            launchOptions:launchOptions];
#if DEBUG
  [RNNetworkDebuggerBridge shared].bridge = bridge;
  [NSURLProtocol registerClass:[RNNetworkDebuggerURLProtocol class]];
#endif

  // ... geri kalan kurulum
  return YES;
}
```

---

## DevTools UI Kullanımı

### Bağlantı Durumu

Sol üstte küçük bir nokta bulunur:
- 🟢 **Yeşil** → Server çalışıyor, en az bir uygulama bağlı
- 🔴 **Kırmızı** → Server'a bağlanılamıyor (Metro açık mı?)

### İstek Listesi

Her satırda şunlar görünür:

| Sütun | Açıklama |
|-------|----------|
| **Durum** | HTTP durum kodu (200, 404, 500…) ya da dönen spinner (bekleyen istek) |
| **Yöntem** | GET · POST · PUT · DELETE · PATCH · WS |
| **Tür** | `fetch` · `xhr` · `axios` · `native` · `websocket` |
| **URL** | İsteğin path + query kısmı (host kısaltılmış) |
| **Süre** | İstek başından yanıt sonuna kadar geçen süre |
| **Boyut** | Response body boyutu |

Bir satıra tıklamak sağ paneli açar.

### Detay Paneli

| Sekme | İçerik |
|-------|--------|
| **Response** | Yanıt body'si — JSON otomatik formatlanır |
| **Request** | Gönderilen body — POST/PUT/PATCH için |
| **Headers** | İstek ve yanıt header'ları ayrı başlıklar altında |
| **Timing** | Başlangıç/bitiş zamanı, toplam süre, response boyutu |
| **Messages** | *(yalnızca WebSocket)* Tüm send/receive mesajları zaman damgasıyla |

### Filtreler

| Kontrol | İşlev |
|---------|-------|
| URL arama kutusu | Anlık filtreleme, büyük/küçük harf duyarsız |
| Tür seçici | Tüm Türler / fetch / XHR / axios / Native HTTP / WebSocket |
| Durum seçici | Tüm Durumlar / Başarılı (2xx-3xx) / Hatalı (4xx-5xx+err) / Bekleyen |
| 🗑 Temizle | Listeyi ve server geçmişini sıfırlar |

---

## API Referansı

### `startNetworkDebugger(options?)`

```ts
startNetworkDebugger({
  /**
   * DevTools server WebSocket adresi.
   * Varsayılan: 'ws://localhost:8788'
   * Android emülatörde: 'ws://10.0.2.2:8788/app'
   * Fiziksel cihazda: 'ws://192.168.x.x:8788/app'
   */
  serverUrl?: string;

  /**
   * Axios interceptor'ını etkinleştir/devre dışı bırak.
   * Varsayılan: true
   */
  interceptAxios?: boolean;

  /**
   * WebSocket interceptor'ını etkinleştir/devre dışı bırak.
   * Varsayılan: true
   */
  interceptWS?: boolean;

  /**
   * Bu host'lara yapılan istekler yakalanmaz.
   * localhost:8788 ve localhost:8081 her zaman hariç tutulur.
   */
  ignoredHosts?: string[];
})
// Dönüş: { stop: () => void }
```

**Örnek — seçici yapılandırma:**

```js
if (__DEV__) {
  const debuggerInstance = startNetworkDebugger({
    serverUrl: 'ws://localhost:8788/app',
    interceptWS: false,          // WebSocket mesajlarını izleme
    ignoredHosts: [
      'sentry.io',               // Sentry trafiğini gizle
      'analytics.myapp.com',     // Analytics trafiğini gizle
    ],
  });

  // Gerekirse durdur
  // debuggerInstance.stop();
}
```

---

## Sorun Giderme

### ❌ Tarayıcıda "Bağlanıyor…" kalıyor

1. Metro çalışıyor mu?
   ```bash
   npx react-native start
   ```

2. Terminalde server başlangıç mesajı görüntülendi mi?
   ```
   ╔════════════════════════════════════════════╗
   ║  RN Network Debugger Server                ║
   ```

3. Port meşgul olabilir:
   ```bash
   lsof -i :8788   # macOS/Linux
   ```
   Çözüm: farklı port kullan
   ```js
   // metro.config.js
   withNetworkDebugger(config, { port: 8789 })
   // index.js
   startNetworkDebugger({ serverUrl: 'ws://localhost:8789/app' })
   ```

---

### ❌ Android emülatörde istek görünmüyor

```bash
adb reverse tcp:8788 tcp:8788
adb devices  # cihaz bağlı mı?
```

`serverUrl`'in `10.0.2.2` kullandığından emin ol:

```js
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
```

---

### ❌ iOS fiziksel cihazda bağlanamıyor

Mac ve cihaz aynı Wi-Fi ağında olmalı. Mac'in IP adresini kullan:

```bash
ipconfig getifaddr en0   # Mac IP
```

```js
startNetworkDebugger({ serverUrl: 'ws://192.168.1.42:8788/app' });
```

---

### ❌ Expo Go'da bağlanamıyor

```js
import Constants from 'expo-constants';
const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
```

---

### ❌ Bazı istekler görünmüyor

- `startNetworkDebugger` çağrısının tüm import'lardan **önce** geldiğini kontrol et
- `ignoredHosts` listesinde söz konusu host var mı kontrol et
- Native HTTP kullanan kütüphaneler için OkHttp/NSURLProtocol kurulumunu tamamla

---

### ❌ "Zaten başlatıldı" uyarısı

`startNetworkDebugger` uygulama yaşam döngüsü boyunca yalnızca bir kez çağrılmalı.
Uyarı görüyorsan birden fazla yerde çağrıldığına işaret eder. `index.js`'te tek bir yerde tut.

---

## Sık Sorulan Sorular

**Production build'de performans etkisi var mı?**  
Hayır. `if (!__DEV__) return` koruması sayesinde production bundle'a hiçbir interceptor kodu girmez. Metro, `__DEV__ === false` olan dalları tree-shaking ile tamamen çıkarır.

**Birden fazla simülatör/cihaz aynı anda bağlanabilir mi?**  
Evet. Server çoklu bağlantıyı destekler; tüm cihazlardan gelen istekler aynı panelde görünür.

**UI'ı kapattım, istekler kayboldu mu?**  
Hayır. Server son 1000 isteği bellekte tutar. UI yeniden açıldığında geçmiş otomatik yüklenir.

**Axios yüklü değilse ne olur?**  
`interceptors/axios.js` içindeki `require('axios')` bir `try/catch` içinde. Axios yoksa sessizce atlanır, hata vermez.

**`react-native-nitro-fetch` veya özel fetch implementasyonları yakalanıyor mu?**  
Yalnızca `global.fetch` ve `global.XMLHttpRequest` kullanan kütüphaneler otomatik yakalanır. Tamamen native ağ katmanı kullananlar için OkHttp (Android) ve NSURLProtocol (iOS) kurulumu gereklidir.
