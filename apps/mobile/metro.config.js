// Metro config for the Notemage iOS shell.
//
// Default Expo Metro only watches the project's own folder, which means
// `@notemage/shared` resolves through node_modules — but in a pnpm
// workspace it's a symlink into `../../packages/shared`, and Metro will
// either fail to find it or refuse to follow the symlink without help.
//
// We:
//   1. Add the monorepo root to `watchFolders` so Metro picks up changes
//      in `packages/shared/src/*.ts`.
//   2. Tell Metro to also resolve modules from the monorepo root's
//      node_modules in addition to the local one (pnpm hoists some deps
//      to the root and leaves others nested).
//
// Keeps the Expo defaults intact for everything else.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = false;

module.exports = config;
