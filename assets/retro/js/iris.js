/* SG1 IRIS ADDON ASSET — managed by install.sh / restore.sh */
const TAU = Math.PI * 2;
const BLADE_COUNT = 22;
const IRIS_OPEN_DURATION_MS = 3922;
const IRIS_CLOSE_DURATION_MS = 5238;
const IRIS_MIN_PARTIAL_DURATION_MS = 180;
const IRIS_AUDIO_FILES = {
  open: 'audio_clips/Iris/Iris Open.m4a',
  close: 'audio_clips/Iris/Iris Close.mp3',
  impact: 'audio_clips/Iris/Iris Impact.m4a',
};
const IRIS_IMPACT_DURATION_MS = 1164;
const IRIS_AUDIO_LOCK_PAD_MS = 250;
const STATUS_POLL_INTERVAL_MS = 1000;
const STATUS_RETRY_INTERVAL_MS = 3500;
const AUTO_CLOSED_STORAGE_KEY = 'sg1IrisAutoClosed';
const BLACK_HOLE_GATE_NAME = 'P3W-451';
// The dedicated clip lasts 7.871565 seconds. Starting it at 35 seconds lets
// it finish around 42.87 seconds and leaves about 2.13 seconds before closure.
const BLACK_HOLE_AUDIO_DELAY_MS = 35000;
const BLACK_HOLE_CLOSE_DELAY_MS = 45000;
const BLACK_HOLE_WARNING_FILE =
  'audio_clips/Iris/black_hole/outgoing wormhole.wav';
const STATUS_ENDPOINTS = [
  '/stargate/get/dialing_status',
  '/get/dialing_status',
];

const COLORS = {
  base: '#737e84',
  highlight: '#d7e0e4',
  shadow: '#293136',
  seam: '#10171b',
  frame: '#171d21',
  frameLight: '#6e777c',
};

let canvas;
let progress = 0;
let targetClosed = false;
let animationFrame = null;
let controlButton = null;
let autoClosed = localStorage.getItem(AUTO_CLOSED_STORAGE_KEY) === '1';
let manualOpenDuringIncoming = false;
let statusPolling = false;
let statusEndpointIndex = 0;
let statusTimer = null;
let gateConnectionActive = false;
let blackHoleConnectionId = null;
let blackHoleClosureIssued = false;
let blackHoleAudioTimer = null;
let blackHoleCloseTimer = null;
let blackHoleWarningAudio = null;
let blackHoleRandomAudioBlocked = false;
let irisRandomAudioBlocked = false;
let irisRandomAudioTimer = null;
let irisMotionAudio = null;
let irisImpactAudio = null;
let lastImpactConnectionId = null;
const activeRandomAudioMedia = new Set();
const cyclicLayers = [];

function polar(radius, angle) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getBladeGeometry(outer, bladeOuter, step, index, value) {
  const angle = index * step - Math.PI / 2;
  // Wszystkie punkty łopatki w pozycji otwartej pozostają za wewnętrzną
  // krawędzią istniejącego pierścienia Stargate.
  const ringInner = outer * 0.925;
  const twist = mix(step * 0.15, step * 2.9, value);
  const tipRadius = mix(ringInner + outer * 0.025, -outer * 0.095, value);
  const baseA = polar(bladeOuter * 1.035, angle - step * 0.6);
  const baseB = polar(bladeOuter * 1.035, angle + step * 0.62);
  const tip = polar(tipRadius, angle + twist);
  const leadingOuter = polar(
    mix(bladeOuter * 0.99, outer * 0.68, value),
    angle - step * 0.34 + twist * 0.14,
  );
  const leadingInner = polar(
    mix(ringInner + outer * 0.012, outer * 0.23, value),
    angle + twist - step * 0.46,
  );
  const trailingInner = polar(
    mix(ringInner + outer * 0.018, outer * 0.31, value),
    angle + twist + step * 1.42,
  );
  const trailingOuter = polar(
    mix(bladeOuter * 0.985, outer * 0.72, value),
    angle + step * 0.55 + twist * 0.18,
  );

  return {
    angle,
    baseA,
    baseB,
    leadingInner,
    leadingOuter,
    tip,
    trailingInner,
    trailingOuter,
    twist,
  };
}

