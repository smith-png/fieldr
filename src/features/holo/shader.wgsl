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
  // Subtle 1-2 px tremble in shader space while charging (disabled under prefers-reduced-motion).
  let jitterPx = select(0.0, min(1.85 * chargeAmt * chargeAmt, 2.0), reducedFlag < 0.5 && chargeAmt > 0.001);
  let jitterOffset = vec2f(
    sin(params.chargeTime * 53.0) * 0.65 + cos(params.chargeTime * 89.0) * 0.35,
    cos(params.chargeTime * 61.0) * 0.65 + sin(params.chargeTime * 97.0) * 0.35
  ) * (jitterPx * 2.5 / scale);
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

  let halo = exp(-dot(screen, screen) * 0.8);
  var background = vec3f(0.027, 0.031, 0.038) + 0.009 * halo;
  let shadow = exp(-max(roundedBox(cardScreen - vec2f(0.025, 0.06), vec2f(0.63, 0.9), 0.055), 0.0) * 22.0);
  background *= 1.0 - 0.7 * shadow;

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
  let contour = etchedPhase(p);
  // Transform screen derivatives back into the card plane: microscopic grooves
  // follow the visible contours, but their 1.65um spacing is independent of zoom.
  let dx = dpdx(p);
  let dy = dpdy(p);
  let gradient = vec2f(dpdx(contour) * dy.y - dpdy(contour) * dx.y, dpdy(contour) * dx.x - dpdx(contour) * dy.x);
  let across = gradient / max(length(gradient), 0.00000001);
  let outerDiffraction = diffraction(across, lightAndView, 1.65) * illumination;
  let contours = stroke(sin(contour), 0.06, min(fwidth(contour), 1.0));
  let reveal = hover * (0.06 + 0.24 * spotlight + light * 1.15);
  let innerMark = logoEngraving(p, aa);
  let innerDiffraction = diffraction(innerMark.across, lightAndView, 1.35) * illumination;
  let pearlPhase = dot(lightAndView, vec2f(0.48, -0.32)) + p.y * 0.32 + contour * 0.003;
  let outerPearl = pearlColor(pearlPhase);
  let innerPearl = pearlColor(pearlPhase + dot(innerMark.across, lightAndView) * 0.32 + 0.12);
  // Color washes over the material between etched lines, with a narrower silver
  // flash moving through it. Both layers respect the empty gap between outlines.
  let pearl = outerPearl * outside + innerPearl * inside;
  color += pearl * light * 0.24;
  color += (pearl * 0.5 + vec3f(0.5) * (inside + outside)) * glint * spotlight * hover * 0.12;
  let sparkle = pow(max(noise + 0.5, 0.0), 24.0) * glint * spotlight * hover;
  color += pearl * sparkle * 0.22;
  let outerFoil = vec3f(0.12, 0.14, 0.18) + outerPearl * 0.65 + outerDiffraction * 0.12;
  let innerFoil = vec3f(0.12, 0.14, 0.18) + innerPearl * 0.65 + innerDiffraction * 0.12;
  color += (contours * 0.65 * outside * outerFoil + innerMark.coverage * inside * innerFoil) * reveal;

  // A delicate spectral echo stays clipped to the same engraving regions.
  let foilOffset = vec2f(0.007, -0.004) + params.tilt * 0.012;
  let foilPoint = p - foilOffset;
  let foilPhase = etchedPhase(foilPoint);
  let foilLines = stroke(sin(foilPhase), 0.025, min(fwidth(foilPhase), 1.0));
  let foilInner = logoEngraving(foilPoint, aa);
  let echoDiffraction = diffraction(foilInner.across, lightAndView, 1.35) * illumination;
  color += (foilLines * 0.65 * outside * (outerPearl + outerDiffraction * 0.2)
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
    let eased = 1.0 - (1.0 - rippleProgress) * (1.0 - rippleProgress);
    let waveRadius = eased * 1.85;
    let ringWidth = mix(0.055, 0.18, eased);
    let ringDelta = (rippleDist - waveRadius) / ringWidth;
    let ring = exp(-ringDelta * ringDelta);
    let fade = smoothstep(0.0, 0.06, rippleProgress) * pow(1.0 - rippleProgress, 1.6);
    let wavePhase = rippleDist * 1.35 - rippleProgress * 1.1 + dot(lightAndView, vec2f(0.25, -0.18));
    let waveColor = pearlColor(wavePhase) * 0.85 + vec3f(0.18, 0.22, 0.28);
    let surfaceCatch = 0.28 + contours * 0.65 * outside + innerMark.coverage * 0.95 * inside + gapInfo.foilEdge * 0.85;
    color += waveColor * ring * fade * surfaceCatch * 0.62;
  }

  // Hold-to-charge: ramp foil diffraction, steady full-charge pulse, and contracting light ring toward F.
  let fCenter = vec2f(0.015, -0.025);
  let fDelta = p - fCenter;
  let fDist = length(fDelta);
  let fullChargePulse = select(
    0.0,
    smoothstep(0.92, 1.0, chargeAmt) * (0.5 + 0.5 * sin(params.chargeTime * 4.2)),
    reducedFlag < 0.5
  );
  if (chargeAmt > 0.001) {
    if (reducedFlag >= 0.5) {
      // Reduced motion: gentle brightness lift only (no jitter, no contracting ring).
      color += (vec3f(0.045, 0.05, 0.058) + innerPearl * inside * 0.12) * chargeAmt;
    } else {
      let chargeDrive = chargeAmt * (0.55 + 0.45 * chargeAmt) + fullChargePulse * 0.24;
      color += (contours * 0.65 * outside * (outerFoil + outerDiffraction * 0.38)
        + innerMark.coverage * inside * (innerFoil + innerDiffraction * 0.48)
        + gapInfo.foilEdge * foilTint * 0.55) * chargeDrive * 0.58;
      color += inside * (innerPearl * 0.14 + vec3f(0.055, 0.06, 0.07)) * (chargeAmt + fullChargePulse * 0.32);

      // Fine ring of light contracting from card edges toward the F mark.
      let contractRadius = mix(1.04, 0.20, chargeAmt);
      let contractWidth = mix(0.024, 0.011, chargeAmt);
      let contractDelta = (fDist - contractRadius) / contractWidth;
      let contractRing = exp(-contractDelta * contractDelta);
      let contractFade = smoothstep(0.02, 0.14, chargeAmt) * (0.28 + 0.36 * chargeAmt + 0.18 * fullChargePulse);
      let contractTint = mix(
        vec3f(0.76, 0.80, 0.86),
        pearlColor(fDist * 1.45 - chargeAmt * 0.85 + pearlPhase * 0.35),
        0.48
      );
      let contractCatch = 0.55 + contours * 0.45 * outside + innerMark.coverage * 0.55 * inside + gapInfo.foilEdge * 0.5;
      color += contractTint * contractRing * contractFade * contractCatch;
    }
  }

  // Release-to-burst: 900ms shockwave ring from F centre (burst 0..0.4286) + 1.2s foil settle (0.4286..1.0).
  var burstSettle = 0.0;
  if (burstP > 0.0001 && burstStr > 0.001) {
    let oneMinusBurst = max(1.0 - burstP, 0.0);
    burstSettle = oneMinusBurst * oneMinusBurst * burstStr;
    if (reducedFlag >= 0.5) {
      // Reduced motion: gentle fading brightness lift only (no shockwave ring).
      color += (vec3f(0.065, 0.07, 0.08) + innerPearl * inside * 0.14) * burstSettle;
    } else {
      let ringPhase = burstP / 0.4285714;
      if (ringPhase < 1.0) {
        let oneMinusRing = max(1.0 - ringPhase, 0.0001);
        let ringEase = 1.0 - pow(oneMinusRing, 2.35);
        let maxRadius = mix(0.95, 1.44, burstStr);
        let burstRadius = mix(0.06, maxRadius, ringEase);
        let ringWidth = mix(0.026, 0.095, ringEase);
        let ringDelta = (fDist - burstRadius) / ringWidth;
        let ring = exp(-ringDelta * ringDelta);
        let ringFade = smoothstep(0.0, 0.05, ringPhase) * pow(oneMinusRing, 1.4);
        let radialDir = fDelta / max(fDist, 0.0001);
        let burstDiff = diffraction(radialDir, lightAndView + radialDir * 0.45, 1.45) * (0.45 + 0.55 * illumination);
        let burstPearl = pearlColor(fDist * 1.6 - ringPhase * 1.35 + pearlPhase * 0.45);
        let ringColor = vec3f(0.42, 0.46, 0.52) + burstPearl * 0.68 + burstDiff * 0.58;
        let burstCatch = 0.42 + contours * 0.72 * outside + innerMark.coverage * 1.0 * inside + gapInfo.foilEdge * 0.9;
        color += ringColor * ring * ringFade * burstCatch * (0.45 + 0.95 * burstStr);
      }

      // Foil diffraction settles back to normal over ~1.2s after the ring passes.
      color += (contours * 0.65 * outside * (outerFoil + outerDiffraction * 0.28)
        + innerMark.coverage * inside * (innerFoil + innerDiffraction * 0.36)
        + gapInfo.foilEdge * foilTint * 0.55) * burstSettle * 0.72;
    }
  }

  let outline = evaluateLogoOutline(artworkUv, logoRaw, aa);
  let outlineChargeBoost = select(
    (vec3f(0.36, 0.40, 0.46) + innerPearl * 0.52) * (chargeAmt * 0.92 + fullChargePulse * 0.38)
      + (vec3f(0.32, 0.36, 0.42) + innerPearl * 0.46) * burstSettle * 0.75,
    vec3f(0.24, 0.27, 0.31) * (chargeAmt + burstSettle * 0.8),
    reducedFlag >= 0.5
  );
  color = mix(
    color,
    vec3f(0.29, 0.32, 0.36) + tint * light * 0.16 + innerPearl * idleGlow * 0.32 + outlineChargeBoost,
    outline
  );

  // Subtle FIELDR / AUCTIONS caption sampled from the bottom of the same r8unorm mask texture.
  let caption = sampleCaption(artworkUv);
  color = mix(color, vec3f(0.56, 0.59, 0.64) + tint * light * 0.18, caption * 0.72);
  let mark = p - vec2f(0.505, -0.765);
  let crossMark = min(segment(mark, vec2f(-0.024, 0), vec2f(0.024, 0)), segment(mark, vec2f(0, -0.024), vec2f(0, 0.024)));
  color = mix(color, vec3f(0.48, 0.51, 0.55), stroke(crossMark, 0.0007, aa * 0.65));

  let rim = stroke(edge + 0.002, 0.0008, aa * 0.7);
  let rimLight = pow(max(0.0, 1.0 - length(delta) * 0.65), 3.0) * hover;
  color = mix(color, vec3f(0.25, 0.28, 0.32) + (outerPearl * 0.7 + tint * 0.3) * rimLight * 0.6, rim);
  return vec4f(mix(background, color, silhouette), 1);
}
