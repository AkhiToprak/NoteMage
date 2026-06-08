// Ultra (Pro-tier) path marker. Used wherever an Ultra path is surfaced —
// the Learn Continue rail and the Paths list. The gold ink uses --ultra-ink so
// it stays readable when the surface flips to light (gold FILLS keep
// --brand-gold). The glyph is the stepped-bolt brand asset.

export function UltraSparkIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M9.31994 13.2805H12.4099V20.4805C12.4099 21.5405 13.7299 22.0405 14.4299 21.2405L21.9999 12.6405C22.6599 11.8905 22.1299 10.7205 21.1299 10.7205H18.0399V3.52046C18.0399 2.46046 16.7199 1.96046 16.0199 2.76046L8.44994 11.3605C7.79994 12.1105 8.32994 13.2805 9.31994 13.2805Z" />
      <path opacity="0.4" d="M8.5 4.75H1.5C1.09 4.75 0.75 4.41 0.75 4C0.75 3.59 1.09 3.25 1.5 3.25H8.5C8.91 3.25 9.25 3.59 9.25 4C9.25 4.41 8.91 4.75 8.5 4.75Z" />
      <path opacity="0.4" d="M7.5 20.75H1.5C1.09 20.75 0.75 20.41 0.75 20C0.75 19.59 1.09 19.25 1.5 19.25H7.5C7.91 19.25 8.25 19.59 8.25 20C8.25 20.41 7.91 20.75 7.5 20.75Z" />
      <path opacity="0.4" d="M4.5 12.75H1.5C1.09 12.75 0.75 12.41 0.75 12C0.75 11.59 1.09 11.25 1.5 11.25H4.5C4.91 11.25 5.25 11.59 5.25 12C5.25 12.41 4.91 12.75 4.5 12.75Z" />
    </svg>
  );
}

export function UltraBadge({ fontSize = 11, iconSize = 13 }: { fontSize?: number; iconSize?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        flexShrink: 0,
        color: 'var(--ultra-ink)',
        fontFamily: 'var(--font-brand)',
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      Ultra
      <UltraSparkIcon size={iconSize} />
    </span>
  );
}
