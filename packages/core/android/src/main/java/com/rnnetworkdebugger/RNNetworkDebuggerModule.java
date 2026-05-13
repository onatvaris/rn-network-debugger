package com.rnnetworkdebugger;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.MediaType;
import okio.Buffer;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;

/**
 * RNNetworkDebuggerModule
 *
 * React Native'in kendi OkHttpClient'ına EventListener/Interceptor ekleyerek
 * native HTTP isteklerini yakalar ve JS tarafına event olarak gönderir.
 *
 * Not: React Native'in OkHttpClient'ını genişletmek için
 * OkHttpClientProvider.setOkHttpClientFactory() kullanılır.
 * Bu, MainApplication.java'da çağrılmalıdır (kurulum talimatlarına bak).
 */
public class RNNetworkDebuggerModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "RNNetworkDebugger";
    private static final String EVENT_NAME = "RNNetworkDebuggerEvent";
    private static final AtomicLong requestIdCounter = new AtomicLong(0);

    private final ReactApplicationContext reactContext;
    private boolean enabled = false;

    public RNNetworkDebuggerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void enable(Promise promise) {
        enabled = true;
        promise.resolve(null);
    }

    @ReactMethod
    public void disable(Promise promise) {
        enabled = false;
        promise.resolve(null);
    }

    /**
     * JS tarafından çağrılmaz; OkHttp interceptor tarafından kullanılır.
     */
    public Interceptor createOkHttpInterceptor() {
        return chain -> {
            if (!enabled) {
                return chain.proceed(chain.request());
            }

            String id = "native_" + requestIdCounter.incrementAndGet();
            Request request = chain.request();

            // İstek başlangıcını gönder
            sendRequestStart(id, request);

            Response response;
            try {
                response = chain.proceed(request);
            } catch (Exception e) {
                sendRequestError(id, e.getMessage());
                throw e;
            }

            // Yanıtı oku (body stream'ini tüketmemek için peek kullan)
            ResponseBody originalBody = response.body();
            String bodyString = "";
            long bodySize = 0;

            if (originalBody != null) {
                byte[] bytes = originalBody.bytes();
                bodySize = bytes.length;
                bodyString = new String(bytes);

                // Body'yi yeniden oluştur (orijinal stream tüketildi)
                MediaType contentType = originalBody.contentType();
                response = response.newBuilder()
                        .body(ResponseBody.create(contentType, bytes))
                        .build();
            }

            sendRequestDone(id, response, bodyString, bodySize);
            return response;
        };
    }

    // ─── Event gönderici yardımcılar ─────────────────────────────────────────

    private void sendRequestStart(String id, Request request) {
        WritableMap params = Arguments.createMap();
        params.putString("event", "request:start");

        WritableMap data = Arguments.createMap();
        data.putString("id", id);
        data.putString("type", "native_http");
        data.putString("url", request.url().toString());
        data.putString("method", request.method());
        data.putString("status", "pending");
        data.putDouble("startTime", System.currentTimeMillis());

        // Headers
        WritableMap headers = Arguments.createMap();
        for (String name : request.headers().names()) {
            headers.putString(name, request.header(name));
        }
        data.putMap("headers", headers);

        // Request body
        try {
            if (request.body() != null) {
                Buffer buffer = new Buffer();
                request.body().writeTo(buffer);
                data.putString("body", buffer.readUtf8());
            }
        } catch (IOException ignored) {}

        params.putMap("data", data);
        emitEvent(params);
    }

    private void sendRequestDone(String id, Response response, String body, long size) {
        WritableMap params = Arguments.createMap();
        params.putString("event", "request:done");

        WritableMap data = Arguments.createMap();
        data.putString("id", id);
        data.putString("status", "done");
        data.putInt("responseStatus", response.code());
        data.putString("responseStatusText", response.message());
        data.putDouble("endTime", System.currentTimeMillis());
        data.putDouble("responseSize", size);

        // Truncate very large bodies
        String displayBody = body.length() > 50000 ? body.substring(0, 50000) + "…[kesildi]" : body;
        data.putString("responseBody", displayBody);

        WritableMap headers = Arguments.createMap();
        for (String name : response.headers().names()) {
            headers.putString(name, response.header(name));
        }
        data.putMap("responseHeaders", headers);

        params.putMap("data", data);
        emitEvent(params);
    }

    private void sendRequestError(String id, String error) {
        WritableMap params = Arguments.createMap();
        params.putString("event", "request:error");

        WritableMap data = Arguments.createMap();
        data.putString("id", id);
        data.putString("status", "error");
        data.putString("error", error);
        data.putDouble("endTime", System.currentTimeMillis());

        params.putMap("data", data);
        emitEvent(params);
    }

    private void emitEvent(WritableMap params) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(EVENT_NAME, params);
        } catch (Exception ignored) {}
    }
}
