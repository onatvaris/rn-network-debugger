// RNNetworkDebuggerURLProtocol.m
//
// iOS'ta native HTTP isteklerini yakalamak için NSURLProtocol alt sınıfı.
// AppDelegate.m'de kaydedilir:
//
//   #if DEBUG
//   #import "RNNetworkDebuggerURLProtocol.h"
//   [NSURLProtocol registerClass:[RNNetworkDebuggerURLProtocol class]];
//   #endif
//

#import "RNNetworkDebuggerURLProtocol.h"
#import <React/RCTBridge.h>
#import <React/RCTEventEmitter.h>

// Sonsuz döngüyü önlemek için işaretleme key'i
static NSString *const kHandledKey = @"RNNetworkDebuggerHandled";
static NSString *const kRequestIdKey = @"RNNetworkDebuggerRequestId";
static long long _requestIdCounter = 0;

@interface RNNetworkDebuggerURLProtocol () <NSURLSessionDataDelegate>
@property (nonatomic, strong) NSURLSessionDataTask *dataTask;
@property (nonatomic, strong) NSMutableData *responseData;
@property (nonatomic, strong) NSString *requestId;
@property (nonatomic, strong) NSDate *startTime;
@end

@implementation RNNetworkDebuggerURLProtocol

+ (BOOL)canInitWithRequest:(NSURLRequest *)request {
    // Zaten işlenmiş istekleri tekrar yakalama
    if ([NSURLProtocol propertyForKey:kHandledKey inRequest:request]) {
        return NO;
    }
    // Sadece HTTP/HTTPS
    NSString *scheme = request.URL.scheme.lowercaseString;
    return [scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"];
}

+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request {
    return request;
}

- (void)startLoading {
    NSMutableURLRequest *mutableRequest = [self.request mutableCopy];
    [NSURLProtocol setProperty:@YES forKey:kHandledKey inRequest:mutableRequest];

    self.requestId = [NSString stringWithFormat:@"native_ios_%lld", ++_requestIdCounter];
    self.startTime = [NSDate date];
    self.responseData = [NSMutableData data];

    // İstek başlangıcını gönder
    [self sendEvent:@"request:start" data:@{
        @"id": self.requestId,
        @"type": @"native_http",
        @"url": self.request.URL.absoluteString ?: @"",
        @"method": self.request.HTTPMethod ?: @"GET",
        @"headers": self.request.allHTTPHeaderFields ?: @{},
        @"body": [self bodyStringFromRequest:self.request] ?: @"",
        @"status": @"pending",
        @"startTime": @([[NSDate date] timeIntervalSince1970] * 1000),
    }];

    NSURLSession *session = [NSURLSession sessionWithConfiguration:[NSURLSessionConfiguration defaultSessionConfiguration]
                                                          delegate:self
                                                     delegateQueue:nil];
    self.dataTask = [session dataTaskWithRequest:mutableRequest];
    [self.dataTask resume];
}

- (void)stopLoading {
    [self.dataTask cancel];
}

// ─── NSURLSessionDataDelegate ────────────────────────────────────────────────

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
didReceiveResponse:(NSURLResponse *)response
 completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {

    [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveData:(NSData *)data {
    [self.responseData appendData:data];
    [self.client URLProtocol:self didLoadData:data];
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
didCompleteWithError:(NSError *)error {

    if (error) {
        [self.client URLProtocol:self didFailWithError:error];
        [self sendEvent:@"request:error" data:@{
            @"id": self.requestId,
            @"status": @"error",
            @"error": error.localizedDescription ?: @"Bilinmeyen hata",
            @"endTime": @([[NSDate date] timeIntervalSince1970] * 1000),
        }];
        return;
    }

    [self.client URLProtocolDidFinishLoading:self];

    NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)task.response;
    NSString *bodyStr = [[NSString alloc] initWithData:self.responseData encoding:NSUTF8StringEncoding] ?: @"";

    // Çok büyük body'leri kes
    if (bodyStr.length > 50000) {
        bodyStr = [[bodyStr substringToIndex:50000] stringByAppendingString:@"…[kesildi]"];
    }

    NSTimeInterval duration = [[NSDate date] timeIntervalSinceDate:self.startTime] * 1000;

    [self sendEvent:@"request:done" data:@{
        @"id": self.requestId,
        @"status": @"done",
        @"responseStatus": @(httpResponse.statusCode),
        @"responseHeaders": httpResponse.allHeaderFields ?: @{},
        @"responseBody": bodyStr,
        @"responseSize": @(self.responseData.length),
        @"duration": @(duration),
        @"endTime": @([[NSDate date] timeIntervalSince1970] * 1000),
    }];
}

// ─── Yardımcı metodlar ───────────────────────────────────────────────────────

- (void)sendEvent:(NSString *)eventName data:(NSDictionary *)data {
    // JS bridge üzerinden event gönder
    // RNNetworkDebuggerBridge singleton'ı tarafından yönlendirilir
    [[RNNetworkDebuggerBridge shared] sendEvent:eventName data:data];
}

- (NSString *)bodyStringFromRequest:(NSURLRequest *)request {
    if (!request.HTTPBody) return nil;
    return [[NSString alloc] initWithData:request.HTTPBody encoding:NSUTF8StringEncoding];
}

@end


// ─── RNNetworkDebuggerBridge ─────────────────────────────────────────────────
// Objective-C'den React Native event sistemine köprü

@implementation RNNetworkDebuggerBridge

+ (instancetype)shared {
    static RNNetworkDebuggerBridge *instance;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[self alloc] init];
    });
    return instance;
}

- (void)sendEvent:(NSString *)eventName data:(NSDictionary *)data {
    if (!self.bridge) return;
    RNNetworkDebuggerModule *module = [self.bridge moduleForClass:[RNNetworkDebuggerModule class]];
    [module sendEventWithName:@"RNNetworkDebuggerEvent" body:@{
        @"event": eventName,
        @"data": data,
    }];
}

@end
