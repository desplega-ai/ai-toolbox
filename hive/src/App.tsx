import { useEffect, useState } from 'react'
import { HiveLayout } from './components/layout/HiveLayout'
import { loadLastProject } from './lib/layout-store'

function App() {
  const [ready, setReady] = useState(false)
  const [initialProject, setInitialProject] = useState<string | null>(null)

  useEffect(() => {
    loadLastProject()
      .then(setInitialProject)
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading...
      </div>
    )
  }

  return <HiveLayout initialProjectPath={initialProject} />
}

export default App
