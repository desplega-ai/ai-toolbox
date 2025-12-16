import React from 'react';
import { MainLayout, useTabContext } from '@/components/layout/MainLayout';
import { StartView } from '@/components/views/StartView';
import { ProjectView } from '@/components/views/ProjectView';
import { SettingsModal } from '@/components/views/SettingsModal';
import { GlobalAnalyticsModal } from '@/components/views/GlobalAnalyticsModal';
import { NotificationStack } from '@/components/notifications/NotificationStack';
import { NotificationListModal } from '@/components/notifications/NotificationListModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore, useSessionMessagesStore } from '@/lib/store';
import { useAutocompleteStore } from '@/lib/autocomplete-store';
import { useNotificationStore } from '@/lib/notification-store';
import type { Session, InAppNotification } from '../shared/types';
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
  const updateSessionClaudeSessionId = useAppStore((state) => state.updateSessionClaudeSessionId);

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

      // Capture commands and session ID from init message
      if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        const initMessage = message as SDKInitMessage;
        console.log('[Autocomplete] Init message received:', JSON.stringify(initMessage, null, 2));

        // Update the session's claudeSessionId so follow-up messages reuse it
        if (initMessage.session_id) {
          updateSessionClaudeSessionId(sessionId, initMessage.session_id);
        }

        if (initMessage.slash_commands) {
          console.log('[Autocomplete] Setting commands:', initMessage.slash_commands);
          setCommands(initMessage.slash_commands);
        } else {
          console.log('[Autocomplete] No slash_commands in init message');
        }
      }

      // Add message to store
      console.log(`[App] Adding message to store:`, { sessionId, type: message.type, subtype: 'subtype' in message ? message.subtype : undefined });
      addMessage(sessionId, message);
    });

    return () => {
      unsubMessage();
    };
  }, [addMessage, appendStreamingText, clearStreamingText, setCommands, updateSessionClaudeSessionId]);
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

// Global listener for session name updates
function useGlobalSessionNameListener() {
  const updateSessionName = useAppStore((state) => state.updateSessionName);

  React.useEffect(() => {
    const unsub = window.electronAPI.on('session:name', (data: unknown) => {
      const { sessionId, name } = data as { sessionId: string; name: string };
      updateSessionName(sessionId, name);
    });

    return () => {
      unsub();
    };
  }, [updateSessionName]);
}

// Global listener for session actionType updates
function useGlobalSessionActionTypeListener() {
  const updateSessionActionType = useAppStore((state) => state.updateSessionActionType);

  React.useEffect(() => {
    const unsub = window.electronAPI.on('session:actionType', (data: unknown) => {
      const { sessionId, actionType } = data as { sessionId: string; actionType: Session['actionType'] };
      updateSessionActionType(sessionId, actionType);
    });

    return () => {
      unsub();
    };
  }, [updateSessionActionType]);
}

// Global listener for in-app notifications
function useGlobalNotificationListener() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  React.useEffect(() => {
    const unsub = window.electronAPI.on('notification:show', (data: unknown) => {
      const notif = data as Omit<InAppNotification, 'id' | 'timestamp' | 'read'>;
      addNotification(notif);
    });

    return () => unsub();
  }, [addNotification]);
}

export function App() {
  const [showSettings, setShowSettings] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(false);

  // Listen for global session events (messages, status, name, actionType)
  useGlobalSessionMessageListener();
  useGlobalSessionStatusListener();
  useGlobalSessionNameListener();
  useGlobalSessionActionTypeListener();
  useGlobalNotificationListener();

  // Notification modal state
  const showNotificationList = useNotificationStore((s) => s.showNotificationList);
  const setShowNotificationList = useNotificationStore((s) => s.setShowNotificationList);

  // Handle notification click - navigate to the session
  const handleNotificationClick = React.useCallback((notification: InAppNotification) => {
    // Dispatch custom event that MainLayout can handle to focus the session
    window.dispatchEvent(
      new CustomEvent('focus-session', { detail: { sessionId: notification.sessionId } })
    );
  }, []);

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
      <NotificationStack onNotificationClick={handleNotificationClick} />
      <NotificationListModal
        isOpen={showNotificationList}
        onClose={() => setShowNotificationList(false)}
        onNotificationClick={handleNotificationClick}
      />
    </TooltipProvider>
  );
}
