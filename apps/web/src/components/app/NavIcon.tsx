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
  calendar: (
    <>
      <path d="M16.7502 3.56V2C16.7502 1.59 16.4102 1.25 16.0002 1.25C15.5902 1.25 15.2502 1.59 15.2502 2V3.5H8.75022V2C8.75022 1.59 8.41022 1.25 8.00022 1.25C7.59022 1.25 7.25022 1.59 7.25022 2V3.56C4.55022 3.81 3.24023 5.42 3.04023 7.81C3.02023 8.1 3.26023 8.34 3.54023 8.34H20.4602C20.7502 8.34 20.9902 8.09 20.9602 7.81C20.7602 5.42 19.4502 3.81 16.7502 3.56Z" />
      <path
        opacity="0.4"
        d="M20 9.83984C20.55 9.83984 21 10.2898 21 10.8398V16.9998C21 19.9998 19.5 21.9998 16 21.9998H8C4.5 21.9998 3 19.9998 3 16.9998V10.8398C3 10.2898 3.45 9.83984 4 9.83984H20Z"
      />
      <path d="M14.8399 14.9892L14.3399 15.4992H14.3299L11.2999 18.5292C11.1699 18.6592 10.8999 18.7992 10.7099 18.8192L9.35993 19.0192C8.86993 19.0892 8.52995 18.7392 8.59995 18.2592L8.78996 16.8992C8.81996 16.7092 8.94993 16.4492 9.07993 16.3092L12.1199 13.2792L12.6199 12.7692C12.9499 12.4392 13.3199 12.1992 13.7199 12.1992C14.0599 12.1992 14.4299 12.3592 14.8399 12.7692C15.7399 13.6692 15.4499 14.3792 14.8399 14.9892Z" />
    </>
  ),
  profile: (
    <>
      <path
        opacity="0.4"
        d="M12 2C9.38 2 7.25 4.13 7.25 6.75C7.25 9.32 9.26 11.4 11.88 11.49C11.96 11.48 12.04 11.48 12.1 11.49C12.12 11.49 12.13 11.49 12.15 11.49C12.16 11.49 12.16 11.49 12.17 11.49C14.73 11.4 16.74 9.32 16.75 6.75C16.75 4.13 14.62 2 12 2Z"
      />
      <path d="M17.08 14.1499C14.29 12.2899 9.73999 12.2899 6.92999 14.1499C5.65999 14.9999 4.95999 16.1499 4.95999 17.3799C4.95999 18.6099 5.65999 19.7499 6.91999 20.5899C8.31999 21.5299 10.16 21.9999 12 21.9999C13.84 21.9999 15.68 21.5299 17.08 20.5899C18.34 19.7399 19.04 18.5999 19.04 17.3599C19.03 16.1299 18.34 14.9899 17.08 14.1499Z" />
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