function appendBladePath(ctx, blade) {
  ctx.moveTo(blade.baseA.x, blade.baseA.y);
  ctx.bezierCurveTo(
    blade.leadingOuter.x,
    blade.leadingOuter.y,
    blade.leadingInner.x,
    blade.leadingInner.y,
    blade.tip.x,
    blade.tip.y,
  );
  ctx.bezierCurveTo(
    blade.trailingInner.x,
    blade.trailingInner.y,
    blade.trailingOuter.x,
    blade.trailingOuter.y,
    blade.baseB.x,
    blade.baseB.y,
  );
  ctx.closePath();
}

function traceBlade(ctx, blade) {
  ctx.beginPath();
  appendBladePath(ctx, blade);
}

function drawBlade(
  ctx,
  outer,
  bladeOuter,
  step,
  index,
  value,
  { drawSeam = true, drawShadow = true } = {},
) {
  const blade = getBladeGeometry(outer, bladeOuter, step, index, value);
  traceBlade(ctx, blade);

  const lightAngle = blade.angle - 0.75;
  const gradient = ctx.createLinearGradient(
    Math.cos(lightAngle) * bladeOuter,
    Math.sin(lightAngle) * bladeOuter,
    -Math.cos(lightAngle) * bladeOuter,
    -Math.sin(lightAngle) * bladeOuter,
  );
  gradient.addColorStop(0, COLORS.shadow);
  // The same stops are used for every blade so each one is an exact rotated
  // copy, without artificial light/color differences around the circle.
  gradient.addColorStop(0.34, COLORS.base);
  gradient.addColorStop(0.62, COLORS.highlight);
  gradient.addColorStop(1, COLORS.base);

  ctx.shadowColor = drawShadow ? 'rgba(0, 0, 0, 0.68)' : 'transparent';
  ctx.shadowBlur = drawShadow ? outer * 0.018 : 0;
  ctx.shadowOffsetX = drawShadow ? outer * 0.009 : 0;
  ctx.shadowOffsetY = drawShadow ? outer * 0.014 : 0;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (drawSeam) {
    ctx.lineWidth = Math.max(0.8, outer * 0.0045);
    ctx.strokeStyle = COLORS.seam;
    ctx.stroke();
  }

  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.11;
  ctx.strokeStyle = '#f2f5f4';
  ctx.lineWidth = 0.55;
  for (let scratch = 0; scratch < 6; scratch += 1) {
    const radius = bladeOuter * (0.46 + ((scratch * 17) % 37) / 100);
    const offset = ((scratch * 7) % 19) / 19 - 0.5;
    const scratchAngle = blade.angle + blade.twist * 0.34 + offset * step;
    const start = polar(radius, scratchAngle);
    const end = polar(radius + outer * 0.17, scratchAngle + step * 0.16);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

function clipToBlade(ctx, outer, bladeOuter, step, index, value) {
  const blade = getBladeGeometry(outer, bladeOuter, step, index, value);
  traceBlade(ctx, blade);
  ctx.clip();
}

function prepareCyclicLayer(slot, layerSize, layerScale) {
  let layer = cyclicLayers[slot];
  if (!layer) {
    layer = document.createElement('canvas');
    cyclicLayers[slot] = layer;
  }
  if (layer.width !== layerSize || layer.height !== layerSize) {
    layer.width = layerSize;
    layer.height = layerSize;
  }

  const layerCtx = layer.getContext('2d');
  if (!layerCtx) return null;
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.globalCompositeOperation = 'source-over';
  layerCtx.clearRect(0, 0, layerSize, layerSize);
  layerCtx.setTransform(
    layerScale,
    0,
    0,
    layerScale,
    layerSize / 2,
    layerSize / 2,
  );
  return { canvas: layer, ctx: layerCtx };
}

function drawCyclicBladePair(
  ctx,
  outer,
  bladeOuter,
  step,
  value,
) {
  const bladeOne = getBladeGeometry(
    outer,
    bladeOuter,
    step,
    0,
    value,
  );

  // Blade 22 is the end of Canvas' linear painter order, while a real iris
  // wraps back to blade 1. Render the pair on reusable transparent layers so
  // the complete blade 22 (metal, seam, scratches and shadow) can pass under
  // blade 1 exactly like every other neighboring pair.
  const layerScale = 2;
  const layerExtent = Math.ceil(outer * 2.1);
  const layerSize = layerExtent * 2 * layerScale;
  const blade22Layer = prepareCyclicLayer(0, layerSize, layerScale);
  const blade22Mask = prepareCyclicLayer(1, layerSize, layerScale);
  const blade1Layer = prepareCyclicLayer(2, layerSize, layerScale);
  if (!blade22Layer || !blade22Mask || !blade1Layer) return;

  drawBlade(
    blade22Layer.ctx,
    outer,
    bladeOuter,
    step,
    BLADE_COUNT - 1,
    value,
  );

  // Preserve the original alpha footprint of blade 22, including its shadow.
  blade22Mask.ctx.setTransform(1, 0, 0, 1, 0, 0);
  blade22Mask.ctx.drawImage(blade22Layer.canvas, 0, 0);

  // Remove every part of blade 22 located below the solid metal of blade 1.
  blade22Layer.ctx.globalCompositeOperation = 'destination-out';
  traceBlade(blade22Layer.ctx, bladeOne);
  blade22Layer.ctx.fillStyle = '#000';
  blade22Layer.ctx.fill();
  blade22Layer.ctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(
    blade22Layer.canvas,
    -layerExtent,
    -layerExtent,
    layerExtent * 2,
    layerExtent * 2,
  );

  // Repaint blade 1 only inside blade 22's complete former footprint. Applying
  // destination-in once to the finished blade avoids masking its individual
  // fill, stroke and scratch operations separately.
  drawBlade(
    blade1Layer.ctx,
    outer,
    bladeOuter,
    step,
    0,
    value,
    { drawShadow: false },
  );
  blade1Layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  blade1Layer.ctx.globalCompositeOperation = 'destination-in';
  blade1Layer.ctx.drawImage(blade22Mask.canvas, 0, 0);
  blade1Layer.ctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(
    blade1Layer.canvas,
    -layerExtent,
    -layerExtent,
    layerExtent * 2,
    layerExtent * 2,
  );
}

function drawPlume(ctx, outer, amount) {
  if (amount <= 0.001) return;

  const step = TAU / BLADE_COUNT;
  for (let index = 0; index < BLADE_COUNT; index += 1) {
    const angle = index * step - Math.PI / 2 + step * 2.15;
    const length = outer * 0.225 * amount;
    const baseRadius = outer * 0.004 * amount;
    const tip = polar(length, angle + step * 1.9);
    const baseLeft = polar(baseRadius, angle - step * 0.38);
    const baseRight = polar(baseRadius, angle + step * 0.48);
    const leadingA = polar(outer * 0.078 * amount, angle + step * 0.04);
    const leadingB = polar(length * 0.76, angle + step * 1.22);
    const trailingB = polar(length * 0.69, angle + step * 2.26);
    const trailingA = polar(outer * 0.072 * amount, angle + step * 0.82);

    ctx.beginPath();
    ctx.moveTo(baseLeft.x, baseLeft.y);
    ctx.bezierCurveTo(
      leadingA.x,
      leadingA.y,
      leadingB.x,
      leadingB.y,
      tip.x,
      tip.y,
    );
    ctx.bezierCurveTo(
      trailingB.x,
      trailingB.y,
      trailingA.x,
      trailingA.y,
      baseRight.x,
      baseRight.y,
    );
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, tip.x, tip.y);
    gradient.addColorStop(0, COLORS.shadow);
    gradient.addColorStop(0.28, COLORS.base);
    gradient.addColorStop(0.72, COLORS.highlight);
    gradient.addColorStop(1, COLORS.base);
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
    ctx.shadowBlur = outer * 0.018;
    ctx.shadowOffsetX = outer * 0.007;
    ctx.shadowOffsetY = outer * 0.01;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = COLORS.seam;
    ctx.lineWidth = Math.max(0.75, outer * 0.0038);
    ctx.stroke();
  }

  const closureRadius = outer * 0.017 * amount;
  const closure = ctx.createRadialGradient(
    -closureRadius * 0.38,
    -closureRadius * 0.42,
    0,
    0,
    0,
    closureRadius,
  );
  closure.addColorStop(0, COLORS.highlight);
  closure.addColorStop(0.55, COLORS.base);
  closure.addColorStop(1, COLORS.shadow);
  ctx.beginPath();
  ctx.arc(0, 0, closureRadius, 0, TAU);
  ctx.fillStyle = closure;
  ctx.fill();
}

function drawMechanism(ctx, outer, bladeOuter, step) {
  const railRadius = bladeOuter * 0.985;
  ctx.beginPath();
  ctx.arc(0, 0, railRadius, 0, TAU);
  ctx.strokeStyle = COLORS.frame;
  ctx.lineWidth = outer * 0.034;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, railRadius, 0, TAU);
  ctx.strokeStyle = COLORS.frameLight;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = outer * 0.007;
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let index = 0; index < BLADE_COUNT; index += 1) {
    const angle = index * step - Math.PI / 2;
    const pivot = polar(railRadius, angle);
    const linkEnd = polar(bladeOuter * 0.96, angle + step * 0.24);
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(linkEnd.x, linkEnd.y);
    ctx.strokeStyle = COLORS.frameLight;
    ctx.lineWidth = outer * 0.006;
    ctx.stroke();

    const fill = ctx.createRadialGradient(
      pivot.x - outer * 0.004,
      pivot.y - outer * 0.004,
      0,
      pivot.x,
      pivot.y,
      outer * 0.014,
    );
    fill.addColorStop(0, COLORS.highlight);
    fill.addColorStop(0.42, COLORS.frameLight);
    fill.addColorStop(1, COLORS.frame);
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, outer * 0.013, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function draw() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const size = Math.min(rect.width, rect.height);
  const outer = size * 0.385;
  const bladeOuter = outer * 0.95;
  const apertureRadius = size * 0.348;
  const step = TAU / BLADE_COUNT;
  const plumeProgress = Math.max(0, Math.min(1, (progress - 0.67) / 0.33));

  ctx.save();
  ctx.translate(rect.width / 2, rect.height / 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, apertureRadius, 0, TAU);
  ctx.clip();

  for (let index = 0; index < BLADE_COUNT - 1; index += 1) {
    drawBlade(ctx, outer, bladeOuter, step, index, progress);
  }

  drawCyclicBladePair(ctx, outer, bladeOuter, step, progress);

  drawPlume(ctx, outer, easeInOutCubic(plumeProgress));
  drawMechanism(ctx, outer, bladeOuter, step);
  ctx.restore();
  ctx.restore();
}

