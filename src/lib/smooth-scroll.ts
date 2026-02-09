/**
 * Custom smooth scroll with configurable duration.
 * Uses requestAnimationFrame and easeInOutCubic easing for a snappy feel.
 */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function smoothScrollTo(
  element: HTMLElement,
  durationMs: number,
  offset: number = 0
): Promise<void> {
  return new Promise((resolve) => {
    const startY = window.scrollY;
    const elementTop = element.getBoundingClientRect().top + startY;
    const targetY = Math.max(0, elementTop - offset);
    const distance = targetY - startY;

    if (Math.abs(distance) < 1) {
      resolve();
      return;
    }

    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easeInOutCubic(progress);

      window.scrollTo(0, startY + distance * easedProgress);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}
