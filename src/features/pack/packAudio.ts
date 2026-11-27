type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const win = window as Window & {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return win.AudioContext || win.webkitAudioContext || null
}

/**
 * Very subtle synthesized WebAudio engine for /pack (OFF by default).
 * Starts AudioContext lazily only after an explicit user gesture.
 */
export class PackAudioEngine {
  private ctx: AudioContext | null = null
  private enabled = false

  setEnabled(next: boolean, fromUserGesture: boolean): void {
    this.enabled = next
    if (next && fromUserGesture) {
      this.ensureContext()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  unlock(): void {
    if (!this.enabled) return
    this.ensureContext()
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null
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

  /** Subtle low filtered breath during pack anticipation */
  playPackBuild(durationSec = 0.8): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime
    const noise = ctx.createBufferSource()
    noise.buffer = this.createNoiseBuffer(ctx, durationSec)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.setValueAtTime(3.4, now)
    filter.frequency.setValueAtTime(220, now)
    filter.frequency.exponentialRampToValueAtTime(920, now + durationSec)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.028, now + durationSec * 0.78)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + durationSec)
  }

  /** Soft foil tear along the top pack seam */
  playPackTear(): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime
    const dur = 0.34

    const noise = ctx.createBufferSource()
    noise.buffer = this.createNoiseBuffer(ctx, dur)

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(2000, now)
    hp.frequency.exponentialRampToValueAtTime(4600, now + dur)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(7200, now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0006, now)
    gain.gain.linearRampToValueAtTime(0.065, now + 0.035)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    noise.connect(hp)
    hp.connect(lp)
    lp.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + dur)
  }

  /** Muted thud when a card lands on stage or in the finale spread */
  playCardLand(): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Warm, damped low-end body thump
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(112, now)
    osc.frequency.exponentialRampToValueAtTime(46, now + 0.14)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(190, now)

    gain.gain.setValueAtTime(0.0008, now)
    gain.gain.linearRampToValueAtTime(0.075, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.19)

    // Tiny muted cardstock contact transient
    const dur = 0.045
    const noise = ctx.createBufferSource()
    noise.buffer = this.createNoiseBuffer(ctx, dur)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(420, now)
    bp.Q.setValueAtTime(1.2, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0005, now)
    noiseGain.gain.linearRampToValueAtTime(0.018, now + 0.008)
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
    // Pure fifth (E5 -> B5), very gentle envelope
    const notes = [659.25, 987.77]

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.14
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(0.034, start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 1.15)
    })
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
  }
}
