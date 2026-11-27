struct Params {
  resolution: vec2f,
  tilt: vec2f,
  pointer: vec2f,
  rippleOrigin: vec2f,
  hover: f32,
  rippleTime: f32,
  idleGlow: f32,
  charge: f32,
  burst: f32,
  burstStrength: f32,
  chargeTime: f32,
  reducedMotion: f32,
  heartbeatPhase: f32,
  burstTime: f32,
  ripplePhase: f32,
  shimmerTime: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var artwork: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;

const CARD_SIZE = vec2f(1.28, 1.82);
const INV_CARD_SIZE = vec2f(1.0 / 1.28, 1.0 / 1.82);
const LOGO_REGION_MAX_Y: f32 = 0.78;
const CAPTION_REGION_MIN_Y: f32 = 0.82;
const GAP_RADIUS: f32 = 0.032;

fn roundedBox(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let q = abs(p) - halfSize + radius;
  return length(max(q, vec2f(0))) + min(max(q.x, q.y), 0.0) - radius;
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let v = b - a;
  return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0));
}

fn stroke(distance: f32, width: f32, aa: f32) -> f32 {
  return 1.0 - smoothstep(width, width + aa, abs(distance));
}

fn sq(x: f32) -> f32 {
  return x * x;
}

// Approximate visible wavelengths in micrometers with smooth display RGB responses.
fn wavelengthColor(wavelength: f32) -> vec3f {
  let response = (vec3f(wavelength) - vec3f(0.610, 0.545, 0.460)) / vec3f(0.045, 0.038, 0.032);
  let visible = smoothstep(0.380, 0.410, wavelength) * (1.0 - smoothstep(0.700, 0.780, wavelength));
  return exp(-0.5 * response * response) * visible;
}

// Reflection grating approximation: m * wavelength = d * dot(L + V, across).
// L and V point away from the surface; across is perpendicular to the grooves.
// Based on the diffraction-order model in GPU Gems, chapter 8 (Jos Stam).
fn diffraction(across: vec2f, lightAndView: vec2f, spacing: f32) -> vec3f {
  let pathDifference = spacing * abs(dot(lightAndView, across));
  let along = dot(lightAndView, vec2f(-across.y, across.x));
  // Finite, imperfect groove patches broaden the directional reflection.
  let envelope = exp(-along * along / 0.36);
  var reflected = vec3f(0);
  for (var order = 1; order <= 3; order++) {
    let m = f32(order);
    reflected += wavelengthColor(pathDifference / m) / (m * m);
  }
  return reflected * envelope;
}

// Broad, art-directed pearlescence underneath the finer diffraction detail.
fn pearlColor(phase: f32) -> vec3f {
  return vec3f(0.55, 0.52, 0.64) + vec3f(0.43, 0.40, 0.34)
    * cos(6.2831853 * (phase + vec3f(0.05, 0.38, 0.63)));
}

fn grain(point: vec2f) -> f32 {
  let p = vec2u(abs(point) * 2400.0);
  var n = (p.x * 1597334677u) ^ (p.y * 3812015801u);
  n = (n ^ (n >> 16u)) * 2246822519u;
  return f32(n & 1023u) / 1023.0 - 0.5;
}

fn etchedPhase(p: vec2f) -> f32 {
  // Warp the surface before tracing contours, so their spacing flows in soft waves.
  let warp = vec2f(
    sin(p.y * 7.0 + sin(p.x * 4.0)) * 0.085,
    sin(p.x * 6.0 - p.y * 3.0) * 0.07
  );
  let q = p + warp - vec2f(0.13, 0.08);
  let radius = length(q * vec2f(1.0, 0.76));
  return radius * 142.0 + sin(atan2(q.y, q.x) * 3.0 + radius * 8.0) * 1.7;
}

fn sampleLogo(uv: vec2f) -> f32 {
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= LOGO_REGION_MAX_Y) {
    return 0.0;
  }
  return textureSampleLevel(artwork, linear, uv, 0.0).r;
}

fn sampleCaption(uv: vec2f) -> f32 {
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y < CAPTION_REGION_MIN_Y || uv.y >= 1.0) {
    return 0.0;
  }
  return textureSampleLevel(artwork, linear, uv, 0.0).r;
}

// Reads the baked 16-bit continuous clockwise arc-length parameter t in [0, 1] along the F outline
// using nearest integer texel fetch (no bilinear interpolation across hi/lo byte carries or corner seam).
fn sampleLogoContourT(uv: vec2f) -> f32 {
  let dims = vec2f(textureDimensions(artwork));
  let coord = vec2i(clamp(uv * dims, vec2f(0.0), dims - vec2f(1.0)));
  let texel = textureLoad(artwork, coord, 0);
  if (texel.a < 0.5) {
    return 1.0;
  }
  let hi = floor(texel.g * 255.0 + 0.5);
  let lo = floor(texel.b * 255.0 + 0.5);
  return (hi * 256.0 + lo) / 65535.0;
}

struct LogoGapInfo {
  outside: f32,
  foilEdge: f32,
  foilAcross: vec2f,
}

