type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const win = window as Window & {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return win.AudioContext || win.webkitAudioContext || null
}

interface ActiveChargeHum {
  oscLow: OscillatorNode
  oscHarm: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
}

/**
 * Subtle synthesized WebAudio engine for /pack (OFF by default).
 * Lazily opens AudioContext only after an explicit user gesture and suspends cleanly when tab hides.
 */
export class PackAudioEngine {
  private ctx: AudioContext | null = null
  private enabled = false
  private paused = false
  private hum: ActiveChargeHum | null = null

  setEnabled(next: boolean, fromUserGesture: boolean): void {
    this.enabled = next
    if (!next) {
      this.stopChargeHum(true)
      return
    }
    if (fromUserGesture && !this.paused) {
      this.ensureContext()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setPaused(hidden: boolean): void {
    this.paused = hidden
    if (hidden) {
      this.stopChargeHum(true)
      if (this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => undefined)
      }
      return
    }
    if (this.enabled && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined)
    }
  }

  unlock(): void {
    if (!this.enabled || this.paused) return
    this.ensureContext()
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || this.paused) return null
    if (!this.ctx) {
      const Ctor = getAudioContextCtor()
      if (!Ctor) return null
      try {
        this.ctx = new Ctor()
      } catch {
        return null
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined)
    }
    return this.ctx
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    return buffer
  }

  /** Soft rising graphite hum while charging the pack seam */
  startChargeHum(): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    if (this.hum) return

    const now = ctx.currentTime
    const oscLow = ctx.createOscillator()
    const oscHarm = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()

    oscLow.type = 'sine'
    oscLow.frequency.setValueAtTime(118, now)

    oscHarm.type = 'triangle'
    oscHarm.frequency.setValueAtTime(236, now)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(320, now)
    filter.Q.setValueAtTime(1.8, now)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.018, now + 0.08)

    oscLow.connect(filter)
    oscHarm.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    oscLow.start(now)
    oscHarm.start(now)

    this.hum = { oscLow, oscHarm, filter, gain }
  }

  updateChargeHum(charge: number): void {
    if (!this.hum || !this.ctx || !this.enabled || this.paused) return
    const c = Math.max(0, Math.min(1, charge))
    const now = this.ctx.currentTime
    const baseFreq = 118 + c * 150
    this.hum.oscLow.frequency.setTargetAtTime(baseFreq, now, 0.03)
    this.hum.oscHarm.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.03)
    this.hum.filter.frequency.setTargetAtTime(320 + c * 1280, now, 0.04)
    this.hum.gain.gain.setTargetAtTime(0.014 + c * 0.026, now, 0.04)
  }

  stopChargeHum(immediate = false): void {
    const active = this.hum
    this.hum = null
    if (!active || !this.ctx) return
    const now = this.ctx.currentTime
    const fadeSec = immediate ? 0.03 : 0.14
    try {
      active.gain.gain.cancelScheduledValues(now)
      active.gain.gain.setValueAtTime(Math.max(0.0001, active.gain.gain.value), now)
      active.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec)
      active.oscLow.stop(now + fadeSec + 0.02)
      active.oscHarm.stop(now + fadeSec + 0.02)
    } catch {
      // Ignore stop errors if node already stopped
    }
  }

  /** Crisp progressive foil tear across the top seam */
  playFoilTear(): void {
    this.stopChargeHum(false)
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime
    const dur = 0.48

    const noise = ctx.createBufferSource()
    noise.buffer = this.createNoiseBuffer(ctx, dur)

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(1800, now)
    hp.frequency.exponentialRampToValueAtTime(4800, now + dur)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(7600, now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0006, now)
    gain.gain.linearRampToValueAtTime(0.055, now + 0.04)
    gain.gain.linearRampToValueAtTime(0.042, now + dur * 0.65)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    noise.connect(hp)
    hp.connect(lp)
    lp.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + dur)
  }

  /** Warm muted thud as stack or cards settle */
  playCardLand(): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(108, now)
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.14)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(185, now)

    gain.gain.setValueAtTime(0.0008, now)
    gain.gain.linearRampToValueAtTime(0.068, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.19)

    // Subtle cardstock contact transient
    const dur = 0.045
    const noise = ctx.createBufferSource()
    noise.buffer = this.createNoiseBuffer(ctx, dur)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(420, now)
    bp.Q.setValueAtTime(1.2, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0005, now)
    noiseGain.gain.linearRampToValueAtTime(0.016, now + 0.008)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    noise.connect(bp)
    bp.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + dur)
  }

  /** Quiet two-note crystalline chime for premium card reveals */
  playPremiumChime(): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime
    const notes = [659.25, 987.77]

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.15
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(0.032, start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.15)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 1.2)
    })
  }

  dispose(): void {
    this.stopChargeHum(true)
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
  }
}
