import { useEffect, useRef } from "react";
import { EVALUATOR_PRESETS } from "../lib/presets";

const GAP = 42;
const ROW_COUNT = 6;
const MIN_ROW_SPACING = GAP * 2.4;
const STATUSES = ["OPEN", "FUNDED", "SUBMITTED", "COMPLETED", "REJECTED"];

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function randHex(): string {
  return Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
}
function randAddr(): string {
  return `0x${randHex()}${randHex()}…${randHex()}`;
}
function randUsdc(): string {
  return `${(0.5 + Math.random() * 4.5).toFixed(2)} USDC`;
}
function randJobId(): string {
  return `#${160000 + Math.floor(Math.random() * 4000)}`;
}

function rowContent(): string {
  const items: string[] = [];
  for (let i = 0; i < 10; i++) {
    const pick = Math.random();
    if (pick < 0.3) items.push(`${randJobId()} ${STATUSES[Math.floor(Math.random() * STATUSES.length)]}`);
    else if (pick < 0.55) items.push(randAddr());
    else if (pick < 0.8) {
      const p = EVALUATOR_PRESETS[Math.floor(Math.random() * EVALUATOR_PRESETS.length)];
      items.push(`${p.ansName}.arc`);
    } else items.push(randUsdc());
  }
  return items.map((t) => `<span>${t}</span>`).join("");
}

