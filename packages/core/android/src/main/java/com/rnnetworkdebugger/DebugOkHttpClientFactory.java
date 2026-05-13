package com.rnnetworkdebugger;

import com.facebook.react.modules.network.OkHttpClientFactory;
import com.facebook.react.modules.network.OkHttpClientProvider;
import com.facebook.react.modules.network.ReactCookieJarContainer;

import okhttp3.OkHttpClient;

/**
 * DebugOkHttpClientFactory
 *
 * MainApplication.java'da şu şekilde kayıt edilir (kurulum adımı):
 *
 *   @Override
 *   public void onCreate() {
 *     super.onCreate();
 *     if (BuildConfig.DEBUG) {
 *       OkHttpClientProvider.setOkHttpClientFactory(new DebugOkHttpClientFactory(debuggerModule));
 *     }
 *   }
 *
 * Bu sayede React Native'in tüm HTTP trafiği interceptor'dan geçer.
 */
public class DebugOkHttpClientFactory implements OkHttpClientFactory {

    private final RNNetworkDebuggerModule debuggerModule;

    public DebugOkHttpClientFactory(RNNetworkDebuggerModule debuggerModule) {
        this.debuggerModule = debuggerModule;
    }

    @Override
    public OkHttpClient createNewNetworkModuleClient() {
        return OkHttpClientProvider.createClientBuilder()
                .addInterceptor(debuggerModule.createOkHttpInterceptor())
                .build();
    }
}
