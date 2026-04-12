// Expo config plugin: with-pencil-module
//
// Purpose: keep the custom Apple Pencil native module wired into the
// generated Xcode project so `npx expo prebuild --clean` is safe to run.
// Without this, the .swift / .m / bridging-header files we ship under
// `ios/Notemage/` would still exist on disk after a clean prebuild but
// would NOT be members of the `Notemage` target, which means React Native
// wouldn't see `NativeModules.PencilInteractionModule` and the JS bridge
// would silently fall through to the no-op path.
//
// What it does:
//   1. Copies the three source files (Swift module, ObjC registration shim,
//      bridging header) from this plugin's `assets/` folder into
//      ios/Notemage/ on every prebuild
//   2. Adds the .swift and .m to the `Notemage` Xcode target as build
//      sources
//   3. Sets `SWIFT_OBJC_BRIDGING_HEADER` to the bridging header path so
//      Swift can see the React Native types
//   4. Ensures `CLANG_ENABLE_MODULES = YES` and a Swift version are set
//      (required for the @objc bridge to compile)
//
// Reference docs: https://docs.expo.dev/config-plugins/plugins-and-mods/

const fs = require('fs');
const path = require('path');
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');

const SOURCES = [
  'PencilInteractionModule.swift',
  'PencilInteractionModule.m',
  'Notemage-Bridging-Header.h',
];

// Copy the canonical source files (kept under `plugins/assets/`) into
// `ios/Notemage/` so they're always present, even after a clean prebuild.
function withPencilSources(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, 'Notemage');
      const assetsDir = path.join(projectRoot, 'plugins', 'assets', 'pencil-module');

      if (!fs.existsSync(targetDir)) {
        // ios/Notemage doesn't exist yet — Expo prebuild hasn't reached
        // the template-copy step. Bail out and let a later run pick it up.
        return cfg;
      }

      for (const filename of SOURCES) {
        const src = path.join(assetsDir, filename);
        const dest = path.join(targetDir, filename);
        if (!fs.existsSync(src)) {
          throw new Error(
            `[with-pencil-module] missing source file: ${src}. Run the plugin from an up-to-date workspace.`
          );
        }
        fs.copyFileSync(src, dest);
      }
      return cfg;
    },
  ]);
}

// Add the new files to the Xcode project as members of the Notemage target.
function withPencilXcodeMembership(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const targetName = 'Notemage';

    const groupKey = project.findPBXGroupKey({ name: targetName });
    if (!groupKey) {
      throw new Error(`[with-pencil-module] could not find PBXGroup ${targetName}`);
    }

    const addSource = (filename) => {
      const filePath = `${targetName}/${filename}`;
      // Skip if the file already exists in the project (idempotent — the
      // plugin re-runs on every prebuild).
      const existing = project.hasFile(filePath);
      if (existing) return;
      project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, groupKey);
    };

    const addHeader = (filename) => {
      const filePath = `${targetName}/${filename}`;
      if (project.hasFile(filePath)) return;
      project.addHeaderFile(filePath, { target: project.getFirstTarget().uuid }, groupKey);
    };

    addSource('PencilInteractionModule.swift');
    addSource('PencilInteractionModule.m');
    addHeader('Notemage-Bridging-Header.h');

    // Make sure the bridging header build setting points at our file.
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const blockKey of Object.keys(configurations)) {
      const block = configurations[blockKey];
      if (typeof block !== 'object' || !block.buildSettings) continue;
      // Only touch the Notemage target's build settings — other targets
      // (Pods, etc.) must stay untouched.
      if (block.buildSettings.PRODUCT_NAME && String(block.buildSettings.PRODUCT_NAME).includes('Notemage')) {
        block.buildSettings.SWIFT_OBJC_BRIDGING_HEADER = `"${targetName}/Notemage-Bridging-Header.h"`;
        block.buildSettings.CLANG_ENABLE_MODULES = 'YES';
        block.buildSettings.SWIFT_VERSION = block.buildSettings.SWIFT_VERSION || '5.0';
      }
    }

    return cfg;
  });
}

module.exports = function withPencilModule(config) {
  config = withPencilSources(config);
  config = withPencilXcodeMembership(config);
  return config;
};
