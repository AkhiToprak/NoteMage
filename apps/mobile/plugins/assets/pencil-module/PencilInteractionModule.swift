//
//  PencilInteractionModule.swift
//  Notemage
//
//  Bridges Apple Pencil 2 / Pencil Pro gestures (double-tap, squeeze) into
//  React Native as a single `pencilTap` event. Apple does not expose these
//  gestures to web pages — neither Safari nor WKWebView fires anything for
//  them — so the only way to wire them into the canvas is from native code.
//
//  Wiring (per the Phase 2 plan in plans/react-native-mobile-shell.md):
//    1. ShellBridge.attach() looks up `NativeModules.PencilInteractionModule`
//       and calls startObserving()
//    2. UIPencilInteraction.preferredTapAction fires whichever action the
//       user has configured in Settings → Apple Pencil
//    3. We send `pencilTap` through RCTEventEmitter
//    4. ShellBridge re-emits it across the JS bridge as a `pencilTap` event
//    5. apps/web/src/components/notebook/InfiniteCanvas.tsx subscribes via
//       window.NotemageBridge.onPencilTap() and calls setActiveTool('eraser')
//
//  Notes:
//    * UIPencilInteraction is iPadOS 12.1+, but the gestures only fire on
//      Pencil 2 (double-tap) and Pencil Pro (squeeze). Older Pencils silently
//      no-op, which is the desired behavior — the existing barrel-button
//      handler in InfiniteCanvas covers third-party styluses.
//    * We attach the interaction to the WKWebView's containing window so it
//      receives gestures regardless of which subview is first responder.
//    * Pencil hover (Pencil 2 / Pro on M2 iPads) is intentionally not
//      bridged here — the web side already gets PointerEvents from WKWebView
//      for hover position; we only need the gestures iOS hides.
//

import Foundation
import UIKit
import React

@objc(PencilInteractionModule)
class PencilInteractionModule: RCTEventEmitter, UIPencilInteractionDelegate {

  private var interaction: UIPencilInteraction?
  private var hasListeners = false

  // MARK: RCTEventEmitter overrides

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String] {
    return ["pencilTap"]
  }

  override func startObserving() {
    hasListeners = true
    DispatchQueue.main.async { [weak self] in
      self?.installInteraction()
    }
  }

  override func stopObserving() {
    hasListeners = false
    DispatchQueue.main.async { [weak self] in
      self?.removeInteraction()
    }
  }

  // MARK: Wiring

  private func installInteraction() {
    guard interaction == nil else { return }
    let pencil = UIPencilInteraction()
    pencil.delegate = self

    // Attach to the foreground window so the interaction lives for the
    // lifetime of the app, regardless of which child controller is on
    // screen. Walking UIApplication.shared.connectedScenes is the
    // recommended path on iOS 13+.
    if let window = activeKeyWindow() {
      window.addInteraction(pencil)
      interaction = pencil
    }
  }

  private func removeInteraction() {
    guard let pencil = interaction else { return }
    if let window = activeKeyWindow() {
      window.removeInteraction(pencil)
    }
    interaction = nil
  }

  private func activeKeyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes
    for scene in scenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      if let key = windowScene.windows.first(where: { $0.isKeyWindow }) {
        return key
      }
      if let first = windowScene.windows.first {
        return first
      }
    }
    return nil
  }

  // MARK: UIPencilInteractionDelegate

  // iOS 17.5+: includes the squeeze gesture on Pencil Pro plus the
  // existing tap gesture on Pencil 2. We treat both the same way — they
  // both mean "toggle eraser" in our canvas.
  @available(iOS 17.5, *)
  func pencilInteraction(
    _ interaction: UIPencilInteraction,
    didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze
  ) {
    guard squeeze.phase == .ended else { return }
    fireEvent()
  }

  // Pre-iOS 17.5 callback used by Apple Pencil 2 double-tap.
  func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
    fireEvent()
  }

  // MARK: Helpers

  private func fireEvent() {
    guard hasListeners else { return }
    sendEvent(withName: "pencilTap", body: nil)
  }
}