function updateControlButton() {
  if (!controlButton) return;
  const label = targetClosed ? 'OPEN IRIS' : 'CLOSE IRIS';
  controlButton.textContent = label;
  controlButton.title = `${label} (Ctrl+I)`;
  controlButton.setAttribute('aria-label', controlButton.title);
  controlButton.setAttribute('aria-pressed', String(targetClosed));
  controlButton.classList.toggle('iris-closed', targetClosed);
}

function installControlButton() {
  const menu = document.querySelector('.navigation-menu');
  if (!menu) return false;

  controlButton = menu.querySelector('.a-iris-toggle');
  if (!controlButton) {
    controlButton = document.createElement('a');
    controlButton.href = '#';
    controlButton.className = 'a-iris-toggle';
    controlButton.addEventListener('click', event => {
      event.preventDefault();
      toggle();
    });

    const admin = menu.querySelector('.dropdown');
    if (admin) {
      admin.after(controlButton);
    } else {
      menu.append(controlButton);
    }
  }

  updateControlButton();
  return true;
}

function setClosed(closed) {
  targetClosed = Boolean(closed);
  updateControlButton();
  const start = progress;
  const end = targetClosed ? 1 : 0;
  const distance = Math.abs(end - start);
  if (distance < 0.001) {
    progress = end;
    draw();
    document.dispatchEvent(
      new CustomEvent('iris:state', {
        detail: { closed: targetClosed },
      }),
    );
    return;
  }

  playIrisMotionAudio(targetClosed);

  const startedAt = performance.now();
  const fullDuration = targetClosed
    ? IRIS_CLOSE_DURATION_MS
    : IRIS_OPEN_DURATION_MS;
  const totalDuration = Math.max(
    IRIS_MIN_PARTIAL_DURATION_MS,
    fullDuration * distance,
  );
  const pauseAt = 2 / 3;
  const pauseOnClosing = targetClosed && start < pauseAt;
  const pauseOnOpening = !targetClosed && start > pauseAt;
  const pauseDuringTransition = pauseOnClosing || pauseOnOpening;
  const pauseDuration = pauseDuringTransition
    ? Math.min(1000, totalDuration * 0.22)
    : 0;
  const duration = Math.max(1, totalDuration - pauseDuration);
  const firstStageDistance = pauseOnClosing
    ? pauseAt - start
    : pauseOnOpening
      ? start - pauseAt
      : 0;
  const firstStageDuration = pauseDuringTransition
    ? duration * (firstStageDistance / distance)
    : 0;
  const finalStageDuration = pauseDuringTransition
    ? duration - firstStageDuration
    : 0;

  if (animationFrame !== null) cancelAnimationFrame(animationFrame);

  function animate(now) {
    const elapsedMs = now - startedAt;
    let finished = false;

    if (pauseDuringTransition && elapsedMs < firstStageDuration) {
      const stageProgress = elapsedMs / firstStageDuration;
      progress = mix(start, pauseAt, easeInOutCubic(stageProgress));
    } else if (
      pauseDuringTransition &&
      elapsedMs < firstStageDuration + pauseDuration
    ) {
      progress = pauseAt;
    } else if (pauseDuringTransition) {
      const stageProgress = Math.min(
        1,
        (elapsedMs - firstStageDuration - pauseDuration) /
          Math.max(1, finalStageDuration),
      );
      progress = mix(pauseAt, end, easeInOutCubic(stageProgress));
      finished = stageProgress >= 1;
    } else {
      const stageProgress = Math.min(1, elapsedMs / duration);
      progress = mix(start, end, easeInOutCubic(stageProgress));
      finished = stageProgress >= 1;
    }

    draw();
    if (!finished) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      animationFrame = null;
      document.dispatchEvent(
        new CustomEvent('iris:state', {
          detail: { closed: targetClosed },
        }),
      );
    }
  }

  animationFrame = requestAnimationFrame(animate);
}

