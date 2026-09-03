import { useEffect, useRef, useState } from "react";
import { createHandDrawer } from "../lib/handTracking";
import {
  clearCanvas,
  fitCanvas,
  renderHoldRing,
  renderSkeleton,
  renderTrail,
} from "../lib/neonRender";
import { readStrokePoints, writeStrokePoints } from "../lib/strokes";
import { useStrokes } from "../hooks/useStrokes";

const FLUSH_INTERVAL_MS = 150;

export default function DrawingCanvas({ code, round, isDrawer }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [initError, setInitError] = useState("");
  const remotePoints = useStrokes(isDrawer ? null : code, round);
  const remotePointsRef = useRef([]);
  remotePointsRef.current = remotePoints;

  useEffect(() => {
    const canvas = canvasRef.current;
    let raf = 0;
    let stopped = false;
    let handDrawer = null;

    const localStrokes = [];
    let currentStroke = null;
    let seq = 0;
    // Offsets so a drawer who refreshes mid-round resumes without its stroke
    // ids / sequence numbers colliding with points it already streamed.
    let seqBase = 0;
    let strokeIndexOffset = 0;
    let buffer = [];

    const flush = async () => {
      if (!isDrawer || buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      try {
        await writeStrokePoints(code, batch);
      } catch (err) {
        console.error("stroke write failed", err);
        buffer = batch.concat(buffer);
      }
    };
    const flushTimer = isDrawer ? setInterval(flush, FLUSH_INTERVAL_MS) : null;

    const start = async () => {
      if (isDrawer) {
        try {
          const existing = await readStrokePoints(code, round);
          const grouped = new Map();
          for (const point of existing) {
            if (!grouped.has(point.s)) grouped.set(point.s, []);
            grouped.get(point.s).push({ x: point.x, y: point.y });
            if (point.seq > seqBase) seqBase = point.seq;
            if (point.s > strokeIndexOffset) strokeIndexOffset = point.s;
          }
          for (const points of grouped.values()) {
            localStrokes.push({ s: `seed-${localStrokes.length}`, points });
          }
          seq = seqBase;
        } catch (err) {
          console.error("stroke seed failed", err);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
        });
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        handDrawer = await createHandDrawer(videoRef.current);
      }

      const loop = (now) => {
        if (stopped) return;
        const { ctx, w, h } = fitCanvas(canvas);
        clearCanvas(ctx, w, h);

        if (isDrawer && handDrawer) {
          const { handsPx, draw } = handDrawer.detect(now, w, h);

          if (draw && draw.active) {
            const strokeId = draw.strokeIndex + strokeIndexOffset;
            if (!currentStroke || currentStroke.s !== strokeId) {
              currentStroke = { s: strokeId, points: [] };
              localStrokes.push(currentStroke);
            }
            currentStroke.points.push(draw.point);
            seq += 1;
            buffer.push({
              round,
              s: strokeId,
              seq,
              x: draw.point.x,
              y: draw.point.y,
              t: Date.now(),
            });
          } else {
            currentStroke = null;
          }

          renderTrail(ctx, localStrokes.map((stroke) => stroke.points), w, h, now);
          renderSkeleton(ctx, handsPx);
          if (draw && draw.holdPoint) {
            renderHoldRing(ctx, draw.holdPoint, draw.holdProgress, w, h);
          }
        } else {
          const grouped = new Map();
          for (const point of remotePointsRef.current) {
            if (!grouped.has(point.s)) grouped.set(point.s, []);
            grouped.get(point.s).push(point);
          }
          renderTrail(ctx, [...grouped.values()], w, h, now);
        }

        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    setInitError("");
    start().catch((err) => {
      console.error("canvas init failed", err);
      if (isDrawer) {
        setInitError(
          err?.name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access and refresh."
            : "Could not start the camera / hand tracker. Check your connection and refresh."
        );
      }
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (flushTimer) clearInterval(flushTimer);
      flush();
      if (handDrawer) handDrawer.close();
      const video = videoRef.current;
      if (video && video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };
  }, [code, round, isDrawer]);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className="draw-canvas" />
      <video ref={videoRef} className="webcam-mini" muted playsInline hidden={!isDrawer} />
      {initError && <p className="canvas-error">{initError}</p>}
      {isDrawer && (
        <p className="canvas-hint">
          Left hand: hold your index finger out for 1s to start drawing. Pinch
          thumb + index to pause.
        </p>
      )}
    </div>
  );
}
