/**
 * lucide-react (v1+) eliminó los íconos de marcas (Facebook, Instagram...).
 * Estos son glifos genéricos minimalistas hechos a mano para no depender de
 * un paquete de íconos de marca.
 */
type IconProps = { className?: string };

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.25-1.5 1.55-1.5H16.5V4.35C16.2 4.3 15.2 4.2 14 4.2c-2.4 0-4 1.45-4 4.1V10.5H7.5v3H10V21h3.5Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14.5 3c.35 2.1 1.7 3.5 4 3.7v2.6c-1.4 0-2.7-.4-3.9-1.2v6.4c0 3.1-2.1 5.5-5.3 5.5-3 0-5.3-2.4-5.3-5.4 0-3 2.4-5.4 5.4-5.4.35 0 .7.03 1 .1v2.7a2.7 2.7 0 0 0-1-.2c-1.5 0-2.7 1.2-2.7 2.8 0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.8-1.2 2.8-2.9V3h2.3Z" />
    </svg>
  );
}
