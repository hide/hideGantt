import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { GanttState, Task, Subtask } from '../types';
import { getTaskStatus, getStatusColor } from '../types';
import type { SidebarSection } from '../types';
import { getFlattenedTasks, getTaskDepth, updateTask, createTask, createProject, createPerson, createCategory, createMilestone } from '../store';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';

/** A row in the Gantt chart — group header, task, or subtask */
type GanttRow =
  | { kind: 'group'; id: string; label: string; color: string }
  | { kind: 'task'; task: Task; depth: number }
  | { kind: 'subtask'; subtask: Subtask; parentTask: Task; depth: number };

interface GanttChartProps {
  state: GanttState;
  setState: (s: GanttState) => void;
  readOnly: boolean;
}

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 60;
const TASK_LIST_DEFAULT_WIDTH = 320;
const TASK_LIST_MIN_WIDTH = 180;
const TASK_LIST_MAX_WIDTH = 600;

function dateToDayOffset(date: string, startDate: string): number {
  const d = new Date(date);
  const s = new Date(startDate);
  return Math.floor((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function dayOffsetToDate(offset: number, startDate: string): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function generateDateHeaders(start: string, end: string, zoom: 'day' | 'week' | 'month', dayWidth: number) {
  const headers: { label: string; subLabels: { label: string; width: number; dayOffset: number }[] }[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (zoom === 'day' || zoom === 'week') {
    let current = new Date(startDate);
    let currentMonth = '';
    let monthGroup: typeof headers[0] | null = null;

    while (current <= endDate) {
      const monthLabel = current.toLocaleDateString('ja', { month: 'short', year: 'numeric' });
      if (monthLabel !== currentMonth) {
        if (monthGroup) headers.push(monthGroup);
        monthGroup = { label: monthLabel, subLabels: [] };
        currentMonth = monthLabel;
      }

      if (zoom === 'day') {
        const dayOffset = dateToDayOffset(current.toISOString().split('T')[0], start);
        monthGroup!.subLabels.push({ label: current.getDate().toString(), width: dayWidth, dayOffset });
        current.setDate(current.getDate() + 1);
      } else {
        const weekStart = new Date(current);
        const dayOffset = dateToDayOffset(weekStart.toISOString().split('T')[0], start);
        const daysInWeek = Math.min(7, Math.ceil((endDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        monthGroup!.subLabels.push({ label: `${weekStart.getDate()}`, width: daysInWeek * dayWidth, dayOffset });
        current.setDate(current.getDate() + 7);
      }
    }
    if (monthGroup) headers.push(monthGroup);
  } else {
    let current = new Date(startDate);
    let currentYear = '';
    let yearGroup: typeof headers[0] | null = null;

    while (current <= endDate) {
      const yearLabel = current.getFullYear().toString();
      if (yearLabel !== currentYear) {
        if (yearGroup) headers.push(yearGroup);
        yearGroup = { label: yearLabel, subLabels: [] };
        currentYear = yearLabel;
      }

      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const daysInMonth = monthEnd.getDate();
      const dayOffset = dateToDayOffset(monthStart.toISOString().split('T')[0], start);

      yearGroup!.subLabels.push({
        label: current.toLocaleDateString('ja', { month: 'short' }),
        width: daysInMonth * dayWidth,
        dayOffset,
      });

      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
    }
    if (yearGroup) headers.push(yearGroup);
  }

  return headers;
}

export function GanttChart({ state, setState, readOnly }: GanttChartProps) {
  const theme = useTheme();
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragTask, setDragTask] = useState<{ id: string; type: 'move' | 'resize-end'; startX: number; origStart: string; origEnd: string } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [dragReorder, setDragReorder] = useState<{ taskId: string; startY: number; currentIndex: number } | null>(null);
  const [taskListWidth, setTaskListWidth] = useState(TASK_LIST_DEFAULT_WIDTH);
  const resizingTaskListRef = useRef(false);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  const projectId = state.activeProjectId;
  const sidebarSection = state.sidebarSection ?? 'projects';

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#f97316', '#84cc16'];
  const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

  const sectionKeys: SidebarSection[] = ['projects', 'people', 'categories', 'milestones'];
  const sectionLabelKeys: Record<SidebarSection, string> = { projects: 'section.projects', people: 'section.people', categories: 'section.categories', milestones: 'section.milestones' };
  const addPlaceholderKeys: Record<SidebarSection, string> = { projects: 'add.project', people: 'add.person', categories: 'add.category', milestones: 'add.milestone' };

  // Close section menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node))
        setSectionMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setSection = (s: SidebarSection) => {
    setState({ ...state, sidebarSection: s, sidebarFilterId: null });
    setSectionMenuOpen(false);
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    const color = pickColor();
    let next = state;
    switch (sidebarSection) {
      case 'projects': next = createProject(state, newItemName.trim(), color); break;
      case 'people': next = createPerson(state, newItemName.trim(), color); break;
      case 'categories': next = createCategory(state, newItemName.trim(), color); break;
      case 'milestones':
        if (!milestoneDate || !state.activeProjectId) return;
        next = createMilestone(state, newItemName.trim(), milestoneDate, state.activeProjectId, color);
        break;
    }
    setState(next);
    setNewItemName('');
  };

  // Build flat rows: group headers + tasks + subtasks, grouped by current sidebar section
  const { rows, allTasks: tasks } = useMemo(() => {
    const result: GanttRow[] = [];
    const allTasks: Task[] = [];

    const addTaskRows = (taskList: Task[], subtaskFilter?: (sub: Subtask, task: Task) => boolean) => {
      for (const task of taskList) {
        allTasks.push(task);
        const depth = getTaskDepth(state, task.id);
        result.push({ kind: 'task', task, depth });
        if (!task.collapsed && task.subtasks && task.subtasks.length > 0) {
          const subs = subtaskFilter ? task.subtasks.filter((s) => subtaskFilter(s, task)) : task.subtasks;
          for (const sub of subs)
            result.push({ kind: 'subtask', subtask: sub, parentTask: task, depth: depth + 1 });
        }
      }
    };

    switch (sidebarSection) {
      case 'projects': {
        const projects = Object.values(state.projects).sort((a, b) => a.order - b.order);
        for (const p of projects) {
          const pTasks = getFlattenedTasks(state, p.id);
          result.push({ kind: 'group', id: p.id, label: p.name, color: p.color });
          addTaskRows(pTasks);
        }
        break;
      }
      case 'people': {
        const people = Object.values(state.people).sort((a, b) => a.order - b.order);
        for (const p of people) {
          const pTasks = Object.values(state.tasks)
            .filter((t) => t.assigneeIds.includes(p.id) || t.subtasks?.some((s) => s.assigneeIds?.includes(p.id)))
            .sort((a, b) => a.order - b.order);
          result.push({ kind: 'group', id: p.id, label: p.name, color: p.color });
          // If person is directly assigned to the task, show all subtasks;
          // otherwise only show subtasks assigned to this person
          addTaskRows(pTasks, (sub, task) => {
            if (task.assigneeIds.includes(p.id)) return true;
            return sub.assigneeIds?.includes(p.id) ?? false;
          });
        }
        break;
      }
      case 'categories': {
        const categories = Object.values(state.categories).sort((a, b) => a.order - b.order);
        for (const c of categories) {
          const cTasks = Object.values(state.tasks)
            .filter((t) => t.categoryIds.includes(c.id))
            .sort((a, b) => a.order - b.order);
          result.push({ kind: 'group', id: c.id, label: c.name, color: c.color });
          addTaskRows(cTasks);
        }
        // Uncategorized
        const uncategorized = Object.values(state.tasks)
          .filter((t) => t.categoryIds.length === 0)
          .sort((a, b) => a.order - b.order);
        if (uncategorized.length > 0) {
          result.push({ kind: 'group', id: '__uncategorized', label: t('detail.none'), color: '#6b7280' });
          addTaskRows(uncategorized);
        }
        break;
      }
      case 'milestones': {
        const mils = Object.values(state.milestones).sort((a, b) => a.order - b.order);
        for (const m of mils) {
          const mTasks = m.taskIds.map((id) => state.tasks[id]).filter(Boolean).sort((a, b) => a.order - b.order);
          result.push({ kind: 'group', id: m.id, label: m.title, color: m.color });
          addTaskRows(mTasks);
        }
        break;
      }
    }

    return { rows: result, allTasks };
  }, [state, sidebarSection, t]);

  // Track container width for auto-fit
  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries)
        setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalDays = Math.max(1, dateToDayOffset(state.timelineEndDate, state.timelineStartDate));
  // dayWidth is computed so the full date range fits the container
  const dayWidth = Math.max(1, containerWidth / totalDays);
  const chartWidth = containerWidth;

  // Auto-select header granularity based on dayWidth
  const autoZoom: 'day' | 'week' | 'month' = dayWidth >= 25 ? 'day' : dayWidth >= 8 ? 'week' : 'month';
  const headers = generateDateHeaders(state.timelineStartDate, state.timelineEndDate, autoZoom, dayWidth);
  const milestones = Object.values(state.milestones);
  const todayOffset = dateToDayOffset(new Date().toISOString().split('T')[0], state.timelineStartDate);

  // Pre-compute milestone row assignments to determine total height
  const MILESTONE_ROW_HEIGHT = 24;
  const MIN_MILESTONE_X_GAP = 120;
  const milestoneRowCount = useMemo(() => {
    const sorted = milestones
      .map((m) => ({ mx: dateToDayOffset(m.date, state.timelineStartDate) * dayWidth }))
      .sort((a, b) => a.mx - b.mx);
    const rowEnds: number[] = [];
    for (const m of sorted) {
      let placed = false;
      for (let r = 0; r < rowEnds.length; r++) {
        if (m.mx - rowEnds[r] >= MIN_MILESTONE_X_GAP) {
          rowEnds[r] = m.mx;
          placed = true;
          break;
        }
      }
      if (!placed) rowEnds.push(m.mx);
    }
    return rowEnds.length;
  }, [milestones, state.timelineStartDate, dayWidth]);
  const milestoneAreaHeight = milestoneRowCount > 0 ? milestoneRowCount * MILESTONE_ROW_HEIGHT + 16 : 0;


  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragTask) return;
      const dx = e.clientX - dragTask.startX;
      const dayDelta = Math.round(dx / dayWidth);

      if (dragTask.type === 'move') {
        const newStart = dayOffsetToDate(dateToDayOffset(dragTask.origStart, state.timelineStartDate) + dayDelta, state.timelineStartDate);
        const newEnd = dayOffsetToDate(dateToDayOffset(dragTask.origEnd, state.timelineStartDate) + dayDelta, state.timelineStartDate);
        setState(updateTask(state, dragTask.id, { startDate: newStart, endDate: newEnd }));
      } else {
        const newEnd = dayOffsetToDate(
          Math.max(dateToDayOffset(dragTask.origStart, state.timelineStartDate) + 1, dateToDayOffset(dragTask.origEnd, state.timelineStartDate) + dayDelta),
          state.timelineStartDate
        );
        setState(updateTask(state, dragTask.id, { endDate: newEnd }));
      }
    },
    [dragTask, dayWidth, state, setState]
  );

  const handleMouseUp = useCallback(() => { setDragTask(null); setDragReorder(null); }, []);

  useEffect(() => {
    if (dragTask || dragReorder) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [dragTask, dragReorder, handleMouseMove, handleMouseUp]);

  // Task list resize
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingTaskListRef.current) return;
      // Account for the sidebar width by using getBoundingClientRect of the chart area
      const chartArea = scrollRef.current?.parentElement;
      if (!chartArea) return;
      const rect = chartArea.getBoundingClientRect();
      const newWidth = Math.min(TASK_LIST_MAX_WIDTH, Math.max(TASK_LIST_MIN_WIDTH, e.clientX - rect.left));
      setTaskListWidth(newWidth);
    };
    const onMouseUp = () => {
      if (resizingTaskListRef.current) {
        resizingTaskListRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const startTaskListResize = () => {
    resizingTaskListRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    setState(createTask(state, { title: newTaskTitle.trim() }));
    setNewTaskTitle('');
  };

  const handleAddSubtask = (parentId: string) => {
    if (!subtaskTitle.trim()) return;
    const parent = state.tasks[parentId];
    setState(createTask(state, { title: subtaskTitle.trim(), parentId, projectIds: parent.projectIds, startDate: parent.startDate, endDate: parent.endDate }));
    setSubtaskTitle('');
    setAddingSubtaskFor(null);
  };

  const toggleCollapse = (taskId: string) => {
    const task = state.tasks[taskId];
    if (task && (task.children.length > 0 || (task.subtasks && task.subtasks.length > 0)))
      setState(updateTask(state, taskId, { collapsed: !task.collapsed }));
  };

  const handleDragStart = (e: React.DragEvent, taskId: string, index: number) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDragReorder({ taskId, startY: e.clientY, currentIndex: index });
  };

  const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below'>('above');

  const handleTaskDragOver = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    // Show task drop indicator when dragging a task (not a group)
    if (e.dataTransfer.types.includes('text/plain') && (!dragReorder || targetTaskId !== dragReorder.taskId)) {
      setDropTargetTaskId(targetTaskId);
      // Determine above/below based on mouse position within the row
      const rect = e.currentTarget.getBoundingClientRect();
      setDropPosition(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below');
    }
  };

  const handleTaskDragEnd = () => {
    setDragReorder(null);
    setDropTargetTaskId(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedTaskId = e.dataTransfer.getData('text/plain');
    const currentDropPosition = dropPosition;
    setDropTargetTaskId(null);
    setDragReorder(null);
    if (!draggedTaskId) return;
    const targetTask = tasks[targetIndex];
    if (!targetTask || draggedTaskId === targetTask.id) return;

    // Collect all tasks sorted by current order, splice dragged to target position
    const allSorted = Object.values(state.tasks).sort((a, b) => a.order - b.order);
    const ids = allSorted.map((t) => t.id);
    const fromIdx = ids.indexOf(draggedTaskId);
    const toIdx = ids.indexOf(targetTask.id);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    // Adjust insert index: "above" = before target, "below" = after target
    let insertIdx: number;
    if (currentDropPosition === 'below') {
      insertIdx = fromIdx < toIdx ? toIdx : toIdx + 1;
    } else {
      insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    }
    ids.splice(insertIdx, 0, draggedTaskId);
    // Reassign order values
    const newTasks = { ...state.tasks };
    ids.forEach((id, i) => {
      newTasks[id] = { ...newTasks[id], order: i };
    });
    setState({ ...state, tasks: newTasks });
  };

  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

  const handleGroupDragStart = (e: React.DragEvent, groupId: string) => {
    e.dataTransfer.setData('application/group-id', groupId);
    e.dataTransfer.effectAllowed = 'move';
    setDragGroupId(groupId);
  };

  const handleGroupDragEnd = () => {
    setDragGroupId(null);
    setDropTargetGroupId(null);
  };

  const handleGroupDragOver = (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    // Only show group indicator when dragging a group, not a task
    if (dragGroupId && targetGroupId !== dragGroupId && targetGroupId !== '__uncategorized')
      setDropTargetGroupId(targetGroupId);
  };

  const reorderItems = <T extends { order: number }>(
    items: Record<string, T>,
    draggedId: string,
    targetId: string
  ): Record<string, T> => {
    // Build sorted array, move dragged to target's position
    const sorted = Object.values(items).sort((a, b) => a.order - b.order);
    const ids = sorted.map((item) => (item as any).id as string);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return items;
    ids.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    ids.splice(insertIdx, 0, draggedId);
    // Reassign order values
    const result = { ...items };
    ids.forEach((id, i) => {
      result[id] = { ...result[id], order: i };
    });
    return result;
  };

  const handleGroupDrop = (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('application/group-id');
    setDragGroupId(null);
    setDropTargetGroupId(null);
    if (!draggedId || draggedId === targetGroupId || targetGroupId === '__uncategorized') return;

    let next = { ...state };
    switch (sidebarSection) {
      case 'projects':
        next = { ...next, projects: reorderItems(next.projects, draggedId, targetGroupId) };
        break;
      case 'people':
        next = { ...next, people: reorderItems(next.people, draggedId, targetGroupId) };
        break;
      case 'categories':
        next = { ...next, categories: reorderItems(next.categories, draggedId, targetGroupId) };
        break;
      case 'milestones':
        next = { ...next, milestones: reorderItems(next.milestones, draggedId, targetGroupId) };
        break;
    }
    setState(next);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 flex items-center px-4 gap-3 shrink-0" style={{ background: theme.bg800, borderBottom: `1px solid ${theme.bg600}` }}>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: theme.text400 }}>{t('toolbar.from')}</label>
          <input type="date" value={state.timelineStartDate} onChange={(e) => setState({ ...state, timelineStartDate: e.target.value })} className="text-xs" />
          <label className="text-xs" style={{ color: theme.text400 }}>{t('toolbar.to')}</label>
          <input type="date" value={state.timelineEndDate} onChange={(e) => setState({ ...state, timelineEndDate: e.target.value })} className="text-xs" />
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task List */}
        <div className="shrink-0 overflow-y-auto flex flex-col relative" style={{ width: taskListWidth }}>
          {/* Section header with dropdown */}
          <div ref={sectionMenuRef} className="relative shrink-0" style={{ height: HEADER_HEIGHT, background: theme.bg800, borderBottom: `1px solid ${theme.bg600}` }}>
            <button
              onClick={() => setSectionMenuOpen(!sectionMenuOpen)}
              className="w-full h-full flex items-center justify-between px-4 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-80"
              style={{ color: theme.text300 }}
            >
              <span>{t(sectionLabelKeys[sidebarSection] as any)}</span>
              <span className="text-[10px]" style={{ color: theme.text400 }}>{sectionMenuOpen ? '▲' : '▼'}</span>
            </button>
            {sectionMenuOpen && (
              <div
                className="absolute top-full left-0 right-0 z-50 py-1 fade-in"
                style={{ background: theme.bg700, border: `1px solid ${theme.bg500}`, borderTop: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
              >
                {sectionKeys.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSection(s)}
                    className="w-full text-left px-4 py-2 text-xs font-medium transition-all"
                    style={sidebarSection === s ? { background: theme.accent, color: '#fff' } : { color: theme.text200 }}
                  >
                    {t(sectionLabelKeys[s] as any)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Task & subtask rows */}
          <div
            className="flex-1 overflow-y-auto"
            onDragOver={(e) => {
              // Allow drop on empty scroll area below items
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const types = e.dataTransfer.types;
              if (types.includes('text/plain')) setDropTargetTaskId('__bottom');
              if (types.includes('application/group-id')) setDropTargetGroupId('__bottom');
            }}
            onDrop={(e) => {
              e.preventDefault();
              const draggedTaskId = e.dataTransfer.getData('text/plain');
              const draggedGroupId = e.dataTransfer.getData('application/group-id');

              setDropTargetTaskId(null);
              setDropTargetGroupId(null);
              setDragReorder(null);
              setDragGroupId(null);
              if (draggedTaskId && state.tasks[draggedTaskId]) {
                const maxOrder = Math.max(...Object.values(state.tasks).map((t) => t.order));
                setState({ ...state, tasks: { ...state.tasks, [draggedTaskId]: { ...state.tasks[draggedTaskId], order: maxOrder + 1 } } });
              } else if (draggedGroupId) {
                let next = { ...state };
                const moveToEnd = <T extends { order: number }>(items: Record<string, T>, id: string): Record<string, T> => {
                  const maxOrder = Math.max(...Object.values(items).map((item) => item.order));
                  return { ...items, [id]: { ...items[id], order: maxOrder + 1 } };
                };
                switch (sidebarSection) {
                  case 'projects': next = { ...next, projects: moveToEnd(next.projects, draggedGroupId) }; break;
                  case 'people': next = { ...next, people: moveToEnd(next.people, draggedGroupId) }; break;
                  case 'categories': next = { ...next, categories: moveToEnd(next.categories, draggedGroupId) }; break;
                  case 'milestones': next = { ...next, milestones: moveToEnd(next.milestones, draggedGroupId) }; break;
                }
                setState(next);
              }
            }}
          >
            {rows.map((row, index) => {
              if (row.kind === 'group') {
                const isUncategorized = row.id === '__uncategorized';
                const isDragging = dragGroupId === row.id;
                const isDropTarget = dropTargetGroupId === row.id && dragGroupId !== row.id;
                return (
                  <div
                    key={`group-${row.id}`}
                    className="flex items-center px-3 text-xs font-bold uppercase tracking-wider cursor-pointer hover:opacity-80 transition-all"
                    style={{
                      height: ROW_HEIGHT,
                      background: row.color + '18',
                      borderBottom: `1px solid ${theme.bg600}`,
                      borderLeft: `3px solid ${row.color}`,
                      borderTop: isDropTarget ? `2px solid ${theme.accent}` : '2px solid transparent',
                      color: row.color,
                      opacity: isDragging ? 0.4 : 1,
                    }}
                    onClick={() => {
                      if (isUncategorized) return;
                      setState({ ...state, editingItemId: row.id, editingItemType: sidebarSection, selectedTaskId: null });
                    }}
                    draggable={!readOnly && !isUncategorized}
                    onDragStart={(e) => handleGroupDragStart(e, row.id)}
                    onDragEnd={handleGroupDragEnd}
                    onDragOver={(e) => handleGroupDragOver(e, row.id)}
                    onDragLeave={() => { if (dropTargetGroupId === row.id) setDropTargetGroupId(null); }}
                    onDrop={(e) => handleGroupDrop(e, row.id)}
                  >
                    {!readOnly && !isUncategorized && (
                      <span className="mr-2 cursor-grab text-[10px] opacity-50">⋮⋮</span>
                    )}
                    {row.label}
                  </div>
                );
              }
              if (row.kind === 'task') {
                const { task, depth } = row;
                const status = getTaskStatus(task);
                const statusColor = getStatusColor(status);
                const hasChildren = task.children.length > 0;
                const hasSubtasks = task.subtasks && task.subtasks.length > 0;
                const canCollapse = hasChildren || hasSubtasks;
                const categories = task.categoryIds.map((cid) => state.categories[cid]).filter(Boolean);
                const taskIndex = tasks.indexOf(task);

                const isDraggingTask = dragReorder?.taskId === task.id;
                const isTaskDropTarget = dropTargetTaskId === task.id && dragReorder?.taskId !== task.id;

                return (
                  <div
                    key={`task-${index}`}
                    className="flex items-center cursor-pointer transition-colors group"
                    style={{
                      height: ROW_HEIGHT,
                      paddingLeft: 12 + depth * 20,
                      borderBottom: isTaskDropTarget && dropPosition === 'below' ? `2px solid ${theme.accent}` : `1px solid ${theme.bg700}`,
                      borderTop: isTaskDropTarget && dropPosition === 'above' ? `2px solid ${theme.accent}` : '2px solid transparent',
                      background: state.selectedTaskId === task.id ? theme.bg700 : 'transparent',
                      opacity: isDraggingTask ? 0.4 : 1,
                    }}
                    onClick={() => setState({ ...state, selectedTaskId: task.id, editingItemId: null, editingItemType: null })}
                    draggable={!readOnly}
                    onDragStart={(e) => handleDragStart(e, task.id, taskIndex)}
                    onDragEnd={handleTaskDragEnd}
                    onDragOver={(e) => handleTaskDragOver(e, task.id)}
                    onDragLeave={() => { if (dropTargetTaskId === task.id) setDropTargetTaskId(null); }}
                    onDrop={(e) => handleDrop(e, taskIndex)}
                  >
                    {!readOnly && (
                      <span className="mr-1 cursor-grab opacity-0 group-hover:opacity-100 text-[10px]" style={{ color: theme.text400 }}>⋮⋮</span>
                    )}

                    {canCollapse ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCollapse(task.id); }}
                        className="w-4 h-4 flex items-center justify-center text-xs mr-1"
                        style={{ color: theme.text400 }}
                      >
                        {task.collapsed ? '▶' : '▼'}
                      </button>
                    ) : (
                      <span className="w-4 mr-1" />
                    )}

                    <div className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: statusColor }} />
                    <span className="text-sm truncate flex-1 mr-2">{task.title}</span>

                    {categories.map((cat) => (
                      <span key={cat.id} className="text-[9px] px-1.5 py-0.5 rounded font-medium mr-1 shrink-0" style={{ background: cat.color + '33', color: cat.color }}>
                        {cat.name}
                      </span>
                    ))}

                    <div className="flex -space-x-1 mr-2 shrink-0">
                      {task.assigneeIds.slice(0, 3).map((aid) => {
                        const person = state.people[aid];
                        if (!person) return null;
                        return (
                          <div key={aid} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: person.color, border: `1px solid ${theme.bg800}` }} title={person.name}>
                            {person.avatar}
                          </div>
                        );
                      })}
                    </div>

                    <span className="text-[10px] font-medium w-8 text-right shrink-0" style={{ color: statusColor }}>{task.progress}%</span>

                    {!readOnly && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAddingSubtaskFor(addingSubtaskFor === task.id ? null : task.id); }}
                        className="ml-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity rounded px-1"
                        style={{ background: theme.accent + '30', color: theme.accent }}
                        title={t('tasks.addSubtask')}
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              } else {
                const { subtask, depth } = row;
                const assigneeIds = subtask.assigneeIds ?? [];
                return (
                  <div
                    key={`sub-${index}`}
                    className="flex items-center cursor-default transition-colors"
                    style={{
                      height: ROW_HEIGHT,
                      paddingLeft: 52 + depth * 20,
                      borderBottom: `1px solid ${theme.bg700}`,
                      background: 'transparent',
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full mr-2 shrink-0" style={{ background: subtask.done ? '#9ca3af' : theme.accent }} />
                    <span className="text-xs truncate flex-1 mr-2" style={{ color: subtask.done ? theme.text400 : theme.text200, textDecoration: subtask.done ? 'line-through' : 'none' }}>{subtask.title}</span>

                    <div className="flex -space-x-1 mr-2 shrink-0">
                      {assigneeIds.slice(0, 2).map((aid) => {
                        const person = state.people[aid];
                        if (!person) return null;
                        return (
                          <div key={aid} className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ background: person.color, border: `1px solid ${theme.bg800}` }} title={person.name}>
                            {person.avatar}
                          </div>
                        );
                      })}
                    </div>

                    <span className="w-8 shrink-0" />
                  </div>
                );
              }
            })}

            {/* Subtask input */}
            {addingSubtaskFor && (
              <div className="flex items-center px-4 py-1" style={{ background: theme.bg700, borderBottom: `1px solid ${theme.bg600}` }}>
                <input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder={t('tasks.subtaskPlaceholder')}
                  className="flex-1 text-xs"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddSubtask(addingSubtaskFor); if (e.key === 'Escape') setAddingSubtaskFor(null); }}
                />
                <button onClick={() => handleAddSubtask(addingSubtaskFor)} className="ml-1 px-2 py-1 rounded text-xs font-medium" style={{ background: theme.accent + '30', color: theme.accent }}>{t('tasks.addButton')}</button>
              </div>
            )}

            {/* Bottom drop zone — always present, fills remaining space */}
            <div
              className="flex-1 min-h-[40px]"
              style={{
                borderTop: (dropTargetTaskId === '__bottom' || dropTargetGroupId === '__bottom') ? `2px solid ${theme.accent}` : '2px solid transparent',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                // Check dataTransfer types to determine what's being dragged
                const types = e.dataTransfer.types;
                if (types.includes('text/plain')) setDropTargetTaskId('__bottom');
                if (types.includes('application/group-id')) setDropTargetGroupId('__bottom');
              }}
              onDragLeave={() => {
                if (dropTargetTaskId === '__bottom') setDropTargetTaskId(null);
                if (dropTargetGroupId === '__bottom') setDropTargetGroupId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const draggedTaskId = e.dataTransfer.getData('text/plain');
                const draggedGroupId = e.dataTransfer.getData('application/group-id');

                setDropTargetTaskId(null);
                setDropTargetGroupId(null);
                setDragReorder(null);
                setDragGroupId(null);
                if (draggedTaskId && state.tasks[draggedTaskId]) {
                  const maxOrder = Math.max(...Object.values(state.tasks).map((t) => t.order));
                  setState({ ...state, tasks: { ...state.tasks, [draggedTaskId]: { ...state.tasks[draggedTaskId], order: maxOrder + 1 } } });
                } else if (draggedGroupId) {
                  let next = { ...state };
                  const moveToEnd = <T extends { order: number }>(items: Record<string, T>, id: string): Record<string, T> => {
                    const maxOrder = Math.max(...Object.values(items).map((item) => item.order));
                    return { ...items, [id]: { ...items[id], order: maxOrder + 1 } };
                  };
                  switch (sidebarSection) {
                    case 'projects': next = { ...next, projects: moveToEnd(next.projects, draggedGroupId) }; break;
                    case 'people': next = { ...next, people: moveToEnd(next.people, draggedGroupId) }; break;
                    case 'categories': next = { ...next, categories: moveToEnd(next.categories, draggedGroupId) }; break;
                    case 'milestones': next = { ...next, milestones: moveToEnd(next.milestones, draggedGroupId) }; break;
                  }
                  setState(next);
                }
              }}
            >
              {tasks.length === 0 && (
                <div className="p-8 text-center text-sm" style={{ color: theme.text400 }}>
                  {t('tasks.empty')}
                </div>
              )}
            </div>

          </div>

          {/* Bottom inputs */}
          {!readOnly && (
            <div className="shrink-0" style={{ borderTop: `1px solid ${theme.bg600}`, background: theme.bg800 }}>
              {/* New task */}
              <div className="px-3 py-2 flex items-center gap-1">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder={t('tasks.newPlaceholder')}
                  className="flex-1 text-xs min-w-0"
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAddTask()}
                />
                <button onClick={handleAddTask} className="px-2 py-1.5 rounded text-xs font-medium shrink-0" style={{ background: theme.accent + '30', color: theme.accent }}>+</button>
              </div>
              {/* New item (project/person/category/milestone) */}
              <div className="px-3 pb-2 flex items-center gap-1">
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={t(addPlaceholderKeys[sidebarSection] as any)}
                  className="flex-1 text-xs min-w-0"
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAddItem()}
                />
                <button onClick={handleAddItem} className="px-2 py-1.5 rounded text-xs font-medium shrink-0" style={{ background: theme.accent + '30', color: theme.accent }}>+</button>
              </div>
              {sidebarSection === 'milestones' && (
                <div className="px-3 pb-2">
                  <input type="date" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} className="w-full text-xs" />
                </div>
              )}
            </div>
          )}
          {/* Resize handle */}
          <div
            onMouseDown={startTaskListResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10"
          >
            <div className="w-px h-full ml-auto" style={{ background: theme.bg600 }} />
          </div>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: '100%', minHeight: HEADER_HEIGHT + rows.length * ROW_HEIGHT + milestoneAreaHeight }}>
            {/* Header */}
            <div className="sticky top-0 z-10" style={{ height: HEADER_HEIGHT, background: theme.bg800, borderBottom: `1px solid ${theme.bg600}` }}>
              <svg width="100%" height={HEADER_HEIGHT}>
                {(() => {
                  let x = 0;
                  return headers.map((group, gi) => {
                    const groupWidth = group.subLabels.reduce((sum, s) => sum + s.width, 0);
                    const groupX = x;
                    const result = (
                      <g key={gi}>
                        <text x={groupX + 8} y={18} fill={theme.headerText} fontSize={11} fontWeight={600}>{group.label}</text>
                        {group.subLabels.map((sub, si) => {
                          const subX = groupX + group.subLabels.slice(0, si).reduce((s, sl) => s + sl.width, 0);
                          return (
                            <g key={si}>
                              <line x1={subX} y1={24} x2={subX} y2={HEADER_HEIGHT} stroke={theme.bg600} strokeWidth={1} />
                              <text x={subX + sub.width / 2} y={44} fill={theme.subHeaderText} fontSize={10} textAnchor="middle">{sub.label}</text>
                            </g>
                          );
                        })}
                      </g>
                    );
                    x += groupWidth;
                    return result;
                  });
                })()}
              </svg>
            </div>

            {/* Grid + Bars */}
            <svg width="100%" height={rows.length * ROW_HEIGHT + milestoneAreaHeight} style={{ display: 'block' }}>
              <defs>
                <marker id="arrowhead" markerWidth={8} markerHeight={6} refX={8} refY={3} orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill={theme.accent} opacity={0.6} />
                </marker>
              </defs>

              {/* Grid rows */}
              {rows.map((row, i) => (
                <rect key={i} x={0} y={i * ROW_HEIGHT} width="100%" height={ROW_HEIGHT}
                  fill={row.kind === 'group' ? (row.color + '18') : (i % 2 === 0 ? 'transparent' : theme.rowAlt)} />
              ))}

              {/* Grid columns */}
              {headers.flatMap((group) =>
                group.subLabels.map((sub) => (
                  <line key={`grid-${sub.dayOffset}`} x1={sub.dayOffset * dayWidth} y1={0} x2={sub.dayOffset * dayWidth} y2={rows.length * ROW_HEIGHT} stroke={theme.gridLine} strokeWidth={1} />
                ))
              )}

              {/* Today line */}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <line x1={todayOffset * dayWidth} y1={0} x2={todayOffset * dayWidth} y2={rows.length * ROW_HEIGHT + 40} stroke={theme.accent} strokeWidth={2} strokeDasharray="4,4" opacity={0.6} />
              )}

              {/* Milestone diamonds — assign rows to avoid overlap */}
              {(() => {
                const MIN_X_GAP = MIN_MILESTONE_X_GAP;
                const sorted = milestones
                  .map((m) => ({ ...m, mx: dateToDayOffset(m.date, state.timelineStartDate) * dayWidth }))
                  .sort((a, b) => a.mx - b.mx);
                // Greedy row assignment
                const rowEnds: number[] = []; // tracks the rightmost x used per row
                const milestoneRows: { m: typeof sorted[0]; row: number }[] = [];
                for (const m of sorted) {
                  let placed = false;
                  for (let r = 0; r < rowEnds.length; r++) {
                    if (m.mx - rowEnds[r] >= MIN_X_GAP) {
                      rowEnds[r] = m.mx;
                      milestoneRows.push({ m, row: r });
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    milestoneRows.push({ m, row: rowEnds.length });
                    rowEnds.push(m.mx);
                  }
                }
                return milestoneRows.map(({ m, row }) => {
                  const mTasks = m.taskIds.map((id) => state.tasks[id]).filter(Boolean);
                  const completedTasks = mTasks.filter((mt) => mt.progress >= 100).length;
                  const totalTasks = mTasks.length;
                  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                  // Determine milestone status from its tasks
                  let mStatus: 'completed' | 'on-track' | 'at-risk' | 'behind' = 'on-track';
                  if (totalTasks > 0 && completedTasks === totalTasks) mStatus = 'completed';
                  else if (totalTasks > 0) {
                    const statuses = mTasks.map((mt) => getTaskStatus(mt));
                    if (statuses.some((s) => s === 'behind')) mStatus = 'behind';
                    else if (statuses.some((s) => s === 'at-risk')) mStatus = 'at-risk';
                  }
                  const diamondColor = getStatusColor(mStatus);
                  const baseY = rows.length * ROW_HEIGHT + 8 + row * MILESTONE_ROW_HEIGHT;
                  return (
                    <g key={m.id}>
                      <line x1={m.mx} y1={0} x2={m.mx} y2={rows.length * ROW_HEIGHT} stroke={theme.text400} strokeWidth={1} strokeDasharray="6,3" opacity={0.3} />
                      <g transform={`translate(${m.mx}, ${baseY})`}>
                        <rect x={-5} y={-5} width={10} height={10} fill={diamondColor} transform="rotate(45)" style={{ transformOrigin: '0 0' }} />
                        <text x={10} y={4} fill={theme.text100} fontSize={10} fontWeight={600}>{m.title} ({progress}%)</text>
                      </g>
                    </g>
                  );
                });
              })()}

              {/* Dependency arrows */}
              {rows.map((row, rowIndex) => {
                if (row.kind !== 'task') return null;
                const task = row.task;
                return task.dependencyIds.map((depId) => {
                  const depRowIndex = rows.findIndex((r) => r.kind === 'task' && r.task.id === depId);
                  if (depRowIndex < 0) return null;
                  const depRow = rows[depRowIndex];
                  if (depRow.kind !== 'task') return null;
                  const dep = depRow.task;
                  const fromX = dateToDayOffset(dep.endDate, state.timelineStartDate) * dayWidth;
                  const fromY = depRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const toX = dateToDayOffset(task.startDate, state.timelineStartDate) * dayWidth;
                  const toY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const midX = fromX + (toX - fromX) / 2;
                  return (
                    <path key={`dep-${rowIndex}-${depId}`} d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`} fill="none" stroke={theme.accent} strokeWidth={1.5} opacity={0.4} markerEnd="url(#arrowhead)" />
                  );
                });
              })}

              {/* Task & subtask bars */}
              {rows.map((row, index) => {
                if (row.kind === 'group') return null;
                if (row.kind === 'task') {
                  const task = row.task;
                  const startOffset = dateToDayOffset(task.startDate, state.timelineStartDate);
                  const endOffset = dateToDayOffset(task.endDate, state.timelineStartDate);
                  const x = startOffset * dayWidth;
                  const width = Math.max((endOffset - startOffset) * dayWidth, 4);
                  const y = index * ROW_HEIGHT + 8;
                  const barHeight = ROW_HEIGHT - 16;
                  const status = getTaskStatus(task);
                  const statusColor = getStatusColor(status);
                  const hasChildren = task.children.length > 0;

                  return (
                    <g key={`bar-${index}`}>
                      <rect x={x} y={y} width={width} height={barHeight} rx={hasChildren ? 2 : 6}
                        fill={hasChildren ? theme.barParentBg : theme.barBg}
                        stroke={state.selectedTaskId === task.id ? theme.accent : 'transparent'} strokeWidth={1.5}
                        style={{ cursor: readOnly ? 'pointer' : 'grab' }}
                        onClick={() => setState({ ...state, selectedTaskId: task.id, editingItemId: null, editingItemType: null })}
                        onMouseDown={(e) => {
                          if (readOnly) return;
                          e.preventDefault();
                          setDragTask({ id: task.id, type: 'move', startX: e.clientX, origStart: task.startDate, origEnd: task.endDate });
                        }}
                      />
                      <rect x={x} y={y} width={Math.max(width * (task.progress / 100), 0)} height={barHeight} rx={hasChildren ? 2 : 6} fill={statusColor} opacity={0.7} style={{ pointerEvents: 'none' }} />
                      {hasChildren && (
                        <>
                          <rect x={x} y={y + barHeight - 4} width={6} height={4} fill={theme.text400} />
                          <rect x={x + width - 6} y={y + barHeight - 4} width={6} height={4} fill={theme.text400} />
                        </>
                      )}
                      {width > 60 && (
                        <text x={x + 8} y={y + barHeight / 2 + 4} fill={theme.text100} fontSize={11} fontWeight={500} style={{ pointerEvents: 'none' }}>
                          {task.title.length > Math.floor(width / 7) ? task.title.slice(0, Math.floor(width / 7)) + '…' : task.title}
                        </text>
                      )}
                      {!readOnly && (
                        <rect x={x + width - 6} y={y} width={6} height={barHeight} fill="transparent" style={{ cursor: 'ew-resize' }}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragTask({ id: task.id, type: 'resize-end', startX: e.clientX, origStart: task.startDate, origEnd: task.endDate }); }}
                        />
                      )}
                    </g>
                  );
                } else {
                  // Subtask bar — thinner, accent-colored
                  const sub = row.subtask;
                  if (!sub.startDate || !sub.endDate) return null;
                  const startOffset = dateToDayOffset(sub.startDate, state.timelineStartDate);
                  const endOffset = dateToDayOffset(sub.endDate, state.timelineStartDate);
                  const x = startOffset * dayWidth;
                  const width = Math.max((endOffset - startOffset) * dayWidth, 4);
                  const y = index * ROW_HEIGHT + 14;
                  const barHeight = ROW_HEIGHT - 28;
                  const fillColor = sub.done ? '#9ca3af' : theme.accent;

                  return (
                    <g key={`subbar-${index}`}>
                      <rect x={x} y={y} width={width} height={barHeight} rx={4}
                        fill={fillColor} opacity={sub.done ? 0.4 : 0.5}
                      />
                      {width > 50 && (
                        <text x={x + 6} y={y + barHeight / 2 + 3} fill={theme.text100} fontSize={9} fontWeight={400} style={{ pointerEvents: 'none' }}>
                          {sub.title.length > Math.floor(width / 6) ? sub.title.slice(0, Math.floor(width / 6)) + '…' : sub.title}
                        </text>
                      )}
                    </g>
                  );
                }
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
