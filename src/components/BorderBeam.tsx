// A thin light beam that sweeps around a container's border, pure CSS via
// an animated @property angle + conic-gradient mask (see index.css) —
// ported from the Magic UI "Border Beam" pattern without pulling in its
// motion/react dependency, to stay consistent with this site's hand-rolled
// CSS animations.
export function BorderBeam({ className = "" }: { className?: string }) {
  return <span className={`border-beam ${className}`} aria-hidden="true" />;
}
