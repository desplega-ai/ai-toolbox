export type TabType = 'query' | 'dashboard';

export type BlockType = 'sql'; // Future: | 'text'

export interface NotebookBlock {
  id: string;
  type: BlockType;
  content: string;
  // Auto-generated name for referencing in subsequent blocks (e.g., q1, q2)
  name: string;
  // Result state (not persisted, but useful for in-memory)
  collapsed?: boolean;
}

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  // Legacy single SQL (for migration)
  sql?: string;
  // New notebook blocks
  blocks?: NotebookBlock[];
  // For dashboard tabs
  dashboardId?: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}
