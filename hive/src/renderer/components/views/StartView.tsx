import React from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useTabContext } from '@/components/layout/MainLayout';
import type { Project, Session } from '../../../shared/types';

export function StartView() {
  const { setCurrentProject } = useTabContext();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [sessionCounts, setSessionCounts] = React.useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    loadProjects();
  }, []);

  // Listen for Cmd+O to open project selector
  React.useEffect(() => {
    const handler = () => handleAddProject();
    window.addEventListener('open-project-selector', handler);
    return () => window.removeEventListener('open-project-selector', handler);
  }, [projects]);

  const loadProjects = async () => {
    try {
      const result = await window.electronAPI.invoke<Project[]>('db:projects:list');
      setProjects(result);

      // Load session counts for each project
      const counts: Record<string, number> = {};
      await Promise.all(
        result.map(async (project) => {
          const sessions = await window.electronAPI.invoke<Session[]>('db:sessions:list', {
            projectId: project.id,
          });
          counts[project.id] = sessions.length;
        })
      );
      setSessionCounts(counts);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProject = async () => {
    const directory = await window.electronAPI.invoke<string | null>('dialog:open-directory');
    if (!directory) return;

    const name = directory.split('/').pop() || 'Unnamed Project';
    try {
      const project = await window.electronAPI.invoke<Project>('db:projects:create', {
        name,
        directory,
        settings: {},
      });
      setProjects([project, ...projects]);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Projects Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Your Projects
            </h2>
            <Button onClick={handleAddProject} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Project
            </Button>
          </div>

          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-[var(--foreground-muted)] mb-4">
                  No projects yet. Add a project to get started.
                </p>
                <Button onClick={handleAddProject}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:border-[var(--primary)] transition-colors"
                  onClick={() => handleSelectProject(project)}
                >
                  <CardHeader>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <CardDescription className="truncate">
                      {project.directory}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {sessionCounts[project.id] ?? 0} session{sessionCounts[project.id] !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
