import { describe, expect, it } from 'bun:test';
import { goBack, goForward, initNavHistory, recordNavigation, type NavLocation } from '../src/nav-history';

describe('nav history', () => {
  it('goes back and forward through recorded jumps', async () => {
    let here: NavLocation = { path: '/a.md', scrollTop: 0 };
    const state = { back: false, forward: false };
    initNavHistory({
      current: () => here,
      restore: async (loc) => {
        here = loc;
      },
      onChange: (b, f) => {
        state.back = b;
        state.forward = f;
      },
    });

    recordNavigation(); // jump from a.md@0 ...
    here = { path: '/b.md', scrollTop: 300 }; // ... to b.md
    recordNavigation(); // jump from b.md@300 ...
    here = { path: '/b.md', scrollTop: 900 }; // ... to an anchor in b.md
    expect(state).toEqual({ back: true, forward: false });

    await goBack();
    expect(here).toEqual({ path: '/b.md', scrollTop: 300 });
    await goBack();
    expect(here).toEqual({ path: '/a.md', scrollTop: 0 });
    expect(state).toEqual({ back: false, forward: true });

    await goForward();
    expect(here).toEqual({ path: '/b.md', scrollTop: 300 });

    recordNavigation(); // a new jump clears forward
    expect(state.forward).toBe(false);
  });
});
