import { vim } from "@replit/codemirror-vim";

export function getVimExtension(enabled: boolean) {
  return enabled ? vim() : [];
}