function toggle() {
  autoClosed = false;
  localStorage.removeItem(AUTO_CLOSED_STORAGE_KEY);
  if (targetClosed && document.documentElement.classList.contains('iris-incoming')) {
    manualOpenDuringIncoming = true;
  } else {
    manualOpenDuringIncoming = false;
  }
  setClosed(!targetClosed);
}

function isRandomAudioClip(media) {
  const source = String(media.currentSrc || media.src || '');
  let path = source;
  try {
    path = decodeURIComponent(new URL(source, window.location.href).pathname);
  } catch (error) {
    // A malformed media URL cannot match SG1's known audio_clips tree.
  }

  const normalized = path.toLowerCase();
  const randomClip = normalized.includes('/audio_clips/');
  const irisManagedClip = normalized.includes('/audio_clips/iris/');
  return randomClip && !irisManagedClip;
}

function isRandomAudioBlocked() {
  return blackHoleRandomAudioBlocked || irisRandomAudioBlocked;
}

function pauseActiveRandomAudio() {
  activeRandomAudioMedia.forEach(media => {
    try {
      media.pause();
      media.currentTime = 0;
    } catch (error) {
      console.debug('[sg1-iris] Random audio pause failed', error);
    }
  });
  activeRandomAudioMedia.clear();
}

function updateRandomAudioBlockState() {
  const blocked = isRandomAudioBlocked();
  document.documentElement.classList.toggle(
    'iris-random-audio-blocked',
    blocked,
  );
  if (blocked) pauseActiveRandomAudio();
  document.dispatchEvent(
    new CustomEvent('iris:random-audio-lock', {
      detail: {blocked},
    }),
  );
}

