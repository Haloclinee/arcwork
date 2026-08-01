import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi } from "../lib/arc";
import {
  jobCompletedEvent,
  jobCreatedEvent,
  jobFundedEvent,
  jobRejectedEvent,
  jobSubmittedEvent,
} from "../lib/events";
import { EVALUATOR_PRESETS } from "../lib/presets";
import { shortAddr } from "../lib/format";

// ── Full-screen, gamified live view — every node is a real wallet, every
// packet a real on-chain event, polled from the canonical ERC-8183 contract.
// Judges sit on a fixed inner ring (their identity is permanent); clients and
// providers are unbounded real wallets, so they're mapped onto a small pool
// of fixed outer-ring "slots" — recycled (oldest-idle evicted) instead of
// free-floating, so every packet travels between two known, legible points.

const POLL_MS = 6000;
const SCAN_BLOCKS = 3000n;
const SLOT_COUNT = 5;
const SLOT_IDLE_MS = 3 * 60_000;

type Theme = "light" | "dark";

function usePageTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light" || attr === "dark") setTheme(attr);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMq = () => {
      if (!document.documentElement.getAttribute("data-theme")) setTheme(mq.matches ? "dark" : "light");
    };
    mq?.addEventListener("change", onMq);
    return () => {
      obs.disconnect();
      mq?.removeEventListener("change", onMq);
    };
  }, []);
  return theme;
}

const PALETTE: Record<Theme, Record<string, string>> = {
  dark: {
    bg: "oklch(14% 0.015 260)",
    rule: "oklch(30% 0.018 260)",
    ruleFaint: "oklch(30% 0.018 260 / 0.6)",
    onSurface: "oklch(95% 0.006 255)",
    onSurface2: "oklch(66% 0.013 255)",
    nodeFill: "oklch(20% 0.016 260)",
    funded: "oklch(72% 0.13 68)",
    win: "oklch(70% 0.14 155)",
    lose: "oklch(70% 0.17 25)",
  },
  light: {
    bg: "oklch(98.5% 0.004 250)",
    rule: "oklch(82% 0.011 255)",
    ruleFaint: "oklch(82% 0.011 255 / 0.7)",
    onSurface: "oklch(24% 0.020 258)",
    onSurface2: "oklch(56% 0.013 255)",
    nodeFill: "oklch(96.3% 0.006 252)",
    funded: "oklch(62% 0.13 68)",
    win: "oklch(56% 0.13 155)",
    lose: "oklch(58% 0.15 25)",
  },
};
const ACCENT = "oklch(58% 0.200 256)";

