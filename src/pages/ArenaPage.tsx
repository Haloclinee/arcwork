import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { zeroAddress } from "viem";
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

// ── Types ──

type NodeKind = "vault" | "judge" | "client" | "provider";

interface ArenaNode {
  id: string; // address (lowercased) or "vault"
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  lastActive: number;
  pulse: number; // 0..1, decays each frame — drawn as a glow ring
  homeX?: number; // judges/vault gently spring back here instead of free-floating away
  homeY?: number;
  orbitTarget?: string; // id of the node this one gently orbits — client→vault, provider→its judge
}

interface Particle {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  start: number;
  duration: number;
}

const POLL_MS = 6000;
const SCAN_BLOCKS = 3000n; // recent-only — the arena shows "happening now", not history
const MAX_DYNAMIC_NODES = 24;
const NODE_IDLE_MS = 2 * 60_000; // fade out client/provider nodes idle this long

// ── Canvas engine (plain 2D canvas, no libraries) ──

function useArenaEngine() {
  const nodesRef = useRef<Map<string, ArenaNode>>(new Map());
  const particlesRef = useRef<Particle[]>([]);

  function ensureNode(id: string, kind: NodeKind, label: string, w: number, h: number): ArenaNode {
    const key = id.toLowerCase();
    let n = nodesRef.current.get(key);
    if (!n) {
      n = {
        id: key,
        kind,
        label,
        x: kind === "vault" ? w / 2 : Math.random() * w,
        y: kind === "vault" ? h / 2 : Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: kind === "vault" ? 26 : kind === "judge" ? 18 : 10,
        color:
          kind === "vault" ? "oklch(58% 0.20 256)" :
          kind === "judge" ? "oklch(62% 0.13 68)" :
          kind === "provider" ? "oklch(56% 0.13 155)" : "oklch(64% 0.02 255)",
        lastActive: Date.now(),
        pulse: 1,
        orbitTarget: kind === "client" ? "vault" : undefined,
      };
      nodesRef.current.set(key, n);
      // Evict oldest idle dynamic node if over cap
      const dynamic = [...nodesRef.current.values()].filter((x) => x.kind === "client" || x.kind === "provider");
      if (dynamic.length > MAX_DYNAMIC_NODES) {
        const oldest = dynamic.sort((a, b) => a.lastActive - b.lastActive)[0];
        nodesRef.current.delete(oldest.id);
      }
    } else {
      n.lastActive = Date.now();
      n.pulse = 1;
    }
    return n;
  }

  function spawnParticle(from: ArenaNode, to: ArenaNode, color: string) {
    particlesRef.current.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, color, start: Date.now(), duration: 1400 });
  }

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Translucent overlay instead of a hard clear — leaves soft motion trails.
    ctx.fillStyle = "oklch(22% 0.018 260 / 0.30)";
    ctx.fillRect(0, 0, w, h);
    const now = Date.now();

    // drift + boundary bounce + idle fade for dynamic nodes
    for (const [key, n] of [...nodesRef.current.entries()]) {
      if (n.kind !== "vault") {
        if (n.kind === "judge" && n.homeX !== undefined && n.homeY !== undefined) {
          // Judges are landmarks — gentle spring back to their ring position
          // plus light jitter, instead of free-floating away like plankton.
          n.vx += (n.homeX - n.x) * 0.004 + (Math.random() - 0.5) * 0.02;
          n.vy += (n.homeY - n.y) * 0.004 + (Math.random() - 0.5) * 0.02;
          n.vx *= 0.94;
          n.vy *= 0.94;
        } else {
          // Clients and providers loosely orbit the node they actually
          // transact with (vault, or their job's judge) — a gentle pull
          // toward a moving target plus small jitter, not a pure random
          // walk. Falls back to free drift only when the relationship
          // isn't known yet (e.g. a provider before their judge shows up).
          const target = n.orbitTarget ? nodesRef.current.get(n.orbitTarget) : undefined;
          if (target) {
            const dx = target.x - n.x;
            const dy = target.y - n.y;
            const dist = Math.hypot(dx, dy) || 1;
            const orbitRadius = n.radius + target.radius + 46;
            const pull = dist > orbitRadius ? 0.0018 : -0.0009;
            n.vx += dx * pull + (Math.random() - 0.5) * 0.03;
            n.vy += dy * pull + (Math.random() - 0.5) * 0.03;
            n.vx *= 0.96;
            n.vy *= 0.96;
          } else if (Math.random() < 0.02) {
            n.vx += (Math.random() - 0.5) * 0.1;
            n.vy += (Math.random() - 0.5) * 0.1;
            n.vx *= 0.98;
            n.vy *= 0.98;
          }
        }
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < n.radius || n.x > w - n.radius) n.vx *= -1;
        if (n.y < n.radius || n.y > h - n.radius) n.vy *= -1;
        n.x = Math.min(Math.max(n.x, n.radius), w - n.radius);
        n.y = Math.min(Math.max(n.y, n.radius), h - n.radius);
      }
      n.pulse = Math.max(0, n.pulse - 0.012);
      if ((n.kind === "client" || n.kind === "provider") && now - n.lastActive > NODE_IDLE_MS) {
        nodesRef.current.delete(key);
      }
    }

    // particles
    particlesRef.current = particlesRef.current.filter((p) => now - p.start < p.duration);
    for (const p of particlesRef.current) {
      const t = (now - p.start) / p.duration;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = p.x0 + (p.x1 - p.x0) * ease;
      const y = p.y0 + (p.y1 - p.y0) * ease;
      ctx.globalAlpha = 1 - t * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // nodes — radial-gradient fill + glow, pulse ring on recent activity
    for (const n of nodesRef.current.values()) {
      if (n.pulse > 0) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + n.pulse * 14, 0, Math.PI * 2);
        ctx.strokeStyle = n.color;
        ctx.globalAlpha = n.pulse * 0.6;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const grad = ctx.createRadialGradient(
        n.x - n.radius * 0.3, n.y - n.radius * 0.3, 1,
        n.x, n.y, n.radius * 1.4,
      );
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, n.color);
      grad.addColorStop(1, n.color);

      ctx.shadowColor = n.color;
      ctx.shadowBlur = n.kind === "vault" ? 22 : n.kind === "judge" ? 16 : 10;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (n.kind === "vault" || n.kind === "judge") {
        ctx.strokeStyle = "oklch(22% 0.018 260)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.font = n.kind === "vault" || n.kind === "judge" ? "600 11px sans-serif" : "9px sans-serif";
      ctx.fillStyle = "oklch(94% 0.008 255)";
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y + n.radius + 13);
    }
  }

  return { nodesRef, ensureNode, spawnParticle, draw };
}