function setBlackHoleRandomAudioBlocked(blocked) {
  blackHoleRandomAudioBlocked = Boolean(blocked);
  updateRandomAudioBlockState();
}

function setIrisRandomAudioBlockedFor(durationMs) {
  clearTimeout(irisRandomAudioTimer);
  irisRandomAudioBlocked = true;
  updateRandomAudioBlockState();
  irisRandomAudioTimer = setTimeout(() => {
    irisRandomAudioTimer = null;
    irisRandomAudioBlocked = false;
    updateRandomAudioBlockState();
  }, Math.max(0, durationMs));
}

function installRandomAudioGuard() {
  const mediaPrototype = window.HTMLMediaElement?.prototype;
  if (!mediaPrototype || window.__sg1IrisRandomAudioGuardInstalled) return;

  const nativePlay = mediaPrototype.play;
  mediaPrototype.play = function guardedIrisAudioPlay(...args) {
    const randomClip = isRandomAudioClip(this);
    if (isRandomAudioBlocked() && randomClip) {
      try {
        this.pause();
        this.currentTime = 0;
      } catch (error) {
        console.debug('[sg1-iris] Random audio pause failed', error);
      }
      return Promise.resolve();
    }
    const result = nativePlay.apply(this, args);
    if (randomClip) {
      activeRandomAudioMedia.add(this);
      const remove = () => activeRandomAudioMedia.delete(this);
      this.addEventListener('pause', remove, {once: true});
      this.addEventListener('ended', remove, {once: true});
    }
    return result;
  };
  window.__sg1IrisRandomAudioGuardInstalled = true;
}