// ── Distinct per-judge glyphs (abstract, consistent stroke weight) ──
type Glyph = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => void;
const JUDGE_GLYPHS: Record<string, Glyph> = {
  llama: (c, x, y, s) => { c.beginPath(); [-1, 0, 1].forEach((i) => { c.moveTo(x + i * s * 0.4, y + s * 0.5); c.lineTo(x + i * s * 0.4, y - s * 0.2 - Math.abs(i) * s * 0.25); }); c.stroke(); },
  deepseek: (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.35); c.lineTo(x, y + s * 0.05); c.lineTo(x + s * 0.5, y - s * 0.35); c.moveTo(x - s * 0.5, y + s * 0.1); c.lineTo(x, y + s * 0.5); c.lineTo(x + s * 0.5, y + s * 0.1); c.stroke(); },
  gemma: (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.45, y + s * 0.45); c.lineTo(x + s * 0.45, y - s * 0.45); c.stroke(); c.beginPath(); c.arc(x + s * 0.45, y - s * 0.45, s * 0.12, 0, 7); c.fill(); },
  mistral: (c, x, y, s) => { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx * s * 0.32, y + dy * s * 0.32, s * 0.1, 0, 7); c.fill(); }); },
  phi: (c, x, y, s) => { c.beginPath(); c.ellipse(x, y, s * 0.32, s * 0.5, 0, 0, 7); c.moveTo(x, y - s * 0.55); c.lineTo(x, y + s * 0.55); c.stroke(); },
  qwen: (c, x, y, s) => { c.beginPath(); c.arc(x - s * 0.22, y, s * 0.32, 0, 7); c.stroke(); c.beginPath(); c.arc(x + s * 0.22, y, s * 0.32, 0, 7); c.stroke(); },
  nova: (c, x, y, s) => { c.beginPath(); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; c.moveTo(x + Math.cos(a) * s * 0.15, y + Math.sin(a) * s * 0.15); c.lineTo(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55); c.moveTo(x - Math.cos(a) * s * 0.15, y - Math.sin(a) * s * 0.15); c.lineTo(x - Math.cos(a) * s * 0.55, y - Math.sin(a) * s * 0.55); } c.stroke(); },
  scout: (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.4, y + s * 0.35); c.lineTo(x + s * 0.5, y); c.lineTo(x - s * 0.4, y - s * 0.35); c.stroke(); },
  solar: (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.24, 0, 7); c.stroke(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4); c.lineTo(x + Math.cos(a) * s * 0.56, y + Math.sin(a) * s * 0.56); c.stroke(); } },
  zeus: (c, x, y, s) => { c.beginPath(); c.moveTo(x + s * 0.18, y - s * 0.55); c.lineTo(x - s * 0.22, y + s * 0.05); c.lineTo(x + s * 0.05, y + s * 0.05); c.lineTo(x - s * 0.18, y + s * 0.55); c.lineTo(x + s * 0.3, y - s * 0.1); c.lineTo(x + s * 0.02, y - s * 0.1); c.closePath(); c.stroke(); },
  flash: (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.35); c.lineTo(x - s * 0.1, y); c.lineTo(x - s * 0.5, y + s * 0.35); c.moveTo(x, y - s * 0.35); c.lineTo(x + s * 0.4, y); c.lineTo(x, y + s * 0.35); c.stroke(); },
  yi: (c, x, y, s) => { c.beginPath(); [-0.3, 0, 0.3].forEach((dy) => { c.moveTo(x - s * 0.42, y + s * dy); c.lineTo(x + s * 0.42, y + s * dy); }); c.stroke(); },
};
function glyphKey(ansName: string) {
  return ansName.replace(/^arcwork-/, "");
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Pt { x: number; y: number; }
interface Packet { from: Pt; to: Pt; color: string; t0: number; dur: number; landed?: boolean; }
interface Sweep { angle: number; color: string; t0: number; dur: number; }
interface Particle { x: number; y: number; vx: number; vy: number; t0: number; life: number; color: string; }
interface Slot { addr: string | null; label: string; lastActive: number; pulse: number; x: number; y: number; }
interface JudgeNode { addr: string; ansName: string; x: number; y: number; angle: number; wins: number; losses: number; flash: number; flashColor: string; }

export function ArenaPage() {
  const theme = usePageTheme();
  const publicClient = usePublicClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [feed, setFeed] = useState<{ id: number; html: string; cls: string }[]>([]);
  const [stats, setStats] = useState({ done: 0, vol: 0, total: 0, wins: 0 });
  const feedId = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());

  const judgesRef = useRef<Record<string, JudgeNode>>({});
  const clientSlotsRef = useRef<Slot[]>([]);
  const providerSlotsRef = useRef<Slot[]>([]);
  const vaultRef = useRef<Pt>({ x: 0, y: 0 });
  const packetsRef = useRef<Packet[]>([]);
  const sweepsRef = useRef<Sweep[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  function pushFeed(html: string, cls = "") {
    feedId.current += 1;
    setFeed((prev) => [{ id: feedId.current, html, cls }, ...prev].slice(0, 30));
  }

  // ── Layout: recompute fixed positions on resize ──
  function layout(w: number, h: number) {
    const cx = w / 2, cy = h / 2 + 8;
    vaultRef.current = { x: cx, y: cy };
    const judgeR = Math.min(w, h) * 0.23;
    EVALUATOR_PRESETS.forEach((p, i) => {
      const angle = (i / EVALUATOR_PRESETS.length) * Math.PI * 2 - Math.PI / 2;
      const key = p.address.toLowerCase();
      const prev = judgesRef.current[key];
      judgesRef.current[key] = {
        addr: key, ansName: p.ansName, angle,
        x: cx + Math.cos(angle) * judgeR, y: cy + Math.sin(angle) * judgeR,
        wins: prev?.wins ?? 0, losses: prev?.losses ?? 0, flash: prev?.flash ?? 0, flashColor: prev?.flashColor ?? PALETTE[themeRef.current].win,
      };
    });
    const outerR = Math.min(w, h) * 0.42;
    const cStart = (100 * Math.PI) / 180, cEnd = (260 * Math.PI) / 180;
    const pStart = (-80 * Math.PI) / 180, pEnd = (80 * Math.PI) / 180;
    if (clientSlotsRef.current.length === 0) {
      clientSlotsRef.current = Array.from({ length: SLOT_COUNT }, () => ({ addr: null, label: "", lastActive: 0, pulse: 0, x: 0, y: 0 }));
      providerSlotsRef.current = Array.from({ length: SLOT_COUNT }, () => ({ addr: null, label: "", lastActive: 0, pulse: 0, x: 0, y: 0 }));
    }
    clientSlotsRef.current.forEach((s, i) => {
      const a = cStart + (i / (SLOT_COUNT - 1)) * (cEnd - cStart);
      s.x = cx + Math.cos(a) * outerR; s.y = cy + Math.sin(a) * outerR;
    });
    providerSlotsRef.current.forEach((s, i) => {
      const a = pStart + (i / (SLOT_COUNT - 1)) * (pEnd - pStart);
      s.x = cx + Math.cos(a) * outerR; s.y = cy + Math.sin(a) * outerR;
    });
  }

  useEffect(() => {
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      setDims({ w, h });
      layout(w, h);
    }
    layout(dims.w, dims.h);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getSlot(slots: Slot[], addr: string, label: string): Slot {
    const key = addr.toLowerCase();
    let slot = slots.find((s) => s.addr === key);
    if (!slot) {
      slot = slots.find((s) => s.addr === null) ?? slots.reduce((a, b) => (a.lastActive < b.lastActive ? a : b));
      slot.addr = key;
    }
    slot.label = label;
    slot.lastActive = Date.now();
    slot.pulse = performance.now();
    return slot;
  }

  function spawnPacket(from: Pt, to: Pt, color: string, dur = 2600) {
    packetsRef.current.push({ from: { ...from }, to: { ...to }, color, t0: performance.now(), dur });
  }
  function ringSweep(judgeAddr: string, color: string) {
    const j = judgesRef.current[judgeAddr.toLowerCase()];
    if (!j) return;
    sweepsRef.current.push({ angle: j.angle, color, t0: performance.now(), dur: 900 });
  }
  function burst(x: number, y: number, color: string, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2;
      particlesRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: performance.now(), life: 550 + Math.random() * 300, color });
    }
  }

  // ── Draw loop ──
  useEffect(() => {
    let raf: number;
    function drawJudge(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number, ringColor: string) {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = PALETTE[themeRef.current].nodeFill; ctx.fill();
      ctx.strokeStyle = ringColor; ctx.stroke();
      ctx.strokeStyle = ringColor; ctx.fillStyle = ringColor; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      (JUDGE_GLYPHS[glyphKey(id)] ?? JUDGE_GLYPHS.nova)(ctx, x, y, r);
      ctx.restore();
    }
    function drawSlotNode(ctx: CanvasRenderingContext2D, shape: "square" | "tri", x: number, y: number, r: number, color: string, pulseAmt: number) {
      ctx.save();
      if (pulseAmt > 0.02) {
        const R = r + pulseAmt * 12;
        ctx.beginPath();
        if (shape === "square") ctx.rect(x - R, y - R, R * 2, R * 2);
        else { ctx.moveTo(x, y - R); ctx.lineTo(x + R * 0.87, y + R * 0.5); ctx.lineTo(x - R * 0.87, y + R * 0.5); ctx.closePath(); }
        ctx.strokeStyle = color.replace(")", ` / ${0.7 * (1 - pulseAmt)})`); ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.beginPath();
      if (shape === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
      else { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.87, y + r * 0.5); ctx.lineTo(x - r * 0.87, y + r * 0.5); ctx.closePath(); }
      ctx.fillStyle = PALETTE[themeRef.current].nodeFill; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }

    function frame() {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = dims.w, h = dims.h;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr; canvas.height = h * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const P = PALETTE[themeRef.current];
          const now = performance.now();
          ctx.clearRect(0, 0, w, h);

          const cx = vaultRef.current.x, cy = vaultRef.current.y;
          const judgeR = Math.min(w, h) * 0.23, outerR = Math.min(w, h) * 0.42;

          ctx.save();
          ctx.strokeStyle = P.ruleFaint; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, judgeR, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([2, 6]);
          ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          sweepsRef.current = sweepsRef.current.filter((s) => now - s.t0 < s.dur);
          sweepsRef.current.forEach((s) => {
            const t = (now - s.t0) / s.dur;
            const width = (1 - t) * 0.5 + 0.05;
            ctx.save();
            ctx.beginPath(); ctx.arc(cx, cy, judgeR, s.angle - width, s.angle + width);
            ctx.strokeStyle = s.color.replace(")", ` / ${0.5 * (1 - t)})`);
            ctx.lineWidth = 6 * (1 - t) + 1;
            ctx.stroke();
            ctx.restore();
          });

          ctx.save();
          ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT; ctx.fill();
          ctx.font = "700 20px Bricolage, sans-serif";
          ctx.fillStyle = "oklch(99% 0.004 256)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("◠", cx, cy + 2);
          ctx.restore();

          clientSlotsRef.current.forEach((s) => {
            const pulseAmt = Math.max(0, 1 - (now - s.pulse) / 700);
            drawSlotNode(ctx, "square", s.x, s.y, 11, s.addr && pulseAmt > 0.05 ? ACCENT : P.onSurface2, pulseAmt);
            if (s.addr) {
              ctx.font = "500 9.5px monospace"; ctx.fillStyle = P.onSurface2; ctx.textAlign = "right";
              ctx.fillText(s.label, s.x - 18, s.y + 3);
            }
          });
          providerSlotsRef.current.forEach((s) => {
            const pulseAmt = Math.max(0, 1 - (now - s.pulse) / 700);
            drawSlotNode(ctx, "tri", s.x, s.y, 11, s.addr && pulseAmt > 0.05 ? ACCENT : P.onSurface2, pulseAmt);
            if (s.addr) {
              ctx.font = "500 9.5px monospace"; ctx.fillStyle = P.onSurface2; ctx.textAlign = "left";
              ctx.fillText(s.label, s.x + 18, s.y + 3);
            }
          });

          Object.values(judgesRef.current).forEach((j) => {
            const flashT = now - j.flash;
            const flashing = flashT < 600;
            const r = 18 + (flashing ? (1 - flashT / 600) * 7 : 0);
            if (flashing) {
              ctx.save();
              ctx.beginPath(); ctx.arc(j.x, j.y, r + 9, 0, Math.PI * 2);
              ctx.strokeStyle = j.flashColor.replace(")", ` / ${1 - flashT / 600})`);
              ctx.lineWidth = 2.5; ctx.stroke();
              ctx.restore();
            }
            drawJudge(ctx, j.ansName, j.x, j.y, r, flashing ? j.flashColor : ACCENT);
            const nx = Math.cos(j.angle), ny = Math.sin(j.angle);
            ctx.font = "500 9.5px monospace"; ctx.fillStyle = P.onSurface2; ctx.textAlign = "center";
            ctx.fillText(glyphKey(j.ansName), j.x + nx * (r + 15), j.y + ny * (r + 15) + 3);
          });

          packetsRef.current = packetsRef.current.filter((p) => now - p.t0 < p.dur + 40);
          packetsRef.current.forEach((p) => {
            const t = Math.min(1, (now - p.t0) / p.dur);
            const e = easeInOutCubic(t);
            const x = p.from.x + (p.to.x - p.from.x) * e, y = p.from.y + (p.to.y - p.from.y) * e;
            for (let k = 1; k <= 4; k++) {
              const te = Math.max(0, easeInOutCubic(Math.max(0, t - k * 0.03)));
              const tx = p.from.x + (p.to.x - p.from.x) * te, ty = p.from.y + (p.to.y - p.from.y) * te;
              ctx.beginPath(); ctx.arc(tx, ty, 4.2 - k * 0.7, 0, Math.PI * 2);
              ctx.fillStyle = p.color.replace(")", ` / ${0.28 - k * 0.06})`);
              ctx.fill();
            }
            ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2);
            ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
            if (t >= 1 && !p.landed) { p.landed = true; burst(p.to.x, p.to.y, p.color, 8); }
          });

          particlesRef.current = particlesRef.current.filter((p) => now - p.t0 < p.life);
          particlesRef.current.forEach((p) => {
            const t = (now - p.t0) / p.life;
            const x = p.x + p.vx * (t * 42), y = p.y + p.vy * (t * 42) + t * t * 16;
            ctx.beginPath(); ctx.arc(x, y, 2.2 * (1 - t), 0, Math.PI * 2);
            ctx.fillStyle = p.color.replace(")", ` / ${1 - t})`); ctx.fill();
          });
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dims.w, dims.h]);

  // ── Real on-chain event polling ──
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    const jobEvaluator = new Map<string, `0x${string}`>();

    async function poll() {
      try {
        const latest = await publicClient!.getBlockNumber();
        const fromBlock = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 1n;
        const [created, funded, submitted, completed, rejected] = await Promise.all([
          publicClient!.getLogs({ address: ERC8183_ADDRESS, event: jobCreatedEvent, fromBlock, toBlock: latest }),
          publicClient!.getLogs({ address: ERC8183_ADDRESS, event: jobFundedEvent, fromBlock, toBlock: latest }),
          publicClient!.getLogs({ address: ERC8183_ADDRESS, event: jobSubmittedEvent, fromBlock, toBlock: latest }),
          publicClient!.getLogs({ address: ERC8183_ADDRESS, event: jobCompletedEvent, fromBlock, toBlock: latest }),
          publicClient!.getLogs({ address: ERC8183_ADDRESS, event: jobRejectedEvent, fromBlock, toBlock: latest }),
        ]);
        if (cancelled) return;

        const all = [
          ...created.map((l) => ({ l, type: "created" as const })),
          ...funded.map((l) => ({ l, type: "funded" as const })),
          ...submitted.map((l) => ({ l, type: "submitted" as const })),
          ...completed.map((l) => ({ l, type: "completed" as const })),
          ...rejected.map((l) => ({ l, type: "rejected" as const })),
        ].sort((a, b) => Number(a.l.blockNumber! - b.l.blockNumber!));

        for (const { l, type } of all) {
          const key = `${l.transactionHash}-${l.logIndex}`;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);

          const jobId = (l.args as { jobId?: bigint }).jobId;
          if (jobId === undefined) continue;
          const jobKey = jobId.toString();

          if (type === "created") {
            const args = l.args as { client?: `0x${string}`; evaluator?: `0x${string}` };
            if (!args.client || !args.evaluator) continue;
            jobEvaluator.set(jobKey, args.evaluator);
            const judge = judgesRef.current[args.evaluator.toLowerCase()];
            const cSlot = getSlot(clientSlotsRef.current, args.client, shortAddr(args.client));
            if (judge) spawnPacket(cSlot, judge, ACCENT, 2600);
            pushFeed(`<b>${shortAddr(args.client)}</b> posted job #${jobId}`);
            continue;
          }

          if (type === "funded") {
            const evaluator = jobEvaluator.get(jobKey);
            if (evaluator) ringSweep(evaluator, PALETTE[themeRef.current].funded);
            pushFeed(`escrow funded on job #${jobId}`);
            continue;
          }

          if (type === "submitted") {
            const args = l.args as { provider?: `0x${string}` };
            if (!args.provider) continue;
            let evaluator = jobEvaluator.get(jobKey);
            if (!evaluator) {
              const job = await publicClient!.readContract({ address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId] });
              evaluator = job.evaluator; jobEvaluator.set(jobKey, evaluator);
            }
            const judge = judgesRef.current[evaluator.toLowerCase()];
            const pSlot = getSlot(providerSlotsRef.current, args.provider, shortAddr(args.provider));
            if (judge) spawnPacket(pSlot, judge, PALETTE[themeRef.current].funded, 2800);
            pushFeed(`<b>${shortAddr(args.provider)}</b> submitted → awaiting <b>${judge ? glyphKey(judge.ansName) : "judge"}</b>`);
            continue;
          }

          if (type === "completed") {
            const job = await publicClient!.readContract({ address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId] });
            const judge = judgesRef.current[job.evaluator.toLowerCase()];
            const color = PALETTE[themeRef.current].win;
            if (judge) {
              judge.flash = performance.now(); judge.flashColor = color; judge.wins++;
              ringSweep(job.evaluator, color);
              const pSlot = getSlot(providerSlotsRef.current, job.provider, shortAddr(job.provider));
              spawnPacket(judge, pSlot, color, 2400);
            }
            setStats((s) => ({ done: s.done + 1, vol: s.vol + Number(job.budget) / 1e6, total: s.total + 1, wins: s.wins + 1 }));
            pushFeed(`<b>${judge ? glyphKey(judge.ansName) : "judge"}</b> approved job #${jobId} — payout released`, "win");
            continue;
          }

          if (type === "rejected") {
            const job = await publicClient!.readContract({ address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId] });
            const judge = judgesRef.current[job.evaluator.toLowerCase()];
            const color = PALETTE[themeRef.current].lose;
            if (judge) {
              judge.flash = performance.now(); judge.flashColor = color; judge.losses++;
              ringSweep(job.evaluator, color);
              if (job.budget > 0n) {
                const cSlot = getSlot(clientSlotsRef.current, job.client, shortAddr(job.client));
                spawnPacket(judge, cSlot, color, 2400);
              }
            }
            setStats((s) => ({ ...s, total: s.total + 1 }));
            pushFeed(`<b>${judge ? glyphKey(judge.ansName) : "judge"}</b> rejected job #${jobId}${job.budget > 0n ? " — refunded" : ""}`, "lose");
          }
        }

        // idle-fade slots that haven't seen activity in a while
        const now = Date.now();
        [...clientSlotsRef.current, ...providerSlotsRef.current].forEach((s) => {
          if (s.addr && now - s.lastActive > SLOT_IDLE_MS) s.addr = null;
        });
      } catch {
        // transient RPC hiccup — next poll retries
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient]);

  const approvalRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : null;
  const busiest = Object.values(judgesRef.current)
    .map((j) => ({ id: glyphKey(j.ansName), total: j.wins + j.losses }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return (
    <div className={`arena-full arena-full-${theme}`}>
      <canvas ref={canvasRef} style={{ width: dims.w, height: dims.h }} />
      <div className="arena-hud">
        <div className="arena-topbar">
          <a href="#/" className="arena-brand">
            <span className="brand-mark">◠</span>arcwork <span className="arena-brand-sub">/ arena — live</span>
          </a>
          <div className="arena-score">
            <div className="arena-stat"><div className="n">{stats.done}</div><div className="l">verdicts</div></div>
            <div className="arena-stat"><div className="n">{stats.vol.toFixed(2)}</div><div className="l">usdc settled</div></div>
            <div className="arena-stat"><div className="n">{approvalRate !== null ? `${approvalRate}%` : "—"}</div><div className="l">approval rate</div></div>
          </div>
        </div>
        <div className="arena-legend">
          <span><svg width="14" height="14"><rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" /></svg> client</span>
          <span><svg width="14" height="12"><polygon points="7,1 13,11 1,11" fill="none" stroke="currentColor" /></svg> provider</span>
          <span><svg width="14" height="14"><polygon points="7,0 13,3.5 13,10.5 7,14 1,10.5 1,3.5" fill="none" stroke={ACCENT} /></svg> judge</span>
        </div>
        <div className="arena-feed">
          {feed.map((row) => (
            <div key={row.id} className={`arena-feed-row ${row.cls}`} dangerouslySetInnerHTML={{ __html: row.html }} />
          ))}
          {feed.length === 0 && <div className="arena-feed-row muted">Watching Arc for job activity…</div>}
        </div>
        {busiest.length > 0 && busiest.some((b) => b.total > 0) && (
          <div className="arena-leaderboard">
            <h4>busiest judges</h4>
            {busiest.filter((b) => b.total > 0).map((b) => (
              <div key={b.id} className="arena-lb-row"><b>{b.id}</b><span>{b.total}</span></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
