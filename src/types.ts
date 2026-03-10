export interface Person {
  id: string;
  name: string;
  avatar: string; // initials or emoji
  color: string;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  startDate?: string;
  endDate?: string;
  assigneeIds?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  startDate: string; // ISO date string
  endDate: string;
  progress: number; // 0-100, auto-computed from subtasks
  subtasks: Subtask[];
  assigneeIds: string[];
  categoryIds: string[];
  projectIds: string[];
  dependencyIds: string[]; // task IDs this task depends on
  parentId: string | null;
  children: string[]; // child task IDs
  milestoneId: string | null;
  order: number;
  collapsed: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  date: string; // ISO date string
  projectId: string;
  taskIds: string[];
  color: string;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string;
  order: number;
}

export type SidebarSection = 'projects' | 'people' | 'categories' | 'milestones';

export interface GanttState {
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  milestones: Record<string, Milestone>;
  people: Record<string, Person>;
  categories: Record<string, Category>;
  activeProjectId: string | null;
  selectedTaskId: string | null;
  viewMode: 'gantt' | 'dashboard';
  timelineStartDate: string;
  timelineEndDate: string;
  zoomLevel: 'day' | 'week' | 'month';
  sidebarSection: SidebarSection;
  sidebarFilterId: string | null;
  editingItemId: string | null;
  editingItemType: SidebarSection | null;
}

/** Compute progress from subtasks: no subtasks = 0% */
export function computeProgress(task: Task): number {
  if (!task.subtasks || task.subtasks.length === 0) return 0;
  const done = task.subtasks.filter((s) => s.done).length;
  return Math.round((done / task.subtasks.length) * 100);
}

export type TaskStatus = 'on-track' | 'at-risk' | 'behind' | 'completed';

export function getTaskStatus(task: Task): TaskStatus {
  if (task.progress >= 100) return 'completed';
  const now = new Date();
  const end = new Date(task.endDate);
  const start = new Date(task.startDate);
  const totalDuration = end.getTime() - start.getTime();
  if (totalDuration <= 0) return 'on-track';
  const elapsed = now.getTime() - start.getTime();
  const expectedProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  const diff = expectedProgress - task.progress;
  if (diff > 25) return 'behind';
  if (diff > 10) return 'at-risk';
  return 'on-track';
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'completed': return '#9ca3af'; // gray
    case 'on-track': return '#10b981';  // green
    case 'at-risk': return '#f59e0b';   // yellow
    case 'behind': return '#ef4444';    // red
  }
}
