let context: AudioContext | undefined;
export function tone(frequency: number, volume: number, duration = 0.05) {
  if (!volume) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const o = context.createOscillator(),
      g = context.createGain();
    o.type = "sine";
    o.frequency.value = frequency;
    g.gain.setValueAtTime(volume * 0.2, context.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    o.connect(g);
    g.connect(context.destination);
    o.start();
    o.stop(context.currentTime + duration);
  } catch {
    /* Audio is optional. */
  }
}
export function fanfare(volume: number) {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => tone(f, volume, 0.2), i * 130),
  );
}
export function chargingAudio(volume: number) {
  let oscillator: OscillatorNode | undefined, gain: GainNode | undefined;
  if (volume)
    try {
      context ??= new AudioContext();
      void context.resume();
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 100;
      gain.gain.value = volume * 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
    } catch {
      /* Sound is optional. */
    }
  let stopped = false;
  return {
    update(p: number) {
      if (!stopped && oscillator && context && gain) {
        oscillator.frequency.setTargetAtTime(
          100 + p * 620,
          context.currentTime,
          0.04,
        );
        gain.gain.setTargetAtTime(
          volume * (0.08 + p * 0.12),
          context.currentTime,
          0.04,
        );
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (oscillator && gain && context) {
        gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.035);
        oscillator.stop(context.currentTime + 0.18);
      }
    },
  };
}
