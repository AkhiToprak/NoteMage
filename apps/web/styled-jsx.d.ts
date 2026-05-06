// Ambient type augmentation for styled-jsx.
//
// styled-jsx is bundled and loaded automatically by Next.js at runtime, but
// starting with Next 16 the TypeScript types are no longer re-exported from
// `/// <reference types="next" />` the way they used to be. The runtime keeps
// working, but `<style jsx>` and `<style jsx global>` stop type-checking and
// break `tsc --noEmit` / `next build`.
//
// Rather than installing styled-jsx as a direct dependency (and relying on
// pnpm hoisting the `global.d.ts` into a place TypeScript auto-loads), we
// inline the same module augmentation here. This file lives at the app root
// so it's picked up by the existing tsconfig `include: ["**/*.ts"]` glob.
//
// Keep this in sync with styled-jsx's own `global.d.ts` if the upstream types
// ever grow new fields — at time of writing (styled-jsx 5.1.x) the augmented
// surface is only `jsx` and `global`.

import 'react';

declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
