import { v4 as uuidv4 } from 'uuid';
import type { GanttState, Task, Project, Milestone, Person, Category } from './types';
import { computeProgress, MAX_TASK_DEPTH } from './types';

const STORAGE_KEY = 'hideGantt-state';

function createDefaultState(): GanttState {
  const projectId = uuidv4();
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);

  return {
    tasks: {},
    projects: {
      [projectId]: {
        id: projectId,
        name: 'My Project',
        color: '#6366f1',
        description: '',
        order: 0,
      },
    },
    milestones: {},
    people: {},
    categories: {},
    activeProjectId: projectId,
    selectedTaskId: null,
    viewMode: 'gantt',
    timelineStartDate: startDate.toISOString().split('T')[0],
    timelineEndDate: endDate.toISOString().split('T')[0],
    zoomLevel: 'week',
    sidebarSection: 'projects',
    sidebarFilterId: null,
    editingItemId: null,
    editingItemType: null,
    hiddenGroupIds: [],
  };
}

export function loadState(): GanttState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = { ...createDefaultState(), ...parsed };
      // Ensure new fields have valid defaults
      if (!merged.sidebarSection) merged.sidebarSection = 'projects';
      if (merged.sidebarFilterId === undefined) merged.sidebarFilterId = null;

      // Migrate tasks: categoryId→categoryIds, subtasks[]→child Tasks
      for (const [id, t] of Object.entries(merged.tasks)) {
        const task = t as any;
        // Migrate categoryId (single) → categoryIds (array)
        if (task.categoryId !== undefined && !task.categoryIds) {
          task.categoryIds = task.categoryId ? [task.categoryId] : [];
          delete task.categoryId;
        }
        if (!task.categoryIds) task.categoryIds = [];
        if (!task.children) task.children = [];
        if (task.parentId === undefined) task.parentId = null;
        if (task.collapsed === undefined) task.collapsed = false;
        if (task.actualStartDate === undefined) task.actualStartDate = null;
        if (task.actualEndDate === undefined) task.actualEndDate = null;
        (merged.tasks as Record<string, Task>)[id] = task;
      }

      // Migrate subtasks[] → child Task entries
      const tasksToMigrate = Object.values(merged.tasks).filter((t: any) => t.subtasks && t.subtasks.length > 0);
      for (const parent of tasksToMigrate as any[]) {
        for (let i = 0; i < parent.subtasks.length; i++) {
          const sub = parent.subtasks[i];
          // Skip if already migrated (child task with this id exists)
          if (merged.tasks[sub.id]) continue;
          const childTask: Task = {
            id: sub.id,
            title: sub.title,
            description: '',
            startDate: sub.startDate || parent.startDate,
            endDate: sub.endDate || parent.endDate,
            progress: sub.done ? 100 : 0,
            assigneeIds: sub.assigneeIds || [],
            categoryIds: [],
            projectIds: [...parent.projectIds],
            dependencyIds: [],
            parentId: parent.id,
            children: [],
            milestoneId: null,
            actualStartDate: null,
            actualEndDate: null,
            order: i,
            collapsed: false,
          };
          merged.tasks[sub.id] = childTask;
          if (!parent.children.includes(sub.id))
            parent.children.push(sub.id);
        }
        delete parent.subtasks;
      }

      // Clean up subtasks field from all tasks
      for (const task of Object.values(merged.tasks) as any[]) {
        delete task.subtasks;
      }

      // Recompute progress for all tasks
      for (const [id, t] of Object.entries(merged.tasks)) {
        const task = t as Task;
        if (task.children.length > 0)
          task.progress = computeProgress(task, merged.tasks as Record<string, Task>);
        (merged.tasks as Record<string, Task>)[id] = task;
      }

      // Migrate: add order field to projects, people, categories, milestones
      let idx = 0;
      for (const p of Object.values(merged.projects) as any[]) {
        if (p.order === undefined) p.order = idx++;
      }
      idx = 0;
      for (const p of Object.values(merged.people) as any[]) {
        if (p.order === undefined) p.order = idx++;
      }
      idx = 0;
      for (const c of Object.values(merged.categories) as any[]) {
        if (c.order === undefined) c.order = idx++;
      }
      idx = 0;
      for (const m of Object.values(merged.milestones) as any[]) {
        if (m.order === undefined) m.order = idx++;
      }
      return merged;
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return createDefaultState();
}

