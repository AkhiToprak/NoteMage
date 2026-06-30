/* Primary-nav icon. Most items render a Material Symbol glyph; a few
   (Dashboard, Paths) use a custom brand glyph supplied as a PNG, drawn as a
   CSS mask filled with `currentColor` so it inherits the link's
   active/inactive color exactly like the Material Symbols do. */
export function NavIcon({
  icon,
  img,
  active,
  size,
}: {
  icon?: string;
  img?: string;
  active?: boolean;
  size: number;
}) {
  if (img) {
    return (
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          backgroundColor: 'currentColor',
          WebkitMaskImage: `url(${img})`,
          maskImage: `url(${img})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    );
  }
  return (
    <span
      className={active ? 'material-symbols-outlined filled' : 'material-symbols-outlined'}
      style={{ fontSize: size, color: 'inherit' }}
      aria-hidden
    >
      {icon}
    </span>
  );
}
