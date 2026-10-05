// PTT from Bluetooth speaker-mics made for Zello (Abbree, which shows up as KST_vHMIC010,
// and similar). They send PTT as remote-control commands: Fast Forward when the button goes
// down, Rewind when it comes up. iOS hands those to the app's remote command center as seek
// forward / seek backward, never to the web view, so this passes them to the page as an
// "rn-mic-ptt" event (see micPtt in App.jsx). iOS only sends them while the app is the one
// playing audio, such as while the radio is on.
//
// Copied into the generated iPhone project by .github/workflows/ios.yml.

#import <MediaPlayer/MediaPlayer.h>
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static WKWebView *RNFindWebView(UIView *view) {
  if ([view isKindOfClass:[WKWebView class]]) return (WKWebView *)view;
  for (UIView *child in view.subviews) {
    WKWebView *found = RNFindWebView(child);
    if (found) return found;
  }
  return nil;
}

static void RNSendMicPtt(BOOL pressed) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *js = [NSString stringWithFormat:@"window.dispatchEvent(new CustomEvent('rn-mic-ptt',{detail:%@}))", pressed ? @"true" : @"false"];
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if (![scene isKindOfClass:[UIWindowScene class]]) continue;
      for (UIWindow *window in ((UIWindowScene *)scene).windows) {
        WKWebView *web = RNFindWebView(window);
        if (web) {
          [web evaluateJavaScript:js completionHandler:nil];
          return;
        }
      }
    }
  });
}

static void RNOnSeek(MPRemoteCommand *command, BOOL pressed) {
  command.enabled = YES;
  [command addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event) {
    // One PTT edge per Fast Forward / Rewind press; its release is ignored.
    if ([event isKindOfClass:[MPSeekCommandEvent class]] &&
        ((MPSeekCommandEvent *)event).type != MPSeekCommandEventTypeBeginSeeking) {
      return MPRemoteCommandHandlerStatusSuccess;
    }
    RNSendMicPtt(pressed);
    return MPRemoteCommandHandlerStatusSuccess;
  }];
}

__attribute__((constructor)) static void RNMicPttStart(void) {
  // Runs once the main run loop starts.
  dispatch_async(dispatch_get_main_queue(), ^{
    MPRemoteCommandCenter *center = [MPRemoteCommandCenter sharedCommandCenter];
    RNOnSeek(center.seekForwardCommand, YES);
    RNOnSeek(center.seekBackwardCommand, NO);
  });
}