export function saveState(state: GanttState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

export function createTask(
  state: GanttState,
  partial: Partial<Task> & { title: string }
): GanttState {
  const id = uuidv4();
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const projectIds = partial.projectIds?.length
    ? partial.projectIds
    : state.activeProjectId
      ? [state.activeProjectId]
      : [];

  // For child tasks, inherit order within siblings
  const siblingCount = partial.parentId
    ? (state.tasks[partial.parentId]?.children.length ?? 0)
    : Object.values(state.tasks).filter((t) => !t.parentId).length;

  const task: Task = {
    id,
    title: partial.title,
    description: partial.description ?? '',
    startDate: partial.startDate ?? now.toISOString().split('T')[0],
    endDate: partial.endDate ?? nextWeek.toISOString().split('T')[0],
    progress: partial.progress ?? 0,
    assigneeIds: partial.assigneeIds ?? [],
    categoryIds: partial.categoryIds ?? [],
    projectIds,
    dependencyIds: partial.dependencyIds ?? [],
    parentId: partial.parentId ?? null,
    children: [],
    milestoneId: partial.milestoneId ?? null,
    actualStartDate: partial.actualStartDate ?? null,
    actualEndDate: partial.actualEndDate ?? null,
    order: siblingCount,
    collapsed: false,
  };

  const newTasks = { ...state.tasks, [id]: task };

  if (task.parentId && newTasks[task.parentId]) {
    const parent = newTasks[task.parentId];
    newTasks[task.parentId] = {
      ...parent,
      children: [...parent.children, id],
    };
    // Recompute parent progress
    newTasks[task.parentId].progress = computeProgress(newTasks[task.parentId], newTasks);
  }

  return { ...state, tasks: newTasks };
}

export function updateTask(
  state: GanttState,
  taskId: string,
  updates: Partial<Task>
): GanttState {
  const task = state.tasks[taskId];
  if (!task) return state;

  const merged = { ...task, ...updates, id: taskId };

  const newTasks = {
    ...state.tasks,
    [taskId]: merged,
  };

  // Recompute progress up the parent chain
  recomputeProgressChain(newTasks, taskId);

  return { ...state, tasks: newTasks };
}

/** Recompute progress for a task and all its ancestors */
function recomputeProgressChain(tasks: Record<string, Task>, taskId: string): void {
  let currentId: string | null = taskId;
  while (currentId) {
    const task: Task | undefined = tasks[currentId];
    if (!task) break;
    if (task.children.length > 0)
      task.progress = computeProgress(task, tasks);
    currentId = task.parentId;
  }
}

export function deleteTask(state: GanttState, taskId: string): GanttState {
  const task = state.tasks[taskId];
  if (!task) return state;

  const newTasks = { ...state.tasks };

  // Remove from parent
  if (task.parentId && newTasks[task.parentId]) {
    newTasks[task.parentId] = {
      ...newTasks[task.parentId],
      children: newTasks[task.parentId].children.filter((id) => id !== taskId),
    };
  }

  // Recursively delete children
  const deleteChildren = (id: string) => {
    const t = newTasks[id];
    if (t) {
      t.children.forEach(deleteChildren);
      delete newTasks[id];
    }
  };
  deleteChildren(taskId);

  // Recompute parent progress after deletion
  if (task.parentId && newTasks[task.parentId])
    recomputeProgressChain(newTasks, task.parentId);

  // Remove from milestones
  const newMilestones = { ...state.milestones };
  for (const [mId, m] of Object.entries(newMilestones)) {
    if (m.taskIds.includes(taskId)) {
      newMilestones[mId] = {
        ...m,
        taskIds: m.taskIds.filter((id) => id !== taskId),
      };
    }
  }

  // Remove dependency references
  for (const [tId, t] of Object.entries(newTasks)) {
    if (t.dependencyIds.includes(taskId)) {
      newTasks[tId] = {
        ...t,
        dependencyIds: t.dependencyIds.filter((id) => id !== taskId),
      };
    }
  }

  return { ...state, tasks: newTasks, milestones: newMilestones };
}

export function createProject(
  state: GanttState,
  name: string,
  color: string
): GanttState {
  const id = uuidv4();
  const project: Project = { id, name, color, description: '', order: Object.keys(state.projects).length };
  return {
    ...state,
    projects: { ...state.projects, [id]: project },
  };
}

export function updateProject(
  state: GanttState,
  projectId: string,
  updates: Partial<Project>
): GanttState {
  const project = state.projects[projectId];
  if (!project) return state;
  return {
    ...state,
    projects: {
      ...state.projects,
      [projectId]: { ...project, ...updates, id: projectId },
    },
  };
}

export function deleteProject(state: GanttState, projectId: string): GanttState {
  const newProjects = { ...state.projects };
  delete newProjects[projectId];

  const newTasks = { ...state.tasks };
  for (const [tId, t] of Object.entries(newTasks)) {
    const filtered = t.projectIds.filter((id) => id !== projectId);
    if (filtered.length !== t.projectIds.length)
      newTasks[tId] = { ...t, projectIds: filtered };
  }

  const newMilestones = { ...state.milestones };
  for (const [mId, m] of Object.entries(newMilestones)) {
    if (m.projectId === projectId) delete newMilestones[mId];
  }

  return {
    ...state,
    projects: newProjects,
    tasks: newTasks,
    milestones: newMilestones,
    activeProjectId:
      state.activeProjectId === projectId
        ? Object.keys(newProjects)[0] ?? null
        : state.activeProjectId,
  };
}

export function createMilestone(
  state: GanttState,
  title: string,
  date: string,
  projectId: string,
  color: string
): GanttState {
  const id = uuidv4();
  const milestone: Milestone = { id, title, date, projectId, taskIds: [], color, order: Object.keys(state.milestones).length };
  return {
    ...state,
    milestones: { ...state.milestones, [id]: milestone },
  };
}

export function updateMilestone(
  state: GanttState,
  milestoneId: string,
  updates: Partial<Milestone>
): GanttState {
  const milestone = state.milestones[milestoneId];
  if (!milestone) return state;
  return {
    ...state,
    milestones: {
      ...state.milestones,
      [milestoneId]: { ...milestone, ...updates, id: milestoneId },
    },
  };
}

export function deleteMilestone(state: GanttState, milestoneId: string): GanttState {
  const newMilestones = { ...state.milestones };
  delete newMilestones[milestoneId];

  const newTasks = { ...state.tasks };
  for (const [tId, t] of Object.entries(newTasks)) {
    if (t.milestoneId === milestoneId)
      newTasks[tId] = { ...t, milestoneId: null };
  }

  return { ...state, milestones: newMilestones, tasks: newTasks };
}

export function createPerson(
  state: GanttState,
  name: string,
  color: string
): GanttState {
  const id = uuidv4();
  const avatar = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const person: Person = { id, name, avatar, color, order: Object.keys(state.people).length };
  return {
    ...state,
    people: { ...state.people, [id]: person },
  };
}

export function updatePerson(
  state: GanttState,
  personId: string,
  updates: Partial<Person>
): GanttState {
  const person = state.people[personId];
  if (!person) return state;
  const newPerson = { ...person, ...updates, id: personId };
  if (updates.name) {
    newPerson.avatar = updates.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return {
    ...state,
    people: { ...state.people, [personId]: newPerson },
  };
}

export function deletePerson(state: GanttState, personId: string): GanttState {
  const newPeople = { ...state.people };
  delete newPeople[personId];

  const newTasks = { ...state.tasks };
  for (const [tId, t] of Object.entries(newTasks)) {
    const filtered = t.assigneeIds.filter((id) => id !== personId);
    if (filtered.length !== t.assigneeIds.length)
      newTasks[tId] = { ...t, assigneeIds: filtered };
  }

  return { ...state, people: newPeople, tasks: newTasks };
}

export function createCategory(
  state: GanttState,
  name: string,
  color: string
): GanttState {
  const id = uuidv4();
  const category: Category = { id, name, color, order: Object.keys(state.categories).length };
  return {
    ...state,
    categories: { ...state.categories, [id]: category },
  };
}

export function updateCategory(
  state: GanttState,
  categoryId: string,
  updates: Partial<Category>
): GanttState {
  const category = state.categories[categoryId];
  if (!category) return state;
  return {
    ...state,
    categories: {
      ...state.categories,
      [categoryId]: { ...category, ...updates, id: categoryId },
    },
  };
}

export function deleteCategory(state: GanttState, categoryId: string): GanttState {
  const newCategories = { ...state.categories };
  delete newCategories[categoryId];

  const newTasks = { ...state.tasks };
  for (const [tId, t] of Object.entries(newTasks)) {
    if (t.categoryIds.includes(categoryId))
      newTasks[tId] = { ...t, categoryIds: t.categoryIds.filter((id) => id !== categoryId) };
  }

  return { ...state, categories: newCategories, tasks: newTasks };
}

export function getTasksForProject(state: GanttState, projectId: string): Task[] {
  return Object.values(state.tasks)
    .filter((t) => t.projectIds.includes(projectId))
    .sort((a, b) => a.order - b.order);
}

export function getRootTasks(state: GanttState, projectId: string): Task[] {
  return getTasksForProject(state, projectId)
    .filter((t) => !t.parentId)
    .sort((a, b) => a.order - b.order);
}

export function getFlattenedTasks(state: GanttState, projectId: string): Task[] {
  const result: Task[] = [];
  const roots = getRootTasks(state, projectId);

  const addWithChildren = (task: Task, depth: number) => {
    result.push(task);
    if (!task.collapsed) {
      task.children
        .map((id) => state.tasks[id])
        .filter(Boolean)
        .sort((a, b) => a.order - b.order)
        .forEach((child) => addWithChildren(child, depth + 1));
    }
  };

  roots.forEach((r) => addWithChildren(r, 0));
  return result;
}

export function getTaskDepth(state: GanttState, taskId: string): number {
  let depth = 0;
  let current = state.tasks[taskId];
  while (current?.parentId) {
    depth++;
    current = state.tasks[current.parentId];
  }
  return depth;
}

export function canAddChild(state: GanttState, taskId: string): boolean {
  return getTaskDepth(state, taskId) < MAX_TASK_DEPTH;
}

/** Check if any descendant of a task has a given person assigned */
export function hasDescendantWithAssignee(state: GanttState, taskId: string, personId: string): boolean {
  const task = state.tasks[taskId];
  if (!task) return false;
  if (task.assigneeIds.includes(personId)) return true;
  return task.children.some((childId) => hasDescendantWithAssignee(state, childId, personId));
}

export function getMilestoneProgress(state: GanttState, milestoneId: string): number {
  const milestone = state.milestones[milestoneId];
  if (!milestone || milestone.taskIds.length === 0) return 0;
  const tasks = milestone.taskIds.map((id) => state.tasks[id]).filter(Boolean);
  if (tasks.length === 0) return 0;
  return Math.round(tasks.reduce((sum, t) => sum + computeProgress(t, state.tasks), 0) / tasks.length);
}

export function getPersonTasks(state: GanttState, personId: string): Task[] {
  return Object.values(state.tasks).filter((t) =>
    t.assigneeIds.includes(personId)
  );
}

/** Get flattened tasks filtered by sidebar context (person, category, etc.) */
export function getFilteredFlattenedTasks(state: GanttState): Task[] {
  const { sidebarSection, sidebarFilterId } = state;
  if (!sidebarFilterId) {
    // No filter active — fall back to project-based view
    if (!state.activeProjectId) return [];
    return getFlattenedTasks(state, state.activeProjectId);
  }

  let filtered: Task[];
  switch (sidebarSection) {
    case 'people':
      filtered = Object.values(state.tasks)
        .filter((t) => hasDescendantWithAssignee(state, t.id, sidebarFilterId))
        .sort((a, b) => a.order - b.order);
      break;
    case 'categories':
      filtered = Object.values(state.tasks)
        .filter((t) => t.categoryIds.includes(sidebarFilterId))
        .sort((a, b) => a.order - b.order);
      break;
    case 'milestones': {
      const milestone = state.milestones[sidebarFilterId];
      if (!milestone) return [];
      filtered = milestone.taskIds
        .map((id) => state.tasks[id])
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
      break;
    }
    case 'projects':
    default:
      if (!state.activeProjectId) return [];
      return getFlattenedTasks(state, state.activeProjectId);
  }

  // Return only root-level tasks (no children duplication)
  return filtered.filter((t) => !t.parentId || !filtered.some((f) => f.id === t.parentId));
}

export function getPersonMilestoneProgress(
  state: GanttState,
  personId: string,
  milestoneId: string
): number {
  const milestone = state.milestones[milestoneId];
  if (!milestone) return 0;
  const tasks = milestone.taskIds
    .map((id) => state.tasks[id])
    .filter((t) => t && t.assigneeIds.includes(personId));
  if (tasks.length === 0) return 0;
  return Math.round(tasks.reduce((sum, t) => sum + computeProgress(t, state.tasks), 0) / tasks.length);
}