function stopBlackHoleWarning() {
  if (!blackHoleWarningAudio) return;
  blackHoleWarningAudio.pause();
  blackHoleWarningAudio.currentTime = 0;
  blackHoleWarningAudio = null;
}

function finishBlackHoleSequence() {
  clearTimeout(blackHoleAudioTimer);
  clearTimeout(blackHoleCloseTimer);
  clearTimeout(irisRandomAudioTimer);
  blackHoleAudioTimer = null;
  blackHoleCloseTimer = null;
  irisRandomAudioTimer = null;
  irisRandomAudioBlocked = false;
  stopBlackHoleWarning();
  setBlackHoleRandomAudioBlocked(false);
}

function clearBlackHoleSequence() {
  finishBlackHoleSequence();
  blackHoleConnectionId = null;
  blackHoleClosureIssued = false;
}

function getIrisSoundBase() {
  return window.location.pathname.startsWith('/fan113/')
    ? '/fan113/soundfx/milkyway/'
    : '/soundfx/milkyway/';
}

function playAudioFile(file, existingAudio = null) {
  if (existingAudio) {
    existingAudio.pause();
    existingAudio.currentTime = 0;
  }

  const audio = new Audio(getIrisSoundBase() + file);
  audio.preload = 'auto';
  audio.volume = 1;
  audio.play().catch(error => {
    console.debug('[sg1-iris] Iris audio failed', error);
  });
  return audio;
}

function playIrisMotionAudio(closing) {
  const duration = closing ? IRIS_CLOSE_DURATION_MS : IRIS_OPEN_DURATION_MS;
  setIrisRandomAudioBlockedFor(duration + IRIS_AUDIO_LOCK_PAD_MS);
  irisMotionAudio = playAudioFile(
    closing ? IRIS_AUDIO_FILES.close : IRIS_AUDIO_FILES.open,
    irisMotionAudio,
  );
}

function getImpactConnectionId(status) {
  return String(
    status.wormhole_open_time
    || status.connected_planet
    || status.wormhole_active
    || status.incoming_planet
    || 'active',
  );
}

function playIrisImpact(status) {
  if (!targetClosed) return;
  const connectionId = getImpactConnectionId(status);
  if (lastImpactConnectionId === connectionId) return;
  lastImpactConnectionId = connectionId;
  setIrisRandomAudioBlockedFor(IRIS_IMPACT_DURATION_MS + IRIS_AUDIO_LOCK_PAD_MS);
  irisImpactAudio = playAudioFile(IRIS_AUDIO_FILES.impact, irisImpactAudio);
}

