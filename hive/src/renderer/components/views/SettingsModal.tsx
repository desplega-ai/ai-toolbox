import React from 'react';
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore, usePreferencesStore } from '@/lib/store';
import type { Preferences } from '../../../shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EDITOR_PRESETS = [
  { label: 'VS Code', value: 'code' },
  { label: 'Cursor', value: 'cursor' },
  { label: 'Sublime Text', value: 'subl' },
  { label: 'Vim', value: 'vim' },
  { label: 'Neovim', value: 'nvim' },
  { label: 'Emacs', value: 'emacs' },
  { label: 'Custom', value: 'custom' },
];

const TERMINAL_PRESETS_MACOS = [
  { label: 'Terminal', value: 'Terminal' },
  { label: 'iTerm2', value: 'iTerm' },
  { label: 'Alacritty', value: 'Alacritty' },
  { label: 'Kitty', value: 'kitty' },
  { label: 'Warp', value: 'Warp' },
  { label: 'Custom', value: 'custom' },
];

const TERMINAL_PRESETS_LINUX = [
  { label: 'GNOME Terminal', value: 'gnome-terminal' },
  { label: 'Konsole', value: 'konsole' },
  { label: 'Alacritty', value: 'alacritty' },
  { label: 'Kitty', value: 'kitty' },
  { label: 'xterm', value: 'xterm' },
  { label: 'Custom', value: 'custom' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme } = useThemeStore();
  const { hideBackfilledSessions, setHideBackfilledSessions } = usePreferencesStore();
  const [editorCommand, setEditorCommand] = React.useState('code');
  const [customEditor, setCustomEditor] = React.useState('');
  const [isCustomEditor, setIsCustomEditor] = React.useState(false);
  const [terminalCommand, setTerminalCommand] = React.useState('Terminal');
  const [customTerminal, setCustomTerminal] = React.useState('');
  const [isCustomTerminal, setIsCustomTerminal] = React.useState(false);
  const [savedEditor, setSavedEditor] = React.useState(false);
  const [savedTerminal, setSavedTerminal] = React.useState(false);
  const [platform, setPlatform] = React.useState<'darwin' | 'linux' | 'win32'>('darwin');

  const terminalPresets = platform === 'darwin' ? TERMINAL_PRESETS_MACOS : TERMINAL_PRESETS_LINUX;

  // Load preferences on open
  React.useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  const loadPreferences = async () => {
    const prefs = await window.electronAPI.invoke<Preferences>('preferences:get');

    // Detect platform from terminal default
    const isMac = prefs.terminalCommand === 'Terminal' ||
                  TERMINAL_PRESETS_MACOS.some(p => p.value === prefs.terminalCommand);
    setPlatform(isMac ? 'darwin' : 'linux');

    // Editor
    const editorCmd = prefs.editorCommand || 'code';
    const editorPreset = EDITOR_PRESETS.find(p => p.value === editorCmd);
    if (editorPreset && editorPreset.value !== 'custom') {
      setEditorCommand(editorCmd);
      setIsCustomEditor(false);
    } else {
      setEditorCommand('custom');
      setCustomEditor(editorCmd);
      setIsCustomEditor(true);
    }

    // Terminal
    const termCmd = prefs.terminalCommand || 'Terminal';
    const presets = isMac ? TERMINAL_PRESETS_MACOS : TERMINAL_PRESETS_LINUX;
    const termPreset = presets.find(p => p.value === termCmd);
    if (termPreset && termPreset.value !== 'custom') {
      setTerminalCommand(termCmd);
      setIsCustomTerminal(false);
    } else {
      setTerminalCommand('custom');
      setCustomTerminal(termCmd);
      setIsCustomTerminal(true);
    }
  };

  const handleEditorChange = (value: string) => {
    setEditorCommand(value);
    setIsCustomEditor(value === 'custom');
    if (value !== 'custom') {
      savePreference('editorCommand', value, setSavedEditor);
    }
  };

  const handleTerminalChange = (value: string) => {
    setTerminalCommand(value);
    setIsCustomTerminal(value === 'custom');
    if (value !== 'custom') {
      savePreference('terminalCommand', value, setSavedTerminal);
    }
  };

  const savePreference = async (key: string, value: string, setSaved: (v: boolean) => void) => {
    await window.electronAPI.invoke('preferences:set', { [key]: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleCustomEditorSave = () => {
    if (customEditor.trim()) {
      savePreference('editorCommand', customEditor.trim(), setSavedEditor);
    }
  };

  const handleCustomTerminalSave = () => {
    if (customTerminal.trim()) {
      savePreference('terminalCommand', customTerminal.trim(), setSavedTerminal);
    }
  };

  const handleHideBackfilledToggle = async () => {
    const newValue = !hideBackfilledSessions;
    setHideBackfilledSessions(newValue);
    await window.electronAPI.invoke('preferences:set', { hideBackfilledSessions: newValue });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 cursor-pointer"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[var(--background)] rounded-lg shadow-xl border border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Theme */}
          <div>
            <h3 className="text-sm font-medium mb-3">Theme</h3>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-4 py-2 rounded border transition-colors cursor-pointer ${
                    theme === t
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                      : 'border-[var(--border)] hover:border-[var(--foreground-muted)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Sessions */}
          <div>
            <h3 className="text-sm font-medium mb-3">Sessions</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={hideBackfilledSessions}
                onClick={handleHideBackfilledToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  hideBackfilledSessions ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    hideBackfilledSessions ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <div>
                <span className="text-sm">Hide CLI sessions</span>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Only show sessions created in Hive, hide backfilled CLI sessions
                </p>
              </div>
            </label>
          </div>

          {/* Editor */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              Editor
              {savedEditor && (
                <span className="ml-2 text-xs text-[var(--success)]">
                  <Check className="inline h-3 w-3 mr-1" />
                  Saved
                </span>
              )}
            </h3>
            <p className="text-xs text-[var(--foreground-muted)] mb-3">
              Command to open projects in your preferred editor
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {EDITOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleEditorChange(preset.value)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors cursor-pointer ${
                    editorCommand === preset.value
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                      : 'border-[var(--border)] hover:border-[var(--foreground-muted)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {isCustomEditor && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customEditor}
                  onChange={(e) => setCustomEditor(e.target.value)}
                  placeholder="e.g., /usr/local/bin/nvim"
                  className="flex-1 px-3 py-2 rounded border border-[var(--border)] bg-[var(--background)] text-sm font-mono focus:outline-none focus:border-[var(--primary)]"
                />
                <Button size="sm" onClick={handleCustomEditorSave} disabled={!customEditor.trim()}>
                  Save
                </Button>
              </div>
            )}
          </div>

          {/* Terminal */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              Terminal
              {savedTerminal && (
                <span className="ml-2 text-xs text-[var(--success)]">
                  <Check className="inline h-3 w-3 mr-1" />
                  Saved
                </span>
              )}
            </h3>
            <p className="text-xs text-[var(--foreground-muted)] mb-3">
              Default terminal for opening sessions and running commands
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {terminalPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleTerminalChange(preset.value)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors cursor-pointer ${
                    terminalCommand === preset.value
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                      : 'border-[var(--border)] hover:border-[var(--foreground-muted)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {isCustomTerminal && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTerminal}
                  onChange={(e) => setCustomTerminal(e.target.value)}
                  placeholder="e.g., /usr/local/bin/alacritty"
                  className="flex-1 px-3 py-2 rounded border border-[var(--border)] bg-[var(--background)] text-sm font-mono focus:outline-none focus:border-[var(--primary)]"
                />
                <Button size="sm" onClick={handleCustomTerminalSave} disabled={!customTerminal.trim()}>
                  Save
                </Button>
              </div>
            )}
          </div>

          {/* Credentials placeholder */}
          <div>
            <h3 className="text-sm font-medium mb-3">Credentials</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Credential configuration coming soon
            </p>
          </div>

          {/* Storage */}
          <div>
            <h3 className="text-sm font-medium mb-3">Storage</h3>
            <p className="text-sm text-[var(--foreground-muted)] font-mono">
              ~/.hive/
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
