import type { CSSProperties, ReactNode } from 'react';

/* Primary-nav icon. Most items render a Material Symbol glyph; Dashboard and
   Paths use custom brand glyphs — inline duotone SVGs filled with
   `currentColor`, so they stay crisp at any size and inherit each nav's
   active/inactive color exactly like the Material Symbols do.

   Every icon is centered inside an identical `size`×`size` box. Material
   Symbols don't share a fixed advance width (e.g. `person` is narrower than
   `cottage`), so without this the icon cells — and the labels after them —
   drift on the x-axis. The fixed box keeps the whole column aligned. */
const GLYPHS: Record<string, ReactNode> = {
  home: (
    <>
      <path
        opacity="0.4"
        d="M20.83 8.01002L14.28 2.77002C13 1.75002 11 1.74002 9.72996 2.76002L3.17996 8.01002C2.23996 8.76002 1.66996 10.26 1.86996 11.44L3.12996 18.98C3.41996 20.67 4.98996 22 6.69996 22H17.3C18.99 22 20.59 20.64 20.88 18.97L22.14 11.43C22.32 10.26 21.75 8.76002 20.83 8.01002Z"
      />
      <path d="M12 18.75C11.59 18.75 11.25 18.41 11.25 18V15C11.25 14.59 11.59 14.25 12 14.25C12.41 14.25 12.75 14.59 12.75 15V18C12.75 18.41 12.41 18.75 12 18.75Z" />
    </>
  ),
  flag: (
    <>
      <path d="M5.1499 22C4.7399 22 4.3999 21.66 4.3999 21.25V2.75C4.3999 2.34 4.7399 2 5.1499 2C5.5599 2 5.8999 2.34 5.8999 2.75V21.25C5.8999 21.66 5.5599 22 5.1499 22Z" />
      <path
        opacity="0.4"
        d="M18.02 12.3294L16.8 11.1094C16.51 10.8594 16.34 10.4894 16.33 10.0794C16.31 9.62938 16.49 9.17938 16.82 8.84938L18.02 7.64937C19.06 6.60938 19.45 5.60938 19.12 4.81938C18.8 4.03938 17.81 3.60938 16.35 3.60938H5.15002C4.94002 3.61937 4.77002 3.78938 4.77002 3.99938V15.9994C4.77002 16.2094 4.94002 16.3794 5.15002 16.3794H16.35C17.79 16.3794 18.76 15.9394 19.09 15.1494C19.42 14.3494 19.04 13.3594 18.02 12.3294Z"
      />
    </>
  ),
};

export function NavIcon({
  icon,
  img,
  active,
  size,
}: {
  icon?: string;
  /** Custom brand glyph key (e.g. 'home', 'flag'); wins over `icon`. */
  img?: string;
  active?: boolean;
  size: number;
}) {
  const box: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'inherit',
  };
  const glyph = img ? GLYPHS[img] : undefined;
  return (
    <span aria-hidden style={box}>
      {glyph ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          focusable="false"
          style={{ display: 'block' }}
        >
          {glyph}
        </svg>
      ) : (
        <span
          className={active ? 'material-symbols-outlined filled' : 'material-symbols-outlined'}
          style={{ fontSize: size, lineHeight: 1, color: 'inherit' }}
        >
          {icon}
        </span>
      )}
    </span>
  );
}