// Evaluates the uniform clear graphite gap and outer foil rim around the sampled logo mask.
fn evaluateLogoGap(uv: vec2f, logoRaw: f32, aa: f32) -> LogoGapInfo {
  // Fast exit outside the padded bounding box of the centred Fieldr mark.
  if (uv.x < 0.20 || uv.x > 0.82 || uv.y < 0.22 || uv.y > 0.75) {
    return LogoGapInfo(1.0, 0.0, vec2f(0.0, -1.0));
  }
  // Strictly inside the mark: neither outside nor on the outer foil rim.
  if (logoRaw >= 0.995) {
    return LogoGapInfo(0.0, 0.0, vec2f(0.0, -1.0));
  }

  let band = max(0.0014, aa * 0.65);
  let outerRadius = GAP_RADIUS + band;
  let innerRadius = GAP_RADIUS - band;
  let stepOuter = outerRadius * INV_CARD_SIZE;
  let stepMid = GAP_RADIUS * INV_CARD_SIZE;
  let stepInner = innerRadius * INV_CARD_SIZE;
  let stepHalf = (GAP_RADIUS * 0.5) * INV_CARD_SIZE;

  var maxOuter = logoRaw;
  var grad = vec2f(0.0);
  for (var i = 0; i < 24; i++) {
    let angle = f32(i) * 0.26179939; // 2*pi / 24
    let dir = vec2f(cos(angle), sin(angle));
    let s = sampleLogo(uv + dir * stepOuter);
    maxOuter = max(maxOuter, s);
    grad += dir * s;
  }

  // Strictly outside the outer foil rim: no need to sample inner rings.
  if (maxOuter <= 0.001) {
    return LogoGapInfo(1.0, 0.0, vec2f(0.0, -1.0));
  }

  var maxMid = logoRaw;
  var maxInner = logoRaw;
  for (var i = 0; i < 24; i++) {
    let angle = f32(i) * 0.26179939;
    let dir = vec2f(cos(angle), sin(angle));
    maxMid = max(maxMid, sampleLogo(uv + dir * stepMid));
    maxInner = max(maxInner, sampleLogo(uv + dir * stepInner));
  }
  for (var j = 0; j < 8; j++) {
    let angle = f32(j) * 0.78539816;
    let dir = vec2f(cos(angle), sin(angle));
    let s = sampleLogo(uv + dir * stepHalf);
    maxMid = max(maxMid, s);
    maxInner = max(maxInner, s);
  }

  let outside = 1.0 - smoothstep(0.35, 0.65, maxMid);
  let foilEdge = smoothstep(0.15, 0.85, max(maxOuter - maxInner, 0.0));
  let gradLen = length(grad);
  let foilAcross = select(vec2f(0.0, -1.0), grad / gradLen, gradLen > 0.0001);
  return LogoGapInfo(outside, foilEdge, foilAcross);
}

fn evaluateLogoOutline(uv: vec2f, logoRaw: f32, aa: f32) -> f32 {
  if (uv.x < 0.24 || uv.x > 0.78 || uv.y < 0.26 || uv.y > 0.72) {
    return 0.0;
  }
  let radius = max(0.0018, aa * 0.85);
  let stepUv = radius * INV_CARD_SIZE;
  var lo = logoRaw;
  var hi = logoRaw;
  for (var i = 0; i < 8; i++) {
    let angle = f32(i) * 0.78539816;
    let s = sampleLogo(uv + vec2f(cos(angle), sin(angle)) * stepUv);
    lo = min(lo, s);
    hi = max(hi, s);
  }
  return smoothstep(0.15, 0.85, hi - lo);
}

struct EngravingMark {
  coverage: f32,
  across: vec2f,
}

