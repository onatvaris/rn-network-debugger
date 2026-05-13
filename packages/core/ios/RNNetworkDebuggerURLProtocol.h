// RNNetworkDebuggerURLProtocol.h

#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>

NS_ASSUME_NONNULL_BEGIN

@interface RNNetworkDebuggerURLProtocol : NSURLProtocol
@end

/**
 * Objective-C → JS köprüsü.
 * AppDelegate'de bridge atanır:
 *   [RNNetworkDebuggerBridge shared].bridge = bridge;
 */
@interface RNNetworkDebuggerBridge : NSObject
@property (nonatomic, weak) RCTBridge *bridge;
+ (instancetype)shared;
- (void)sendEvent:(NSString *)eventName data:(NSDictionary *)data;
@end

NS_ASSUME_NONNULL_END
