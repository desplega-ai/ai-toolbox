export function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

export function setParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
  const qs = params.toString();
  history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}