function prepareBlackHoleWarning() {
  if (blackHoleWarningAudio) return blackHoleWarningAudio;

  const audio = new Audio(getIrisSoundBase() + BLACK_HOLE_WARNING_FILE);
  audio.preload = 'auto';
  audio.volume = 1;
  blackHoleWarningAudio = audio;
  audio.addEventListener(
    'ended',
    () => {
      if (blackHoleWarningAudio === audio) blackHoleWarningAudio = null;
    },
    {once: true},
  );
  audio.load();
  return audio;
}

async function playBlackHoleWarning() {
  const audio = prepareBlackHoleWarning();
  try {
    await audio.play();
  } catch (error) {
    console.debug('[sg1-iris] Black Hole warning audio failed', error);
    if (blackHoleWarningAudio === audio) blackHoleWarningAudio = null;
  }
}

function blackHoleElapsedMs(status) {
  const maxSeconds = Number(status.wormhole_max_time);
  const remainingSeconds = Number(status.wormhole_time_till_close);
  if (
    Number.isFinite(maxSeconds)
    && Number.isFinite(remainingSeconds)
    && maxSeconds > 0
    && remainingSeconds > 0
  ) {
    return Math.max(0, (maxSeconds - remainingSeconds) * 1000);
  }

  const openedAtSeconds = Number(status.wormhole_open_time);
  if (!Number.isFinite(openedAtSeconds) || openedAtSeconds <= 0) return 0;

  const elapsed = Date.now() - openedAtSeconds * 1000;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
}

function isGateConnectionActive(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['', '0', 'false', 'none', 'idle', 'inactive'].includes(normalized);
  }
  return Boolean(value);
}

function issueBlackHoleClosure() {
  if (blackHoleClosureIssued) return false;
  blackHoleClosureIssued = true;
  setClosed(true);
  return true;
}

function scheduleBlackHoleSequence(status) {
  const connectionId = String(status.wormhole_open_time || 'active');
  if (blackHoleConnectionId === connectionId) {
    if (
      !blackHoleClosureIssued
      && blackHoleElapsedMs(status) >= BLACK_HOLE_CLOSE_DELAY_MS
    ) {
      issueBlackHoleClosure();
    }
    return;
  }

  clearBlackHoleSequence();
  blackHoleConnectionId = connectionId;
  setBlackHoleRandomAudioBlocked(true);
  autoClosed = false;
  manualOpenDuringIncoming = false;
  localStorage.removeItem(AUTO_CLOSED_STORAGE_KEY);
  setClosed(false);

  const elapsed = blackHoleElapsedMs(status);
  const audioDelay = BLACK_HOLE_AUDIO_DELAY_MS - elapsed;
  const closeDelay = BLACK_HOLE_CLOSE_DELAY_MS - elapsed;

  // The warning belongs only to this Black Hole event. If the page joins the
  // connection after its cue has already passed, do not replay it.
  if (audioDelay > 0) {
    prepareBlackHoleWarning();
    blackHoleAudioTimer = setTimeout(() => {
      blackHoleAudioTimer = null;
      playBlackHoleWarning();
    }, audioDelay);
  }

  if (closeDelay <= 0) {
    issueBlackHoleClosure();
    return;
  }

  blackHoleCloseTimer = setTimeout(() => {
    blackHoleCloseTimer = null;
    issueBlackHoleClosure();
  }, closeDelay);
}

