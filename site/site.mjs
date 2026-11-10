import { installTheme } from './theme.mjs';
installTheme(document.body, document.querySelector('#theme'));
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Animated examples remain explicitly available as downloads; avoid presenting
  // an unpausable GIF automatically when the reader requests reduced motion.
  for (const details of document.querySelectorAll('.media-card details')) details.remove();
}