export function ArenaPage() {
  const publicClient = usePublicClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engine = useArenaEngine();
  const seenRef = useRef<Set<string>>(new Set());
  const [log, setLog] = useState<string[]>(["Watching Arc for job activity…"]);
  const [dims, setDims] = useState({ w: 800, h: 460 });

  function pushLog(line: string) {
    setLog((prev) => [line, ...prev].slice(0, 40));
  }

  // Resize canvas to container width
  useEffect(() => {
    function onResize() {
      const w = wrapRef.current?.clientWidth ?? 800;
      setDims({ w, h: 460 });
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Seed judge + vault nodes once dims are known
  useEffect(() => {
    const { w, h } = dims;
    engine.ensureNode("vault", "vault", "ERC-8183", w, h);
    const vault = engine.nodesRef.current.get("vault")!;
    vault.x = w / 2;
    vault.y = h / 2;
    vault.pulse = 0;

    const ring = Math.min(w, h) * 0.38;
    EVALUATOR_PRESETS.forEach((p, i) => {
      const angle = (i / EVALUATOR_PRESETS.length) * Math.PI * 2 - Math.PI / 2;
      const n = engine.ensureNode(p.address, "judge", p.ansName, w, h);
      n.homeX = w / 2 + Math.cos(angle) * ring;
      n.homeY = h / 2 + Math.sin(angle) * ring;
      n.x = n.homeX;
      n.y = n.homeY;
      n.pulse = 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  // Animation loop
  useEffect(() => {
    let raf: number;
    function frame() {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          if (canvas.width !== dims.w * dpr || canvas.height !== dims.h * dpr) {
            canvas.width = dims.w * dpr;
            canvas.height = dims.h * dpr;
            ctx.scale(dpr, dpr);
          }
          engine.draw(ctx, dims.w, dims.h);
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  // Poll real on-chain events
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

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

        const { w, h } = dims;

        for (const { l, type } of all) {
          const key = `${l.transactionHash}-${l.logIndex}`;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);

          const jobId = (l.args as { jobId?: bigint }).jobId;
          if (jobId === undefined) continue;

          if (type === "created") {
            const args = l.args as { client?: `0x${string}`; provider?: `0x${string}` };
            if (args.client) {
              const c = engine.ensureNode(args.client, "client", shortAddr(args.client), w, h);
              c.pulse = 1;
            }
            if (args.provider && args.provider !== zeroAddress) {
              const p = engine.ensureNode(args.provider, "provider", shortAddr(args.provider), w, h);
              p.pulse = 1;
            }
            pushLog(`Job #${jobId} posted`);
            continue;
          }

          if (type === "funded") {
            const args = l.args as { client?: `0x${string}` };
            if (!args.client) continue;
            const c = engine.ensureNode(args.client, "client", shortAddr(args.client), w, h);
            const vault = engine.nodesRef.current.get("vault")!;
            engine.spawnParticle(c, vault, "oklch(58% 0.20 256)");
            vault.pulse = 1;
            pushLog(`Job #${jobId} funded — escrow locked`);
            continue;
          }

          if (type === "submitted") {
            const args = l.args as { provider?: `0x${string}` };
            if (!args.provider) continue;
            const p = engine.ensureNode(args.provider, "provider", shortAddr(args.provider), w, h);
            // Route to the job's actual evaluator (one extra read, low volume).
            const job = await publicClient!.readContract({
              address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId],
            });
            const judgeNode = engine.nodesRef.current.get(job.evaluator.toLowerCase());
            if (judgeNode) {
              engine.spawnParticle(p, judgeNode, "oklch(62% 0.13 68)");
              p.orbitTarget = judgeNode.id;
            }
            pushLog(`Job #${jobId} submitted for review`);
            continue;
          }

          if (type === "completed") {
            const vault = engine.nodesRef.current.get("vault")!;
            const job = await publicClient!.readContract({
              address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId],
            });
            const providerNode = engine.ensureNode(job.provider, "provider", shortAddr(job.provider), w, h);
            engine.spawnParticle(vault, providerNode, "oklch(56% 0.13 155)");
            vault.pulse = 1;
            const judgeNode = engine.nodesRef.current.get(job.evaluator.toLowerCase());
            if (judgeNode) {
              judgeNode.pulse = 1;
              providerNode.orbitTarget = judgeNode.id;
            }
            pushLog(`Job #${jobId} completed — payment released to provider`);
            continue;
          }

          if (type === "rejected") {
            const vault = engine.nodesRef.current.get("vault")!;
            const job = await publicClient!.readContract({
              address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId],
            });
            const clientNode = engine.ensureNode(job.client, "client", shortAddr(job.client), w, h);
            if (job.budget > 0n) {
              engine.spawnParticle(vault, clientNode, "oklch(58% 0.15 25)");
              vault.pulse = 1;
            }
            const judgeNode = engine.nodesRef.current.get(job.evaluator.toLowerCase());
            if (judgeNode) judgeNode.pulse = 1;
            pushLog(`Job #${jobId} rejected${job.budget > 0n ? " — refunded to client" : ""}`);
          }
        }
      } catch {
        // transient RPC hiccup — next poll will retry
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, dims.w, dims.h]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live agent arena</h1>
          <p className="muted">
            Every node here is a real wallet; every flash is a real on-chain event, polled straight
            from the canonical ERC-8183 contract. Gold nodes are arcwork's judges. Green flows are
            money moving to a provider, red is a refund back to the client. Nothing here is
            simulated — if it's quiet, arcwork is quiet.
          </p>
        </div>
      </div>
      <div className="arena-layout">
        <div className="arena-canvas-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} style={{ width: dims.w, height: dims.h }} />
        </div>
        <div className="arena-log">
          {log.map((line, i) => (
            <div key={i} className="arena-log-line">{line}</div>
          ))}
        </div>
      </div>
    </>
  );
}
