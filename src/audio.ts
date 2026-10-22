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
