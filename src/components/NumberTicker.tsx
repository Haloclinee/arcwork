import { useEffect, useRef, useState } from "react";

function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Counts up from 0 to `value` once the span scrolls into view, using a
// plain eased rAF loop — matches the hand-rolled animation style already
// used on the site (AmbientBackground) instead of pulling in a motion
// library. Only the first appearance animates; later value changes (e.g.
// a live-polled job counter ticking up) just snap the text, so a routine
// refetch never replays the whole count from zero.
export function NumberTicker({
  value,
  format = defaultFormat,
  duration = 1100,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);
  const [display, setDisplay] = useState(() => format(0));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (hasAnimated.current) {
      setDisplay(format(value));
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hasAnimated.current = true;
      setDisplay(format(value));
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        hasAnimated.current = true;
        const t0 = performance.now();
        function tick(now: number) {
          const t = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(format(value * eased));
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, format]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
