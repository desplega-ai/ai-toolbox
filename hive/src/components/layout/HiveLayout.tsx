import { Panel, PanelGroup } from 'react-resizable-panels'
import { PanelResizeHandle } from './PanelResizeHandle'
import { Sidebar } from '../sidebar/Sidebar'
import { SessionPane } from '../session/SessionPane'
import { ThoughtsPane } from '../thoughts/ThoughtsPane'
import { useState, useEffect } from 'react'
import { saveLastProject } from '../../lib/layout-store'
import type { WorkingDirectory } from '../../lib/types'

type RightTab = 'session' | 'thoughts'

interface Props {
  initialProjectPath?: string | null
}

export function HiveLayout({ initialProjectPath }: Props) {
  const [selectedDir, setSelectedDir] = useState<WorkingDirectory | null>(null)
  const [activeTab, setActiveTab] = useState<RightTab>('session')

  // Initialize from saved project path
  useEffect(() => {
    if (initialProjectPath) {
      const name = initialProjectPath.split('/').pop() || initialProjectPath
      setSelectedDir({ path: initialProjectPath, name })
    }
  }, [initialProjectPath])

  // Save selected project when it changes
  useEffect(() => {
    saveLastProject(selectedDir?.path || null)
  }, [selectedDir])

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100">
      <PanelGroup direction="horizontal" autoSaveId="hive-main">
        <Panel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={35}>
          <Sidebar
            selectedDir={selectedDir}
            onSelectDir={setSelectedDir}
          />
        </Panel>

        <PanelResizeHandle />

        <Panel id="content" order={2}>
          <div className="h-full flex flex-col">
            {/* Tab bar */}
            <div className="flex border-b border-gray-700 bg-gray-900">
              <button
                onClick={() => setActiveTab('session')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'session'
                    ? 'text-white border-b-2 border-blue-500 -mb-px'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Session
              </button>
              <button
                onClick={() => setActiveTab('thoughts')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'thoughts'
                    ? 'text-white border-b-2 border-blue-500 -mb-px'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Thoughts
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'session' ? (
                <SessionPane workingDir={selectedDir} />
              ) : (
                <ThoughtsPane workingDir={selectedDir} />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
