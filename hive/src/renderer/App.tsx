import React from 'react';
import { MainLayout, useTabContext } from '@/components/layout/MainLayout';
import { StartView } from '@/components/views/StartView';
import { ProjectView } from '@/components/views/ProjectView';
import { SettingsModal } from '@/components/views/SettingsModal';
import { GlobalAnalyticsModal } from '@/components/views/GlobalAnalyticsModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore, useSessionMessagesStore } from '@/lib/store';
import { useAutocompleteStore } from '@/lib/autocomplete-store';
import type { Session } from '../shared/types';
import type { SDKMessage, SDKStreamEvent, SDKInitMessage } from '../shared/sdk-types';

function AppContent() {
  const { currentProject } = useTabContext();
  return currentProject ? <ProjectView /> : <StartView />;
}

// Global listener for session messages - ensures messages are captured even when tab is not active
function useGlobalSessionMessageListener() {
  const addMessage = useSessionMessagesStore((state) => state.addMessage);
  const appendStreamingText = useSessionMessagesStore((state) => state.appendStreamingText);
  const clearStreamingText = useSessionMessagesStore((state) => state.clearStreamingText);
  const setCommands = useAutocompleteStore((state) => state.setCommands);

  React.useEffect(() => {
    const unsubMessage = window.electronAPI.on('session:message', (data: unknown) => {
      const { sessionId, message } = data as { sessionId: string; message: SDKMessage };

      // Handle streaming events
      if (message.type === 'stream_event') {
        const streamEvent = message as SDKStreamEvent;
        if (streamEvent.event.type === 'content_block_delta' && streamEvent.event.delta?.text) {
          appendStreamingText(sessionId, streamEvent.event.delta.text);
        }
        return;
      }

      // Clear streaming text when we get full assistant message
      if (message.type === 'assistant') {
        clearStreamingText(sessionId);
      }

      // Capture commands from init message
      if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        const initMessage = message as SDKInitMessage;
        console.log('[Autocomplete] Init message received:', JSON.stringify(initMessage, null, 2));
        if (initMessage.slash_commands) {
          console.log('[Autocomplete] Setting commands:', initMessage.slash_commands);
          setCommands(initMessage.slash_commands);
        } else {
          console.log('[Autocomplete] No slash_commands in init message');
        }
      }

      // Add message to store
      addMessage(sessionId, message);
    });

    return () => {
      unsubMessage();
    };
  }, [addMessage, appendStreamingText, clearStreamingText, setCommands]);
}

// Global listener for session status updates
function useGlobalSessionStatusListener() {
  const updateSessionStatus = useAppStore((state) => state.updateSessionStatus);

  React.useEffect(() => {
    const unsubStatus = window.electronAPI.on('session:status', (data: unknown) => {
      const { sessionId, status } = data as { sessionId: string; status: Session['status'] };
      updateSessionStatus(sessionId, status);
    });

    return () => {
      unsubStatus();
    };
  }, [updateSessionStatus]);
}

export function App() {
  const [showSettings, setShowSettings] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(false);

  // Listen for global session events (messages + status)
  useGlobalSessionMessageListener();
  useGlobalSessionStatusListener();

  React.useEffect(() => {
    const settingsHandler = () => setShowSettings(true);
    const analyticsHandler = () => setShowAnalytics(true);
    window.addEventListener('open-settings', settingsHandler);
    window.addEventListener('open-analytics', analyticsHandler);
    return () => {
      window.removeEventListener('open-settings', settingsHandler);
      window.removeEventListener('open-analytics', analyticsHandler);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <MainLayout>
        <AppContent />
      </MainLayout>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <GlobalAnalyticsModal isOpen={showAnalytics} onClose={() => setShowAnalytics(false)} />
    </TooltipProvider>
  );
}
