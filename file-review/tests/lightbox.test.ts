import { describe, expect, it } from 'bun:test';
import { closeLightbox, openLightbox } from '../src/lightbox';

function press(key: string) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

describe('lightbox', () => {
  it('swallows keys while open and closes on Escape', async () => {
    let leaked = 0;
    const onDocKey = () => leaked++;
    document.addEventListener('keydown', onDocKey);

    openLightbox({
      kind: 'image',
      src: 'data:image/png;base64,',
      caption: 'first',
      items: [
        { src: 'data:image/png;base64,', caption: 'first' },
        { src: 'data:image/png;base64,', caption: 'second', path: '/tmp/b.png' },
      ],
      index: 0,
    });
    const overlay = document.querySelector('.lightbox')!;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.querySelector('.lightbox-caption')!.textContent).toBe('first1 / 2');

    press('j');
    press('ArrowRight');
    expect(overlay.querySelector('.lightbox-caption')!.textContent).toBe('second2 / 2');
    expect(leaked).toBe(0);
    expect(overlay.querySelector<HTMLElement>('[data-action="download"]')!.hidden).toBe(true);

    expect(press('Escape').defaultPrevented).toBe(true);
    press('j');
    expect(leaked).toBe(1);

    await new Promise((r) => setTimeout(r, 200));
    expect(document.querySelector('.lightbox')).toBeNull();
    document.removeEventListener('keydown', onDocKey);
    closeLightbox();
  });
});
