import type { Frame, Renderer } from "@caller/hall";
import { createRenderer, fixture } from "@caller/hall";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * The hidden frame route: `#/frame?fixture=<name>&zoom=6` draws exactly one
 * fixture frame and stops. No animation, no clock, no randomness — the golden
 * tests screenshot this canvas and the perf test drives `window.hallBench`
 * from it, so everything about it has to be reproducible.
 */
export function FramePage({ params }: { params: URLSearchParams }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  const name = params.get("fixture") ?? "two-hand-hold";
  const zoom = Number(params.get("zoom") ?? "6");
  const aa = params.get("aa") !== "0";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    document.documentElement.dataset["frameReady"] = "false";
    delete window.hallBench;

    let renderer: Renderer;
    let frame: Frame;
    try {
      const f = fixture(name);
      frame = f.frame;
      renderer = createRenderer(canvas, {
        world: { ...f.world, zoom },
        aa,
        skirts: f.skirts ?? false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    // A hall fixture paints its own floor layer — boards, walls, band, bubble —
    // before the frame is drawn. A dancer fixture has nothing to paint.
    fixture(name).paint?.(renderer);
    renderer.render(frame);
    window.hallBench = (frames: number) => {
      const times: number[] = [];
      for (let i = 0; i < frames; i++) {
        const t0 = performance.now();
        renderer.render({ ...frame, beat: frame.beat + i / 16 });
        times.push(performance.now() - t0);
      }
      // The frame the page was showing before the benchmark ran.
      renderer.render(frame);
      return times;
    };
    document.documentElement.dataset["frameReady"] = "true";

    return () => {
      delete window.hallBench;
      document.documentElement.dataset["frameReady"] = "false";
    };
  }, [name, zoom, aa]);

  if (error !== null) {
    return <pre data-testid="frame-error">{error}</pre>;
  }
  return <canvas ref={canvasRef} data-testid="frame-canvas" />;
}

declare global {
  interface Window {
    /** Render the current fixture `frames` times and return each frame's ms. */
    hallBench?: (frames: number) => number[];
  }
}