function syncGateStatus(status) {
  if (!status || typeof status !== 'object') return;

  const incomingAddress = Array.isArray(status.address_buffer_incoming)
    ? status.address_buffer_incoming
    : [];
  const lockedIncoming = Number(status.locked_chevrons_incoming) || 0;
  const wormholeActive = String(status.wormhole_active || '').toLowerCase();
  const connectionActive = isGateConnectionActive(status.wormhole_active);
  const connectionEnded = gateConnectionActive && !connectionActive;
  gateConnectionActive = connectionActive;
  const connectedPlanet = String(status.connected_planet || '')
    .trim()
    .toUpperCase();
  const blackHoleConnected =
    connectionActive
    && (
      Boolean(status.black_hole_connected)
      || connectedPlanet === BLACK_HOLE_GATE_NAME
    );
  const incoming =
    wormholeActive === 'incoming'
    || incomingAddress.length > 0
    || lockedIncoming > 0;
  const idle =
    !incoming
    && !connectionActive
    && incomingAddress.length === 0
    && lockedIncoming === 0;

  document.documentElement.classList.toggle('iris-incoming', incoming);
  document.documentElement.classList.toggle(
    'iris-black-hole',
    blackHoleConnected,
  );

  // P3W-451 gets one dedicated browser warning at thirty-five seconds, followed by
  // the Iris close command at forty-five seconds. This Audio instance is
  // isolated from SG1's normal browser audio flow and is discarded afterward.
  if (blackHoleConnected) {
    if (targetClosed) playIrisImpact(status);
    scheduleBlackHoleSequence(status);
    return;
  } else if (blackHoleConnectionId !== null) {
    clearBlackHoleSequence();
  }

  // Match the rest of SG1's post-connection reset: every completed incoming,
  // outgoing or Black Hole wormhole returns the iris to its open position.
  if (connectionEnded) {
    autoClosed = false;
    manualOpenDuringIncoming = false;
    localStorage.removeItem(AUTO_CLOSED_STORAGE_KEY);
    setClosed(false);
    return;
  }

  // Incoming always wins over a manual open command. The iris owns this check
  // instead of relying on Retro dial.js, so it works on every installed gate.
  if (incoming && manualOpenDuringIncoming) {
    autoClosed = false;
    localStorage.removeItem(AUTO_CLOSED_STORAGE_KEY);
  } else if (incoming && !targetClosed) {
    autoClosed = true;
    localStorage.setItem(AUTO_CLOSED_STORAGE_KEY, '1');
    setClosed(true);
  } else if (incoming) {
    autoClosed = true;
    localStorage.setItem(AUTO_CLOSED_STORAGE_KEY, '1');
  } else if (idle && autoClosed) {
    autoClosed = false;
    manualOpenDuringIncoming = false;
    localStorage.removeItem(AUTO_CLOSED_STORAGE_KEY);
    setClosed(false);
  } else if (idle) {
    manualOpenDuringIncoming = false;
  }

  if (targetClosed && connectionActive) {
    playIrisImpact(status);
  } else if (!connectionActive) {
    lastImpactConnectionId = null;
  }
}

async function pollGateStatus() {
  if (statusPolling) return;
  statusPolling = true;
  let nextDelay = STATUS_POLL_INTERVAL_MS;

  try {
    const endpoint = STATUS_ENDPOINTS[statusEndpointIndex] || STATUS_ENDPOINTS[0];
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    syncGateStatus(status);
  } catch (error) {
    statusEndpointIndex = (statusEndpointIndex + 1) % STATUS_ENDPOINTS.length;
    nextDelay = STATUS_RETRY_INTERVAL_MS;
  } finally {
    statusPolling = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(pollGateStatus, nextDelay);
  }
}

function startStatusPolling() {
  clearTimeout(statusTimer);
  pollGateStatus();
}

function initialize() {
  const ring = document.querySelector('.ring-1');
  if (!ring || document.querySelector('.iris-mechanism')) return;

  canvas = document.createElement('canvas');
  canvas.className = 'gate iris-mechanism';
  canvas.setAttribute('aria-label', 'Animated titanium iris');
  ring.after(canvas);

  installRandomAudioGuard();

  const resizeObserver = new ResizeObserver(draw);
  resizeObserver.observe(canvas);
  draw();

  if (!installControlButton()) {
    const navigationObserver = new MutationObserver(() => {
      if (installControlButton()) navigationObserver.disconnect();
    });
    navigationObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener(
    'keydown',
    event => {
      if (event.ctrlKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggle();
      }
    },
    true,
  );

  document.addEventListener('iris:open', () => setClosed(false));
  document.addEventListener('iris:close', () => setClosed(true));
  document.addEventListener('iris:toggle', toggle);
  document.addEventListener('iris:gate-status', event => syncGateStatus(event.detail));
  document.addEventListener('iris:state', event => {
    if (event.detail?.closed && blackHoleConnectionId !== null) {
      finishBlackHoleSequence();
    }
  });

  window.sg1Iris = Object.freeze({
    open: () => setClosed(false),
    close: () => setClosed(true),
    toggle,
    isClosed: () => targetClosed,
    syncGateStatus,
  });

  startStatusPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
