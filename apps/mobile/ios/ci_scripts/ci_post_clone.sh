#!/bin/sh
# Xcode Cloud post-clone hook.
# The native iOS project at apps/mobile/ios/ is gitignored and regenerated
# by `expo prebuild` from app.json + the local config plugins. Without this
# script, xcodebuild can't find Notemage.xcworkspace on a fresh CI clone.

set -euxo pipefail

echo "==> Installing Node via Homebrew"
brew install node
# Brew's node formula no longer ships corepack, so install pnpm via npm directly.
NODE_BIN="$(brew --prefix node)/bin"
export PATH="$NODE_BIN:$PATH"

echo "==> Installing pnpm@9.12.0 via npm"
npm install -g pnpm@9.12.0

echo "==> Installing JS dependencies for mobile workspace"
cd "$CI_PRIMARY_REPOSITORY_PATH"
# Scope to mobile subgraph; apps/web's prisma postinstall hits binaries.prisma.sh which Xcode Cloud blocks.
pnpm install --frozen-lockfile --filter 'mobile...'

echo "==> Generating iOS native project via expo prebuild"
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile"
npx expo prebuild --platform ios --no-install

echo "==> Installing CocoaPods"
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
pod install

echo "==> Workspace ready: $(pwd)/Notemage.xcworkspace"
