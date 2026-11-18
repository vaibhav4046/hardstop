// The HARDSTOP mark: a vault door (the gold ring), the bolt that locks it
// (the bar across), and the hard stop the bolt runs into (the red block).
// No lettering. Whoever places it gives it its name (an aria-label or a
// hidden caption); the drawing itself is decorative. The same drawing, in
// fixed colours, is the site icon in app/icon.svg.

export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg className={`logo ${className}`} viewBox="0 0 40 32" aria-hidden="true" focusable="false">
      <circle className="logo-door" cx="15" cy="16" r="12" />
      <circle className="logo-wheel" cx="15" cy="16" r="5.5" />
      <rect className="logo-bolt" x="1.5" y="14.25" width="29" height="3.5" rx="1.25" />
      <rect className="logo-stop" x="31" y="10" width="8" height="12" rx="0.75" />
    </svg>
  )
}