// Ambient dot-grid + traveling pulses (canvas) plus drifting mono ticker
// rows (DOM), reused site-wide behind every page except Arena, which has
// its own full-screen canvas already. Colors are read live from the CSS
// custom properties so light/dark just work without duplicating tokens.
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = window.innerWidth;
    let H = window.innerHeight;
    let DPR = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * DPR;
      canvas!.height = H * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let ruleColor = readVar("--color-rule-2");
    let accentColor = readVar("--color-accent");
    function refreshColors() {
      ruleColor = readVar("--color-rule-2");
      accentColor = readVar("--color-accent");
    }
    const themeObserver = new MutationObserver(refreshColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    interface Pulse {
      x?: number;
      y?: number;
      x0?: number;
      x1?: number;
      y0?: number;
      y1?: number;
      horizontal: boolean;
      t0: number;
      dur: number;
    }
    let pulses: Pulse[] = [];
    function spawnPulse() {
      const cols = Math.floor(W / GAP);
      const rows = Math.floor(H / GAP);
      const horizontal = Math.random() < 0.5;
      if (horizontal) {
        const row = Math.floor(Math.random() * rows);
        pulses.push({ y: row * GAP + GAP / 2, x0: 0, x1: W, horizontal: true, t0: performance.now(), dur: 3000 + Math.random() * 1600 });
      } else {
        const col = Math.floor(Math.random() * cols);
        pulses.push({ x: col * GAP + GAP / 2, y0: 0, y1: H, horizontal: false, t0: performance.now(), dur: 3000 + Math.random() * 1600 });
      }
    }
    const pulseInterval = reduced ? null : window.setInterval(spawnPulse, 1000);
    if (!reduced) {
      spawnPulse();
      spawnPulse();
    }

    interface Burst {
      x0: number;
      y0: number;
      cx: number;
      cy: number;
      t0: number;
      dur: number;
    }
    let bursts: Burst[] = [];
    function spawnBurst(cx: number, cy: number) {
      const n = 24;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + Math.random() * 0.25;
        const dist = 110 + Math.random() * 260;
        bursts.push({ x0: cx + Math.cos(angle) * dist, y0: cy + Math.sin(angle) * dist, cx, cy, t0: performance.now(), dur: 550 + Math.random() * 400 });
      }
    }
    function onClick(e: MouseEvent) {
      if (reduced) return;
      const target = e.target as HTMLElement;
      // Skip real chrome — header/nav, floating controls, buttons/links —
      // clicking those already triggers navigation and a burst on top of
      // it just adds visible stutter for no payoff.
      if (target.closest(".topbar, .corner-actions, .wallet-fab, .theme-toggle, a, button, input, textarea, select")) return;
      spawnBurst(e.clientX, e.clientY);
    }
    window.addEventListener("click", onClick);

    let raf = 0;
    function draw(now: number) {
      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = ruleColor;
      for (let x = GAP / 2; x < W; x += GAP) {
        for (let y = GAP / 2; y < H; y += GAP) {
          ctx!.beginPath();
          ctx!.arc(x, y, 1.1, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
      if (!reduced) {
        pulses = pulses.filter((p) => now - p.t0 < p.dur);
        pulses.forEach((p) => {
          const t = (now - p.t0) / p.dur;
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const glowAlpha = Math.sin(t * Math.PI) * 0.85;
          const x = p.horizontal ? p.x0! + (p.x1! - p.x0!) * e : p.x!;
          const y = p.horizontal ? p.y! : p.y0! + (p.y1! - p.y0!) * e;
          ctx!.beginPath();
          ctx!.arc(x, y, 3, 0, Math.PI * 2);
          ctx!.fillStyle = accentColor.replace(")", ` / ${glowAlpha * 0.5})`);
          ctx!.shadowColor = accentColor;
          ctx!.shadowBlur = 9;
          ctx!.fill();
          ctx!.shadowBlur = 0;
        });
        bursts = bursts.filter((p) => now - p.t0 < p.dur);
        bursts.forEach((p) => {
          const t = Math.min(1, (now - p.t0) / p.dur);
          const e = 1 - Math.pow(1 - t, 3);
          const x = p.x0 + (p.cx - p.x0) * e;
          const y = p.y0 + (p.cy - p.y0) * e;
          const fade = 1 - t;
          ctx!.beginPath();
          ctx!.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx!.fillStyle = accentColor.replace(")", ` / ${fade * 0.8})`);
          ctx!.shadowColor = accentColor;
          ctx!.shadowBlur = 7;
          ctx!.fill();
          ctx!.shadowBlur = 0;
        });
        raf = requestAnimationFrame(draw);
      }
    }
    raf = requestAnimationFrame(draw);

    // Ticker rows sit at the midpoints between dot-grid rows (never on top
    // of a dot row), picked from a scattered, minimum-spaced subset so text
    // doesn't bunch into one visual band.
    function layoutRows() {
      field!.innerHTML = "";
      const midpoints: number[] = [];
      for (let y = GAP; y < H; y += GAP) midpoints.push(y);
      const pool = [...midpoints];
      const chosen: number[] = [];
      let guard = 0;
      while (chosen.length < ROW_COUNT && pool.length && guard++ < 500) {
        const idx = Math.floor(Math.random() * pool.length);
        const candidate = pool[idx];
        if (chosen.every((c) => Math.abs(c - candidate) >= MIN_ROW_SPACING)) chosen.push(candidate);
        pool.splice(idx, 1);
      }
      chosen
        .sort((a, b) => a - b)
        .forEach((y) => {
          const row = document.createElement("div");
          const dirClass = Math.random() < 0.5 ? "ambient-bg-row-left" : "ambient-bg-row-right";
          const dim = Math.random() < 0.45;
          row.className = `ambient-bg-row ${dirClass}${dim ? " ambient-bg-row-dim" : ""}`;
          row.style.top = `${y}px`;
          row.style.transform = "translateY(-50%)";
          row.style.animationDuration = `${34 + Math.random() * 26}s`;
          // Base demo range was dim 0.035-0.055 / bright 0.055-0.085; bumped +15%.
          row.style.opacity = String(dim ? 0.0403 + Math.random() * 0.023 : 0.0633 + Math.random() * 0.0345);
          const content = rowContent();
          row.innerHTML = content + content;
          field!.appendChild(row);
        });
    }
    layoutRows();
    window.addEventListener("resize", layoutRows);

    return () => {
      cancelAnimationFrame(raf);
      if (pulseInterval) window.clearInterval(pulseInterval);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", layoutRows);
      window.removeEventListener("click", onClick);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <div className="ambient-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="ambient-bg-canvas" />
      <div ref={fieldRef} className="ambient-bg-field" />
    </div>
  );
}