// Multi-scale geometric facet engraving clipped to the Fieldr logo mask,
// with screen-space antialiasing and per-facet groove directions for diffraction.
fn logoEngraving(p: vec2f, aa: f32) -> EngravingMark {
  var cellSize = 0.16;
  var q = (p - vec2f(0.015, -0.025)) / cellSize;
  var bestCoverage = 0.0;
  var grooveAcross = vec2f(0.0, -1.0);

  for (var level = 0; level < 4; level++) {
    let cellId = floor(q);
    let f = fract(q) - 0.5;
    let boxEdge = (0.5 - max(abs(f.x), abs(f.y))) * cellSize;
    let diagEdge = abs(abs(f.x) + abs(f.y) - 0.5) * 0.70710678 * cellSize;

    let weight = select(0.65, 1.0, level < 2);
    let lineW = select(0.00055, 0.0008, level < 2);
    let aaScale = select(0.5, 0.65, level < 2);
    let parity = (i32(cellId.x) + i32(cellId.y) + level) & 1;

    if (abs(f.x) + abs(f.y) < 0.5) {
      if (abs(f.x) > abs(f.y)) {
        grooveAcross = select(vec2f(0.70710678, 0.70710678), vec2f(0.70710678, -0.70710678), parity == 0);
      } else {
        grooveAcross = select(vec2f(0.0, -1.0), vec2f(1.0, 0.0), parity == 0);
      }
      bestCoverage = max(bestCoverage, stroke(diagEdge, lineW, aa * aaScale) * weight);
      if (parity == 0 && level >= 1) {
        return EngravingMark(bestCoverage, grooveAcross);
      }
    } else {
      let sx = select(-1.0, 1.0, f.x >= 0.0);
      let sy = select(-1.0, 1.0, f.y >= 0.0);
      grooveAcross = normalize(vec2f(sx, sy));
      let d = max(stroke(boxEdge, lineW, aa * aaScale), stroke(diagEdge, lineW, aa * aaScale)) * weight;
      bestCoverage = max(bestCoverage, d);
    }

    q = q * 2.0;
    cellSize *= 0.5;
  }

  return EngravingMark(bestCoverage, grooveAcross);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1));
  let scale = min(resolution.y, resolution.x * 1.35);
  let screen = (uv - 0.5) * resolution / scale * 2.5;
  let chargeAmt = clamp(params.charge, 0.0, 1.0);
  let burstP = clamp(params.burst, 0.0, 1.0);
  let burstStr = clamp(params.burstStrength, 0.0, 1.0);
  let reducedFlag = params.reducedMotion;
  let fullMotion = reducedFlag < 0.5;
  let pxToCard = 2.5 / scale;

  // Smoothstep-blended charge stages (no hard switches):
  // Stage 1 Ignite (0..0.35), Stage 2 Pull (0.25..0.75), Stage 3 Critical (0.7..1.0).
  let stage2 = smoothstep(0.25, 0.75, chargeAmt);
  let stage3 = smoothstep(0.7, 1.0, chargeAmt);
  let chargeActive = chargeAmt > 0.001;
  let burstActive = burstP > 0.0001 && burstStr > 0.001;
  let bTime = max(params.burstTime, 0.0);

  // Subtle 1-2 px tremble in shader space during late charge (disabled under reduced motion).
  let trembleDrive = smoothstep(0.45, 1.0, chargeAmt);
  let jitterPx = select(0.0, min(1.8 * trembleDrive * (0.65 + 0.35 * stage3), 2.0), fullMotion && chargeActive);
  let jitterOffset = vec2f(
    sin(params.chargeTime * 53.0) * 0.65 + cos(params.chargeTime * 89.0) * 0.35,
    cos(params.chargeTime * 61.0) * 0.65 + sin(params.chargeTime * 97.0) * 0.35
  ) * (jitterPx * pxToCard);
  let cardScreen = screen + jitterOffset;
  let sx = sin(params.tilt.y);
  let cx = cos(params.tilt.y);
  let sy = sin(params.tilt.x);
  let cy = cos(params.tilt.x);
  let right = vec3f(cy, 0, -sy);
  let down = vec3f(sy * sx, cx, cy * sx);
  let normal = cross(right, down);
  let eye = vec3f(0, 0, 4.5);
  let ray = normalize(vec3f(cardScreen, -4.5));
  let hit = eye - ray * (dot(eye, normal) / dot(ray, normal));
  let p = vec2f(dot(hit, right), dot(hit, down));
  let aa = max(length(fwidth(p)), 0.0006);
  let edge = roundedBox(p, vec2f(0.64, 0.91), 0.055);
  let silhouette = 1.0 - smoothstep(-aa, aa, edge);

  // Radial geometry centred on the Fieldr F mark.
  let fCenter = vec2f(0.015, -0.025);
  let fDelta = p - fCenter;
  let fDist = length(fDelta);
  let radialDir = fDelta / max(fDist, 0.0001);
  let midRadiusMask = smoothstep(0.05, 0.30, fDist) * (1.0 - smoothstep(0.45, 1.05, fDist));
  let waveOriginMask = smoothstep(0.02, 0.12, fDist);

  // Release timeline: 120ms inhale -> 1100ms main shockwave + echo rings at +140ms (55%) & +300ms (30%).
  var inhaleFactor = 0.0;
  var preReleasePull = 0.0;
  var mainWave = 0.0;
  var echo1Wave = 0.0;
  var echo2Wave = 0.0;
  var waveBandEnergy = 0.0;
  var waveFringePeak = 0.0;
  var fOutlineFlash = 0.0;
  var fAfterglow = 0.0;
  var foilSettle = 0.0;
  var inhaleCarryOutline = 0.0;

  if (burstActive) {
    inhaleFactor = smoothstep(0.0, 0.055, bTime) * (1.0 - smoothstep(0.095, 0.135, bTime));
    let releaseFadeOut = 1.0 - smoothstep(0.095, 0.14, bTime);
    preReleasePull = smoothstep(0.25, 0.75, burstStr) * releaseFadeOut;
    inhaleCarryOutline = smoothstep(0.15, 1.0, burstStr) * releaseFadeOut;

    let waveT = bTime - 0.12;
    if (waveT > 0.0) {
      let maxRadius = mix(0.68, 1.48, burstStr);

      // Main shockwave (1100ms, ease-out)
      if (waveT < 1.10 && fullMotion) {
        let u0 = clamp(waveT / 1.10, 0.0, 1.0);
        let oneMinus0 = 1.0 - u0;
        let ease0 = 1.0 - oneMinus0 * oneMinus0 * oneMinus0;
        let r0 = mix(0.05, maxRadius, ease0);
        let w0 = mix(0.028, 0.086, ease0);
        let g0 = exp(-sq((fDist - r0) / w0));
        let fade0 = smoothstep(0.0, 0.045, u0) * sq(oneMinus0);
        mainWave = g0 * fade0 * burstStr;
      }

      // Echo ring 1 (+140ms behind main wave, 55% strength)
      let e1T = waveT - 0.14;
      if (e1T > 0.0 && e1T < 1.00 && fullMotion) {
        let u1 = clamp(e1T / 1.00, 0.0, 1.0);
        let oneMinus1 = 1.0 - u1;
        let ease1 = 1.0 - oneMinus1 * oneMinus1 * oneMinus1;
        let r1 = mix(0.05, maxRadius * 0.96, ease1);
        let w1 = mix(0.022, 0.076, ease1);
        let g1 = exp(-sq((fDist - r1) / w1));
        let fade1 = smoothstep(0.0, 0.05, u1) * sq(oneMinus1);
        echo1Wave = g1 * fade1 * 0.55 * burstStr;
      }

      // Echo ring 2 (+300ms behind main wave, 30% strength)
      let e2T = waveT - 0.30;
      if (e2T > 0.0 && e2T < 0.95 && fullMotion) {
        let u2 = clamp(e2T / 0.95, 0.0, 1.0);
        let oneMinus2 = 1.0 - u2;
        let ease2 = 1.0 - oneMinus2 * oneMinus2 * oneMinus2;
        let r2 = mix(0.05, maxRadius * 0.92, ease2);
        let w2 = mix(0.018, 0.070, ease2);
        let g2 = exp(-sq((fDist - r2) / w2));
        let fade2 = smoothstep(0.0, 0.05, u2) * sq(oneMinus2);
        echo2Wave = g2 * fade2 * 0.30 * burstStr;
      }

      waveBandEnergy = mainWave + echo1Wave + echo2Wave;
      waveFringePeak = mainWave + echo1Wave * 0.65 + echo2Wave * 0.40;

      // F outline white flash (180ms as wave leaves F) + soft exponential afterglow (~1.8s)
      fOutlineFlash = smoothstep(0.0, 0.025, waveT) * (1.0 - smoothstep(0.045, 0.18, waveT)) * burstStr;
      fAfterglow = smoothstep(0.0, 0.04, waveT)
        * exp(-waveT / 0.58)
        * (1.0 - smoothstep(1.65, 2.05, waveT))
        * burstStr;
      // Foil diffraction settles back exponentially over ~1.2s
      foilSettle = smoothstep(0.0, 0.04, waveT)
        * exp(-waveT / 0.38)
        * (1.0 - smoothstep(1.10, 1.38, waveT))
        * burstStr;
    }
  }

  // Heartbeat pulse for Stage 3 critical state (1.2 Hz speeding up to 2.4 Hz via integrated phase).
  let hbCycle = fract(params.heartbeatPhase);
  let hbPrimary = exp(-sq((hbCycle - 0.14) / 0.085));
  let hbSecondary = exp(-sq((hbCycle - 0.34) / 0.105)) * 0.52;
  let heartbeat = select(0.0, clamp(hbPrimary + hbSecondary, 0.0, 1.0), fullMotion);
  let fullBreathing = select(
    0.0,
    smoothstep(0.94, 1.0, chargeAmt) * (0.5 + 0.5 * sin(params.heartbeatPhase * 6.2831853)),
    fullMotion
  );

  // Radial lens pull (Stage 2 + release inhale) and outward refraction displacement (shockwave + echoes).
  let pullWarp = (stage2 * 0.072 + preReleasePull * 0.072 + inhaleFactor * 0.026 * burstStr) * midRadiusMask;
  let pushWarp = (mainWave * 0.085 + echo1Wave * 0.062 + echo2Wave * 0.045) * waveOriginMask;
  let radialDisp = select(0.0, pullWarp - pushWarp, fullMotion);
  let warpedP = p + radialDir * radialDisp;

  let halo = exp(-dot(screen, screen) * 0.8);
  var background = vec3f(0.027, 0.031, 0.038) + 0.009 * halo;
  let shadow = exp(-max(roundedBox(cardScreen - vec2f(0.025, 0.06), vec2f(0.63, 0.9), 0.055), 0.0) * 22.0);
  background *= 1.0 - 0.7 * shadow;
  // Subtle stage-2 vignette darkening on surrounding backdrop (max 18%).
  let bgDarken = select(0.0, min(0.18 * stage2 + 0.10 * inhaleFactor * burstStr, 0.18), fullMotion);
  background *= 1.0 - bgDarken;

  // Matte graphite remains dark; only the cursor's grazing light reveals the foil.
  let hover = clamp(params.hover, 0.0, 1.0);
  let lightCenter = params.pointer * vec2f(0.64, 0.91);
  let delta = p - lightCenter;
  let sweepDistance = delta.x * 0.72 + delta.y * 0.52 + sin(p.y * 4.0 + p.x * 3.0) * 0.08;
  let bandDistance = sweepDistance / 0.36;
  let lightBand = exp(-bandDistance * bandDistance);
  let glintDistance = sweepDistance / 0.085;
  let glint = exp(-glintDistance * glintDistance);
  let spotlight = exp(-dot(delta * vec2f(1.05, 0.72), delta * vec2f(1.05, 0.72)) * 2.6);
  let light = lightBand * spotlight * hover;
  let lightDirection = normalize(vec3f(lightCenter, 1.2) - hit);
  let viewDirection = normalize(eye - hit);
  let lightAndView = vec2f(dot(lightDirection + viewDirection, right), dot(lightDirection + viewDirection, down));
  let illumination = max(dot(normal, lightDirection), 0.0) * max(dot(normal, viewDirection), 0.0);
  let tint = vec3f(0.72, 0.76, 0.8);
  let noise = grain(p + vec2f(2));
  var color = vec3f(0.062, 0.068, 0.078) + 0.008 * (0.9 - p.y);
  // Fine, surface-locked grain catches the grazing reflection without animated static.
  color += noise * (0.022 + light * 0.085);
  color += light * (vec3f(0.045) + tint * 0.065);

  let artworkUv = p * INV_CARD_SIZE + 0.5;
  let logoRaw = sampleLogo(artworkUv);
  let inside = smoothstep(0.35, 0.65, logoRaw);
  let gapInfo = evaluateLogoGap(artworkUv, logoRaw, aa);
  let outside = gapInfo.outside;

  // Separate engravings leave a clear graphite gap between the logo and surrounding contours.
  // All screen-space derivatives remain in top-level uniform control flow.
  let contour = etchedPhase(warpedP);
  let dx = dpdx(warpedP);
  let dy = dpdy(warpedP);
  let gradient = vec2f(dpdx(contour) * dy.y - dpdy(contour) * dx.y, dpdy(contour) * dx.x - dpdx(contour) * dy.x);
  let across = gradient / max(length(gradient), 0.00000001);
  let contourWidth = min(fwidth(contour), 1.0);
  let outerDiffraction = diffraction(across, lightAndView, 1.65) * illumination;
  let contours = stroke(sin(contour), 0.06, contourWidth);

  // Radial chromatic fringe (Stage 3 critical + shockwave peak): separate R/G/B by a few shader pixels.
  let fringePx = select(0.0, 4.2 * stage3 + 6.5 * waveFringePeak, fullMotion);
  let fringeShift = fringePx * pxToCard;
  let contourR = etchedPhase(warpedP + radialDir * fringeShift);
  let contourB = etchedPhase(warpedP - radialDir * fringeShift);
  let contoursR = stroke(sin(contourR), 0.06, contourWidth);
  let contoursB = stroke(sin(contourB), 0.06, contourWidth);
  let chromaticContours = vec3f(contoursR, contours, contoursB);

  let reveal = hover * (0.06 + 0.24 * spotlight + light * 1.15);
  let innerMark = logoEngraving(p, aa);
  let innerDiffraction = diffraction(innerMark.across, lightAndView, 1.35) * illumination;
  let pearlPhase = dot(lightAndView, vec2f(0.48, -0.32)) + p.y * 0.32 + contour * 0.003;
  let outerPearl = pearlColor(pearlPhase);
  let innerPearl = pearlColor(pearlPhase + dot(innerMark.across, lightAndView) * 0.32 + 0.12);
  let chromaticPhaseShift = fringePx * 0.011;
  let chromaticPearl = vec3f(
    pearlColor(pearlPhase + chromaticPhaseShift).r,
    outerPearl.g,
    pearlColor(pearlPhase - chromaticPhaseShift).b
  );

  // Color washes over the material between etched lines, with a narrower silver
  // flash moving through it. Both layers respect the empty gap between outlines.
  let pearl = outerPearl * outside + innerPearl * inside;
  color += pearl * light * 0.24;
  color += (pearl * 0.5 + vec3f(0.5) * (inside + outside)) * glint * spotlight * hover * 0.12;
  let sparkle = pow(max(noise + 0.5, 0.0001), 24.0) * glint * spotlight * hover;
  color += pearl * sparkle * 0.22;
  let outerFoil = vec3f(0.12, 0.14, 0.18) + chromaticPearl * 0.65 + outerDiffraction * 0.12;
  let innerFoil = vec3f(0.12, 0.14, 0.18) + innerPearl * 0.65 + innerDiffraction * 0.12;
  color += (chromaticContours * 0.65 * outside * outerFoil + innerMark.coverage * inside * innerFoil) * reveal;

  // A delicate spectral echo stays clipped to the same engraving regions.
  let foilOffset = vec2f(0.007, -0.004) + params.tilt * 0.012;
  let foilPoint = warpedP - foilOffset;
  let foilPhase = etchedPhase(foilPoint);
  let foilLines = stroke(sin(foilPhase), 0.025, min(fwidth(foilPhase), 1.0));
  let foilInner = logoEngraving(p - foilOffset, aa);
  let echoDiffraction = diffraction(foilInner.across, lightAndView, 1.35) * illumination;
  color += (foilLines * 0.65 * outside * (chromaticPearl + outerDiffraction * 0.2)
    + foilInner.coverage * inside * (innerPearl + echoDiffraction * 0.2)) * reveal * 0.22;

  // Outer foil rim framing the clear graphite gap around the Fieldr mark.
  let foilTint = outerPearl * 0.8 + vec3f(0.2) + diffraction(gapInfo.foilAcross, lightAndView, 1.65) * illumination * 0.15;
  color += gapInfo.foilEdge * foilTint * hover * (0.12 + light * 0.5);

  // Sparse microdots and registration ticks emerge in the surrounding foil.
  let grid = (fract((p + 1.0) * 20.0) - 0.5) / 20.0;
  let dots = stroke(length(grid), 0.0008, aa * 0.4);
  color += dots * outside * reveal * 0.17;
  let guide = abs(p) - vec2f(0.49, 0.37);
  let horizontal = stroke(guide.y, 0.0006, aa * 0.5) * (1.0 - smoothstep(0.012, 0.017, abs(guide.x)));
  let vertical = stroke(guide.x, 0.0006, aa * 0.5) * (1.0 - smoothstep(0.012, 0.017, abs(guide.y)));
  color += max(horizontal, vertical) * hover * (0.12 + light * 0.22);

  // Always-visible outline of the Fieldr logo: baseline contrast does not depend on hover or light.
  let idleGlow = clamp(params.idleGlow, 0.0, 1.0);
  if (idleGlow > 0.001) {
    color += (innerMark.coverage * inside * innerPearl * 0.22
      + gapInfo.foilEdge * outerPearl * 0.18
      + inside * innerPearl * 0.055) * idleGlow;
  }

  // Expanding chromatic shockwave ripple from pointer-down origin (~900ms fade).
  let rippleT = params.rippleTime;
  if (rippleT >= 0.0 && rippleT < 0.9) {
    let rippleProgress = rippleT / 0.9;
    let rippleCenter = params.rippleOrigin * vec2f(0.64, 0.91);
    let rippleDist = length(p - rippleCenter);
    let eased = 1.0 - sq(1.0 - rippleProgress);
    let waveRadius = eased * 1.85;
    let ringWidth = mix(0.055, 0.18, eased);
    let ringDelta = (rippleDist - waveRadius) / ringWidth;
    let ring = exp(-ringDelta * ringDelta);
    let fade = smoothstep(0.0, 0.06, rippleProgress) * pow(max(1.0 - rippleProgress, 0.0001), 1.6);
    let wavePhase = rippleDist * 1.35 - rippleProgress * 1.1 + dot(lightAndView, vec2f(0.25, -0.18));
    let waveColor = pearlColor(wavePhase) * 0.85 + vec3f(0.18, 0.22, 0.28);
    let surfaceCatch = 0.28 + contours * 0.65 * outside + innerMark.coverage * 0.95 * inside + gapInfo.foilEdge * 0.85;
    color += waveColor * ring * fade * surfaceCatch * 0.62;
  }

  // Stage 2 background vignette darkening on card surface (max 18%) so the foil pops.
  if (fullMotion && stage2 > 0.001) {
    let cardEdgeDist = length(p * vec2f(1.0 / 0.64, 1.0 / 0.91));
    let vignetteMask = smoothstep(0.22, 1.12, cardEdgeDist);
    color *= 1.0 - min(0.18 * stage2 * (0.35 + 0.65 * vignetteMask), 0.18);
  }

  // Hold-to-charge: Stage 1 stays calm on the foil; Stage 2 adds inward concentric ripples + foil lift;
  // Stage 3 adds chromatic fringe, fine contour shimmer, and breathing critical state.
  if (chargeActive) {
    if (!fullMotion) {
      // Reduced motion: gentle brightness lift only (no warp, no tremble, no rings).
      color += (vec3f(0.045, 0.05, 0.058) + innerPearl * inside * 0.12) * chargeAmt;
    } else {
      // Stage 2 & 3 foil diffraction lift (stays calm during Stage 1 Ignite 0..0.25).
      let foilChargeDrive = stage2 * 0.58 + stage3 * (0.48 + 0.24 * heartbeat + 0.16 * fullBreathing);
      if (foilChargeDrive > 0.001) {
        color += (chromaticContours * 0.68 * outside * (outerFoil + outerDiffraction * 0.42)
          + innerMark.coverage * inside * (innerFoil + innerDiffraction * 0.52)
          + gapInfo.foilEdge * foilTint * (0.52 + 0.48 * stage3 * (0.65 + 0.35 * heartbeat))) * foilChargeDrive * 0.52;
        color += inside * (innerPearl * 0.12 + vec3f(0.04, 0.045, 0.055)) * (stage2 * 0.5 + stage3 * (0.6 + 0.35 * heartbeat));
      }

      // Stage 2 (0.25..0.75): 2-3 faint concentric diffraction ripples travelling inward toward the F.
      if (stage2 > 0.001) {
        let inwardMask = smoothstep(0.14, 0.30, fDist) * (1.0 - smoothstep(0.76, 1.06, fDist));
        let crestBase = 0.5 + 0.5 * cos(fDist * 19.5 + params.ripplePhase * 6.2831853);
        let crest2 = crestBase * crestBase;
        let inwardRipples = crest2 * crest2 * inwardMask * stage2 * (1.0 + 0.22 * stage3);
        let inwardDiff = diffraction(radialDir, lightAndView - radialDir * 0.35, 1.55) * (0.4 + 0.6 * illumination);
        let inwardPearl = pearlColor(fDist * 1.45 + params.ripplePhase * 0.75 + pearlPhase * 0.35);
        let inwardTint = vec3f(0.32, 0.35, 0.40) + inwardPearl * 0.58 + inwardDiff * 0.45;
        let inwardCatch = 0.32 + contours * 0.62 * outside + gapInfo.foilEdge * 0.45;
        color += inwardTint * inwardRipples * inwardCatch * 0.26;
      }

      // Stage 3 (0.7..1.0): very fine shimmer running along the engraved lines.
      if (stage3 > 0.001) {
        let theta = atan2(fDelta.y, fDelta.x);
        let shimmerWave = 0.5 + 0.5 * sin(contour * 1.15 - params.shimmerTime * 11.0 + theta * 4.0);
        let shimmerGlint = shimmerWave * shimmerWave * shimmerWave;
        let shimmerTint = vec3f(0.76, 0.80, 0.86) + chromaticPearl * 0.35;
        color += shimmerTint * (chromaticContours * outside * 0.62 + vec3f(innerMark.coverage * inside * 0.85))
          * shimmerGlint * stage3 * (0.42 + 0.22 * heartbeat);
      }
    }
  }

  // Release-to-burst: 120ms inhale dim, main shockwave + 2 echo rings, exponential foil settle & F afterglow.
  if (burstActive) {
    if (!fullMotion) {
      // Reduced motion: gentle fading brightness change only (no inhale warp, no rings).
      let rmFade = max(1.0 - burstP, 0.0);
      color += (vec3f(0.065, 0.07, 0.08) + innerPearl * inside * 0.14) * rmFade * rmFade * burstStr;
    } else {
      // 120ms inhale: everything dims by 12% scaled by burstStrength right before the wave fires.
      if (inhaleFactor > 0.001) {
        color *= 1.0 - 0.12 * inhaleFactor * burstStr;
      }

      // Bright diffraction band riding the shockwave & echo ring edges.
      if (waveBandEnergy > 0.001) {
        let burstDiff = diffraction(radialDir, lightAndView + radialDir * 0.52, 1.48) * (0.45 + 0.55 * illumination);
        let wavePhaseR = fDist * 1.65 - bTime * 1.35 + pearlPhase * 0.45 + 0.075;
        let wavePhaseG = fDist * 1.65 - bTime * 1.35 + pearlPhase * 0.45;
        let wavePhaseB = fDist * 1.65 - bTime * 1.35 + pearlPhase * 0.45 - 0.075;
        let wavePearl = vec3f(
          pearlColor(wavePhaseR).r,
          pearlColor(wavePhaseG).g,
          pearlColor(wavePhaseB).b
        );
        let ringColor = vec3f(0.46, 0.50, 0.56) + wavePearl * 0.72 + burstDiff * 0.62;
        let burstCatch = vec3f(0.38) + chromaticContours * 0.78 * outside
          + vec3f(innerMark.coverage * 1.0 * inside + gapInfo.foilEdge * 0.92);
        color += ringColor * waveBandEnergy * burstCatch * (0.55 + 0.85 * burstStr);
      }

      // Exponential foil diffraction settle (~1.2s).
      if (foilSettle > 0.001) {
        color += (chromaticContours * 0.65 * outside * (outerFoil + outerDiffraction * 0.30)
          + innerMark.coverage * inside * (innerFoil + innerDiffraction * 0.38)
          + gapInfo.foilEdge * foilTint * 0.58) * foilSettle * 0.68;
      }

      // Soft F interior afterglow decaying slowly (~1.8s).
      if (fAfterglow > 0.001) {
        color += (inside * (innerPearl * 0.18 + vec3f(0.06, 0.068, 0.08))
          + gapInfo.foilEdge * (outerPearl * 0.42 + vec3f(0.18, 0.20, 0.24))) * fAfterglow * 0.75;
      }
    }
  }

  // F outline: Stage 1 single-origin top-left fuse filament (baked continuous arc-length t in [0,1])
  // -> Stage 2 lit contour -> Stage 3 white-hot + pearl edge + heartbeat
  // -> Release 180ms white flash + ~1.8s exponential afterglow.
  let outline = evaluateLogoOutline(artworkUv, logoRaw, aa);
  let contourT = sampleLogoContourT(artworkUv);
  let igniteHead = clamp(chargeAmt / 0.35, 0.0, 1.0);
  let igniteHeadActive = smoothstep(0.0, 0.02, igniteHead) * (1.0 - smoothstep(0.34, 0.45, chargeAmt));
  // Non-wrapping signed distance behind the moving head: positive behind head, negative ahead.
  let distBehind = igniteHead - contourT;
  // Single bright head at t = progress (never wraps or spawns a second head).
  let fuseHead = select(
    0.0,
    exp(-sq(distBehind / 0.015)) * igniteHeadActive,
    fullMotion && chargeActive
  );
  // Soft comet tail strictly behind head fading over ~12% of contour (no wrapping).
  let tailWindow = smoothstep(-0.004, 0.009, distBehind) * (1.0 - smoothstep(0.0, 0.12, distBehind));
  let fuseTail = select(
    0.0,
    tailWindow * tailWindow * igniteHeadActive,
    fullMotion && chargeActive
  );
  var outlineBoost = vec3f(0.0);
  if (outline > 0.001) {
    if (!fullMotion) {
      let rmBurstFade = select(0.0, sq(max(1.0 - burstP, 0.0)) * burstStr, burstActive);
      outlineBoost = vec3f(0.24, 0.27, 0.31) * (chargeAmt + rmBurstFade * 0.8);
    } else {
      // Stage 1 Ignite (0..0.35): single filament starting at top-left (t=0) and completing 1 lap at t=1.
      if (chargeActive) {
        let lapComplete = smoothstep(0.335, 0.365, chargeAmt);
        let fuseLit = max(
          smoothstep(-0.006, 0.012, distBehind) * smoothstep(0.0, 0.025, igniteHead),
          lapComplete
        );

        let filamentColor = vec3f(0.95, 0.97, 1.0) * (fuseHead * 1.25 + fuseTail * 0.48)
          + (vec3f(0.30, 0.34, 0.40) + innerPearl * 0.42) * fuseLit * (0.45 + 0.42 * stage2);

        // Stage 3 Critical: white-hot core with pearl edge + heartbeat pulse (1.2 Hz -> 2.4 Hz).
        let criticalPulse = 0.72 + 0.36 * heartbeat + 0.14 * fullBreathing;
        let whiteHot = (vec3f(0.88, 0.92, 0.98) + innerPearl * 0.28) * stage3 * criticalPulse;

        outlineBoost += filamentColor + whiteHot;
      }

      if (burstActive) {
        // Carry outline smoothly through the 120ms inhale, then flash white (180ms) + slow afterglow (~1.8s).
        let inhaleGlow = (vec3f(0.46, 0.50, 0.56) + innerPearl * 0.42) * inhaleCarryOutline * (1.0 - 0.18 * inhaleFactor);
        let flashColor = (vec3f(1.05, 1.08, 1.12) + innerPearl * 0.24) * fOutlineFlash * 1.15;
        let afterglowColor = (vec3f(0.44, 0.48, 0.54) + innerPearl * 0.52) * fAfterglow * 0.92;
        outlineBoost += inhaleGlow + flashColor + afterglowColor;
      }
    }
  }

  // Pearl edge halo right along the F contour during Stage 1 fuse head, Stage 3 critical & release flash/afterglow.
  if (fullMotion) {
    let pearlEdgeDrive = stage3 * (0.45 + 0.55 * heartbeat) + fOutlineFlash * 0.95 + fAfterglow * 0.42;
    let haloDrive = pearlEdgeDrive + fuseHead * 0.45 + fuseTail * 0.18;
    if (haloDrive > 0.001) {
      let edgeRim = smoothstep(0.04, 0.45, logoRaw) * (1.0 - smoothstep(0.55, 0.96, logoRaw));
      let haloTint = (innerPearl * 0.78 + vec3f(0.24, 0.27, 0.32)) * pearlEdgeDrive * 0.55
        + vec3f(0.88, 0.92, 0.98) * (fuseHead * 0.34 + fuseTail * 0.12);
      color += haloTint * edgeRim;
    }
  }

  color = mix(
    color,
    vec3f(0.29, 0.32, 0.36) + tint * light * 0.16 + innerPearl * idleGlow * 0.32 + outlineBoost,
    outline
  );

  // Subtle FIELDR / AUCTIONS caption sampled from the bottom of the same r8unorm mask texture.
  let caption = sampleCaption(artworkUv);
  color = mix(color, vec3f(0.56, 0.59, 0.64) + tint * light * 0.18, caption * 0.72);
  let mark = p - vec2f(0.505, -0.765);
  let crossMark = min(segment(mark, vec2f(-0.024, 0), vec2f(0.024, 0)), segment(mark, vec2f(0, -0.024), vec2f(0, 0.024)));
  color = mix(color, vec3f(0.48, 0.51, 0.55), stroke(crossMark, 0.0007, aa * 0.65));

  let rim = stroke(edge + 0.002, 0.0008, aa * 0.7);
  let rimFalloff = max(0.0, 1.0 - length(delta) * 0.65);
  let rimLight = rimFalloff * rimFalloff * rimFalloff * hover;
  color = mix(color, vec3f(0.25, 0.28, 0.32) + (outerPearl * 0.7 + tint * 0.3) * rimLight * 0.6, rim);
  return vec4f(mix(background, color, silhouette), 1);
}
