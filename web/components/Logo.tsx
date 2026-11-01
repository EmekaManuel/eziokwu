/** The Eziokwu pin-with-check mark. Colors follow the theme tokens. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 22.2s7.2-6.3 7.2-12.3a7.2 7.2 0 1 0-14.4 0c0 6 7.2 12.3 7.2 12.3z" fill="var(--amber)" />
      <path d="M8.5 10.3l2.4 2.4 4.6-4.9" fill="none" stroke="var(--g-900)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
