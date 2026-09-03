import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const PALM_LANDMARKS = [0, 5, 9, 13, 17];

const INDEX_DRAW_ENTER_RATIO = 1.2;
const INDEX_DRAW_EXIT_RATIO = 1.0;
const DRAW_HOLD_MS = 1000;
const DRAW_RESUME_GRACE_MS = 600;
const PINCH_ENTER_PX = 42;
const PINCH_EXIT_PX = 58;
const TIP_SMOOTHING_ALPHA = 0.45;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function palmCenter(landmarks) {
  let x = 0;
  let y = 0;
  for (const i of PALM_LANDMARKS) {
    x += landmarks[i].x;
    y += landmarks[i].y;
  }
  return { x: x / PALM_LANDMARKS.length, y: y / PALM_LANDMARKS.length };
}

function indexExtendedRatio(landmarks) {
  const palm = palmCenter(landmarks);
  return distance(landmarks[8], palm) / distance(landmarks[5], palm);
}

// MediaPipe labels handedness for a mirrored image; we feed the raw frame,
// so its "Left" is the user's right hand and vice versa. Swap once here.
function resolveHandedness(raw) {
  if (raw === "Left") return "Right";
  if (raw === "Right") return "Left";
  return "unknown";
}

function mapVideoToCanvas(nx, ny, videoW, videoH, canvasW, canvasH) {
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const dispW = videoW * scale;
  const dispH = videoH * scale;
  const offsetX = (canvasW - dispW) / 2;
  const offsetY = (canvasH - dispH) / 2;
  const screenX = offsetX + nx * dispW;
  const screenY = offsetY + ny * dispH;
  return { x: canvasW - screenX, y: screenY };
}

export async function createHandDrawer(video) {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });

  let lastVideoTime = -1;
  let lastHands = [];

  const state = {
    leftExtended: false,
    leftPinching: false,
    holdStartMs: null,
    confirmed: false,
    lastDrawEndMs: null,
    strokeIndex: 0,
    inStroke: false,
    smooth: null,
  };

  function smoothTip(raw) {
    if (!state.smooth) {
      state.smooth = { x: raw.x, y: raw.y };
    } else {
      state.smooth.x += TIP_SMOOTHING_ALPHA * (raw.x - state.smooth.x);
      state.smooth.y += TIP_SMOOTHING_ALPHA * (raw.y - state.smooth.y);
    }
    return { x: state.smooth.x, y: state.smooth.y };
  }

  function processLeftHand(hand, videoW, videoH, canvasW, canvasH, nowMs) {
    if (!hand) {
      if (state.confirmed) state.lastDrawEndMs = nowMs;
      state.leftExtended = false;
      state.leftPinching = false;
      state.holdStartMs = null;
      state.confirmed = false;
      state.inStroke = false;
      state.smooth = null;
      return null;
    }

    const l = hand;
    const ratio = indexExtendedRatio(l);
    const rawExtended =
      ratio >= (state.leftExtended ? INDEX_DRAW_EXIT_RATIO : INDEX_DRAW_ENTER_RATIO);
    state.leftExtended = rawExtended;

    const dxPx = (l[4].x - l[8].x) * videoW;
    const dyPx = (l[4].y - l[8].y) * videoH;
    const pinching =
      Math.hypot(dxPx, dyPx) <=
      (state.leftPinching ? PINCH_EXIT_PX : PINCH_ENTER_PX);
    state.leftPinching = pinching;

    const eligible = rawExtended && !pinching;
    let active = false;
    let holdProgress = 0;
    let holdPoint = null;

    if (eligible) {
      if (state.holdStartMs === null) {
        state.holdStartMs = nowMs;
        const sincePause =
          state.lastDrawEndMs === null ? Infinity : nowMs - state.lastDrawEndMs;
        if (sincePause <= DRAW_RESUME_GRACE_MS) state.confirmed = true;
      }
      if (state.confirmed) {
        active = true;
      } else {
        const heldMs = nowMs - state.holdStartMs;
        if (heldMs >= DRAW_HOLD_MS) {
          state.confirmed = true;
          active = true;
        } else {
          holdProgress = heldMs / DRAW_HOLD_MS;
          const tip = mapVideoToCanvas(
            l[8].x,
            l[8].y,
            videoW,
            videoH,
            canvasW,
            canvasH
          );
          holdPoint = { x: tip.x / canvasW, y: tip.y / canvasH };
        }
      }
    } else {
      if (state.confirmed) state.lastDrawEndMs = nowMs;
      state.holdStartMs = null;
      state.confirmed = false;
    }

    if (active) {
      if (!state.inStroke) {
        state.strokeIndex += 1;
        state.inStroke = true;
      }
      const raw = mapVideoToCanvas(
        l[8].x,
        l[8].y,
        videoW,
        videoH,
        canvasW,
        canvasH
      );
      const tip = smoothTip(raw);
      return {
        active: true,
        strokeIndex: state.strokeIndex,
        point: { x: tip.x / canvasW, y: tip.y / canvasH },
      };
    }

    state.inStroke = false;
    state.smooth = null;
    return { active: false, strokeIndex: state.strokeIndex, holdProgress, holdPoint };
  }

  function detect(nowMs, canvasW, canvasH) {
    if (!video || video.readyState < 2 || !video.videoWidth) {
      return { handsPx: [], draw: null };
    }
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = landmarker.detectForVideo(video, nowMs);
      lastHands = (result.landmarks || []).map((landmarks, i) => ({
        landmarks,
        handedness: resolveHandedness(
          result.handednesses?.[i]?.[0]?.categoryName
        ),
      }));
    }

    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const handsPx = lastHands.map((h) =>
      h.landmarks.map((p) =>
        mapVideoToCanvas(p.x, p.y, videoW, videoH, canvasW, canvasH)
      )
    );
    const left = lastHands.find((h) => h.handedness === "Left") || null;
    const draw = processLeftHand(
      left?.landmarks || null,
      videoW,
      videoH,
      canvasW,
      canvasH,
      nowMs
    );
    return { handsPx, draw };
  }

  function close() {
    try {
      landmarker.close();
    } catch {
      /* ignore */
    }
  }

  return { detect, close };
}
