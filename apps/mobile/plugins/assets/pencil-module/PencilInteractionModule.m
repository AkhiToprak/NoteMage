//
//  PencilInteractionModule.m
//  Notemage
//
//  Objective-C registration shim. React Native's macro-based module
//  registration runs from .m files, so we re-declare the Swift class here
//  using RCT_EXTERN_MODULE. The actual implementation lives in
//  PencilInteractionModule.swift.
//
//  Without this file, NativeModules.PencilInteractionModule is undefined
//  on the JS side and ShellBridge falls back to the no-op path (which is
//  safe but means Pencil 2 / Pro gestures stop working).
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PencilInteractionModule, RCTEventEmitter)
@end
