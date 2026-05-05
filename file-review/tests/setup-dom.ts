import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLPreElement = dom.window.HTMLPreElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.NodeFilter = dom.window.NodeFilter;
g.CustomEvent = dom.window.CustomEvent;
g.Event = dom.window.Event;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;
g.cancelAnimationFrame = (h: number) => clearTimeout(h);
