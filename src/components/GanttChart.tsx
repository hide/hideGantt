import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { GanttState, Task } from '../types';
import { getTaskStatus, getStatusColor, computeProgress } from '../types';
import type { SidebarSection } from '../types';
import { getFlattenedTasks, getTaskDepth, canAddChild, hasDescendantWithAssignee, updateTask, createTask, createProject, createPerson, createCategory, createMilestone } from '../store';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';

/** A row in the Gantt chart — group header or task */
type GanttRow =
  | { kind: 'group'; id: string; label: string; color: string }
  | { kind: 'task'; task: Task; depth: number };

interface GanttChartProps {
  state: GanttState;
  setState: (s: GanttState) => void;
  readOnly: boolean;
}

const ROW_HEIGHT_DEFAULT = 40;
const ROW_HEIGHT_MIN = 24;
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

  if (zoom === 'month') {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (d <= endDate) {
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const subLabels: { label: string; width: number; dayOffset: number }[] = [];

      for (let week = new Date(Math.max(monthStart.getTime(), startDate.getTime())); week <= monthEnd && week <= endDate;) {
        const weekStart = new Date(week);
        const weekEnd = new Date(Math.min(
          new Date(weekStart.getTime() + 6 * 86400000).getTime(),
          monthEnd.getTime(),
          endDate.getTime()
        ));
        const days = Math.floor((weekEnd.getTime() - weekStart.getTime()) / 86400000) + 1;
        subLabels.push({ label: `${weekStart.getDate()}`, width: days * dayWidth, dayOffset: dateToDayOffset(weekStart.toISOString().split('T')[0], start) });
        week.setDate(week.getDate() + days);
      }
      if (subLabels.length > 0) headers.push({ label: `${year}/${month + 1}`, subLabels });
      d.setMonth(d.getMonth() + 1);
    }
  } else if (zoom === 'week') {
    const d = new Date(startDate);
    d.setDate(d.getDate() - d.getDay());
    let currentMonth = -1;
    let currentGroup: typeof headers[0] | null = null;

    while (d <= endDate) {
      if (d.getMonth() !== currentMonth) {
        currentMonth = d.getMonth();
        currentGroup = { label: `${d.getFullYear()}/${currentMonth + 1}`, subLabels: [] };
        headers.push(currentGroup);
      }
      const weekStart = new Date(Math.max(d.getTime(), startDate.getTime()));
      const weekEnd = new Date(Math.min(d.getTime() + 6 * 86400000, endDate.getTime()));
      const days = Math.floor((weekEnd.getTime() - weekStart.getTime()) / 86400000) + 1;
      currentGroup!.subLabels.push({ label: `${weekStart.getDate()}`, width: days * dayWidth, dayOffset: dateToDayOffset(weekStart.toISOString().split('T')[0], start) });
      d.setDate(d.getDate() + 7);
    }
  } else {
    const d = new Date(startDate);
    let currentMonth = -1;
    let currentGroup: typeof headers[0] | null = null;

    while (d <= endDate) {
      if (d.getMonth() !== currentMonth) {
        currentMonth = d.getMonth();
        currentGroup = { label: `${d.getFullYear()}/${currentMonth + 1}`, subLabels: [] };
        headers.push(currentGroup);
      }
      currentGroup!.subLabels.push({ label: `${d.getDate()}`, width: dayWidth, dayOffset: dateToDayOffset(d.toISOString().split('T')[0], start) });
      d.setDate(d.getDate() + 1);
    }
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
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  const projectId = state.activeProjectId;
  const sidebarSection = state.sidebarSection ?? 'projects';

  // Per-section task list width
  const taskListWidthsRef = useRef<Record<string, number>>({});
  const sidebarSectionRef = useRef(sidebarSection);
  sidebarSectionRef.current = sidebarSection;
  const resizePendingRef = useRef(TASK_LIST_DEFAULT_WIDTH);
  useEffect(() => {
    setTaskListWidth(taskListWidthsRef.current[sidebarSection] ?? TASK_LIST_DEFAULT_WIDTH);
  }, [sidebarSection]);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#f97316', '#84cc16'];
  const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

  const sectionKeys: SidebarSection[] = ['projects', 'people', 'categories', 'milestones'];
  const sectionLabelKeys: Record<SidebarSection, string> = { projects: 'section.projects', people: 'section.people', categories: 'section.categories', milestones: 'section.milestones' };
  const addPlaceholderKeys: Record<SidebarSection, string> = { projects: 'add.project', people: 'add.person', categories: 'add.category', milestones: 'add.milestone' };

  // Close section menu / group menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node))
        setSectionMenuOpen(false);
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node))
        setGroupMenuId(null);
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

  // Build flat rows: group headers + tasks, grouped by current sidebar section
  const { listRows, rows, allTasks: tasks } = useMemo(() => {
    const result: GanttRow[] = [];
    const allTasks: Task[] = [];

    const addTaskRows = (taskList: Task[]) => {
      for (const task of taskList) {
        allTasks.push(task);
        const depth = getTaskDepth(state, task.id);
        result.push({ kind: 'task', task, depth });
        // Add children as task rows (they are already flattened for project view)
        // For non-project views, manually flatten children
        if (!task.collapsed && task.children.length > 0 && sidebarSection !== 'projects') {
          const addChildren = (parentTask: Task, parentDepth: number) => {
            const children = parentTask.children
              .map((id) => state.tasks[id])
              .filter(Boolean)
              .sort((a, b) => a.order - b.order);
            for (const child of children) {
              allTasks.push(child);
              result.push({ kind: 'task', task: child, depth: parentDepth + 1 });
              if (!child.collapsed && child.children.length > 0)
                addChildren(child, parentDepth + 1);
            }
          };
          addChildren(task, depth);
        }
      }
    };

    switch (sidebarSection) {
      case 'projects': {
        const projects = Object.values(state.projects).sort((a, b) => a.order - b.order);
        for (const p of projects) {
          const pTasks = getFlattenedTasks(state, p.id);
          result.push({ kind: 'group', id: p.id, label: p.name, color: p.color });
          // getFlattenedTasks already includes children, just push them
          for (const task of pTasks) {
            allTasks.push(task);
            const depth = getTaskDepth(state, task.id);
            result.push({ kind: 'task', task, depth });
          }
        }
        break;
      }
      case 'people': {
        const people = Object.values(state.people).sort((a, b) => a.order - b.order);
        for (const p of people) {
          const pTasks = Object.values(state.tasks)
            .filter((t) => !t.parentId && hasDescendantWithAssignee(state, t.id, p.id))
            .sort((a, b) => a.order - b.order);
          result.push({ kind: 'group', id: p.id, label: p.name, color: p.color });
          addTaskRows(pTasks);
        }
        break;
      }
      case 'categories': {
        const categories = Object.values(state.categories).sort((a, b) => a.order - b.order);
        for (const c of categories) {
          const cTasks = Object.values(state.tasks)
            .filter((t) => !t.parentId && t.categoryIds.includes(c.id))
            .sort((a, b) => a.order - b.order);
          result.push({ kind: 'group', id: c.id, label: c.name, color: c.color });
          addTaskRows(cTasks);
        }
        // Uncategorized
        const uncategorized = Object.values(state.tasks)
          .filter((t) => !t.parentId && t.categoryIds.length === 0)
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

    // Filter out hidden groups and their tasks
    const hiddenIds = new Set(state.hiddenGroupIds ?? []);
    const listRows: GanttRow[] = []; // Left panel: group headers always shown
    const chartRows: GanttRow[] = []; // Right panel: hidden groups fully removed
    const filteredTasks: Task[] = [];
    let hidden = false;
    for (const row of result) {
      if (row.kind === 'group') {
        hidden = hiddenIds.has(row.id);
        listRows.push(row); // Always show in left panel
        if (!hidden) chartRows.push(row);
        continue;
      }
      if (!hidden) {
        listRows.push(row);
        chartRows.push(row);
        filteredTasks.push(row.task);
      }
    }

    return { listRows, rows: chartRows, allTasks: filteredTasks };
  }, [state, sidebarSection, t]);

  // Track container size for auto-fit (skip updates while resizing task list)
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(600);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      if (resizingTaskListRef.current) return;
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalDays = Math.max(1, dateToDayOffset(state.timelineEndDate, state.timelineStartDate));
  // Fixed dayWidth based on zoom level; content may exceed container → horizontal scroll
  const baseDayWidth = state.zoomLevel === 'day' ? 40 : state.zoomLevel === 'week' ? 16 : 5;
  const { dayWidth, chartWidth, autoZoom, headers } = useMemo(() => {
    const dw = Math.max(baseDayWidth, containerWidth / totalDays);
    const cw = Math.max(containerWidth, totalDays * dw);
    const az: 'day' | 'week' | 'month' = dw >= 25 ? 'day' : dw >= 8 ? 'week' : 'month';
    const hd = generateDateHeaders(state.timelineStartDate, state.timelineEndDate, az, dw);
    return { dayWidth: dw, chartWidth: cw, autoZoom: az, headers: hd };
  }, [containerWidth, totalDays, baseDayWidth, state.timelineStartDate, state.timelineEndDate]);
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

  // Dynamic ROW_HEIGHT: fit all rows vertically within container
  const availableHeight = containerHeight - HEADER_HEIGHT - milestoneAreaHeight;
  const ROW_HEIGHT = rows.length > 0
    ? Math.max(ROW_HEIGHT_MIN, Math.min(ROW_HEIGHT_DEFAULT, Math.floor(availableHeight / rows.length)))
    : ROW_HEIGHT_DEFAULT;


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
      const delta = e.clientX - resizeStartXRef.current;
      const newWidth = Math.min(TASK_LIST_MAX_WIDTH, Math.max(TASK_LIST_MIN_WIDTH, resizeStartWidthRef.current + delta));
      resizePendingRef.current = newWidth;
      setTaskListWidth(newWidth);
    };
    const onMouseUp = () => {
      if (resizingTaskListRef.current) {
        resizingTaskListRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Save width for current section
        taskListWidthsRef.current[sidebarSectionRef.current] = resizePendingRef.current;
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const startTaskListResize = (e: React.MouseEvent) => {
    resizingTaskListRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = taskListWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    setState(createTask(state, { title: newTaskTitle.trim() }));
    setNewTaskTitle('');
  };

  const handleAddChildTask = (parentId: string) => {
    if (!subtaskTitle.trim()) return;
    const parent = state.tasks[parentId];
    if (!parent) return;
    setState(createTask(state, {
      title: subtaskTitle.trim(),
      parentId,
      startDate: parent.startDate,
      endDate: parent.endDate,
      projectIds: [...parent.projectIds],
    }));
    setSubtaskTitle('');
    setAddingSubtaskFor(null);
  };

  const toggleCollapse = (taskId: string) => {
    const task = state.tasks[taskId];
    if (task && task.children.length > 0)
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
    if (e.dataTransfer.types.includes('text/plain') && (!dragReorder || targetTaskId !== dragReorder.taskId)) {
      setDropTargetTaskId(targetTaskId);
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

    const allSorted = Object.values(state.tasks).sort((a, b) => a.order - b.order);
    const ids = allSorted.map((t) => t.id);
    const fromIdx = ids.indexOf(draggedTaskId);
    const toIdx = ids.indexOf(targetTask.id);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    let insertIdx: number;
    if (currentDropPosition === 'below')
      insertIdx = fromIdx < toIdx ? toIdx : toIdx + 1;
    else
      insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    ids.splice(insertIdx, 0, draggedTaskId);
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
    if (dragGroupId && targetGroupId !== dragGroupId && targetGroupId !== '__uncategorized')
      setDropTargetGroupId(targetGroupId);
  };

  const reorderItems = <T extends { order: number }>(
    items: Record<string, T>,
    draggedId: string,
    targetId: string
  ): Record<string, T> => {
    const sorted = Object.values(items).sort((a, b) => a.order - b.order);
    const ids = sorted.map((item) => (item as any).id as string);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return items;
    ids.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    ids.splice(insertIdx, 0, draggedId);
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
    <div className="flex flex-1 overflow-hidden">
      <div className="flex h-full" style={{ width: '100%' }}>
        {/* Task list (left) */}
        <div className="relative flex flex-col shrink-0 overflow-hidden" style={{ width: taskListWidth, background: theme.bg800, borderRight: `1px solid ${theme.bg600}` }}>
          {/* Section selector */}
          <div className="relative shrink-0" ref={sectionMenuRef} style={{ borderBottom: `1px solid ${theme.bg600}` }}>
            <button
              className="w-full px-3 py-2 text-left text-xs font-semibold tracking-wider uppercase flex items-center justify-between"
              style={{ color: theme.text300 }}
              onClick={() => setSectionMenuOpen(!sectionMenuOpen)}
            >
              <span>{t(sectionLabelKeys[sidebarSection] as any)}</span>
              <span className="text-[10px]">▼</span>
            </button>
            {sectionMenuOpen && (
              <div
                className="absolute top-full left-0 w-full z-30 rounded-b-lg py-1"
                style={{ background: theme.bg700, border: `1px solid ${theme.bg500}`, borderTop: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', '--menu-hover': theme.accent } as React.CSSProperties}
              >
                {sectionKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSection(key)}
                    className="w-full px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2 menu-item"
                    style={{ color: theme.text200 }}
                  >
                    {sidebarSection === key && <span className="text-[10px]" style={{ color: theme.accent }}>✓</span>}
                    <span className={sidebarSection === key ? '' : 'ml-4'}>{t(sectionLabelKeys[key] as any)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Task rows */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {listRows.map((row, index) => {
              if (row.kind === 'group') {
                const isUncategorized = row.id === '__uncategorized';
                const isDragging = dragGroupId === row.id;
                const isDropTarget = dropTargetGroupId === row.id;
                const isHidden = (state.hiddenGroupIds ?? []).includes(row.id);
                return (
                  <div
                    key={`group-${index}`}
                    className="flex items-center px-3 font-semibold text-xs tracking-wide cursor-pointer relative"
                    style={{
                      height: ROW_HEIGHT,
                      background: row.color + '30',
                      borderBottom: `1px solid ${theme.bg700}`,
                      borderTop: isDropTarget ? `2px solid ${theme.accent}` : '2px solid transparent',
                      color: row.color,
                      opacity: isDragging ? 0.4 : 1,
                      zIndex: groupMenuId === row.id ? 50 : undefined,
                    } as React.CSSProperties}
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
                    <span className="flex-1 truncate" style={{ opacity: isHidden ? 0.4 : 1 }}>{row.label}</span>
                    {/* Group visibility menu */}
                    <div ref={groupMenuId === row.id ? groupMenuRef : undefined} className="relative ml-auto shrink-0">
                      <button
                        className="px-1 rounded text-[10px] opacity-50 hover:opacity-100"
                        style={{ color: row.color }}
                        onClick={(e) => { e.stopPropagation(); setGroupMenuId(groupMenuId === row.id ? null : row.id); }}
                      >▼</button>
                      {groupMenuId === row.id && (
                        <div
                          className="absolute right-0 top-full z-40 rounded py-1 shadow-lg"
                          style={{ background: theme.bg700, border: `1px solid ${theme.bg500}`, minWidth: 120, '--menu-hover': theme.accent } as React.CSSProperties}
                        >
                          <button
                            className="w-full px-3 py-1.5 text-left text-xs menu-item"
                            style={{ color: theme.text200 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const hidden = state.hiddenGroupIds ?? [];
                              const next = isHidden
                                ? hidden.filter((id) => id !== row.id)
                                : [...hidden, row.id];
                              setState({ ...state, hiddenGroupIds: next });
                              setGroupMenuId(null);
                            }}
                          >
                            {isHidden ? t('group.show' as any) : t('group.hide' as any)}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const { task, depth } = row;
              const taskProgress = computeProgress(task, state.tasks);
              const status = getTaskStatus(task, state.tasks);
              const statusColor = getStatusColor(status);
              const hasChildren = task.children.length > 0;
              const isLeaf = !hasChildren;
              const categories = task.categoryIds.map((cid) => state.categories[cid]).filter(Boolean);
              const taskIndex = tasks.indexOf(task);
              const isBeforeStart = new Date(task.startDate) > new Date();
              const canAdd = canAddChild(state, task.id);

              const isDraggingTask = dragReorder?.taskId === task.id;
              const isTaskDropTarget = dropTargetTaskId === task.id && dragReorder?.taskId !== task.id;

              return (
                <div
                  key={`task-${index}`}
                  className="flex items-center cursor-pointer transition-colors group menu-item"
                  style={{
                    height: ROW_HEIGHT,
                    paddingLeft: 12 + depth * 20,
                    borderBottom: isTaskDropTarget && dropPosition === 'below' ? `2px solid ${theme.accent}` : `1px solid ${theme.bg700}`,
                    borderTop: isTaskDropTarget && dropPosition === 'above' ? `2px solid ${theme.accent}` : '2px solid transparent',
                    background: state.selectedTaskId === task.id ? theme.bg700 : undefined,
                    '--menu-hover': theme.bg600,
                    opacity: isDraggingTask ? 0.4 : 1,
                  } as React.CSSProperties}
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

                  {hasChildren ? (
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

                  <div className={`${isLeaf && depth > 0 ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full mr-2 shrink-0`} style={{ background: isBeforeStart ? theme.text400 : statusColor }} />
                  <span className={`${depth > 0 ? 'text-xs' : 'text-sm'} truncate flex-1 mr-2`} style={{
                    color: isBeforeStart ? undefined : statusColor,
                    textDecoration: taskProgress >= 100 ? 'line-through' : 'none',
                  }}>{task.title}</span>

                  {depth === 0 && categories.map((cat) => (
                    <span key={cat.id} className="text-[9px] px-1.5 py-0.5 rounded font-medium mr-1 shrink-0" style={{ background: cat.color + '33', color: cat.color }}>
                      {cat.name}
                    </span>
                  ))}

                  {sidebarSection !== 'people' && (
                    <div className="flex -space-x-1 mr-2 shrink-0">
                      {task.assigneeIds.slice(0, 3).map((aid) => {
                        const person = state.people[aid];
                        if (!person) return null;
                        return (
                          <div key={aid} className={`${depth > 0 ? 'w-4 h-4 text-[7px]' : 'w-5 h-5 text-[8px]'} rounded-full flex items-center justify-center font-bold text-white`} style={{ background: person.color, border: `1px solid ${theme.bg800}` }} title={person.name}>
                            {person.avatar}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <span className="text-[10px] font-medium w-8 text-right shrink-0" style={{ color: statusColor }}>{taskProgress}%</span>

                  {!readOnly && canAdd && (
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
            })}

            {/* Child task input */}
            {addingSubtaskFor && (
              <div className="flex items-center px-4 py-1" style={{ background: theme.bg700, borderBottom: `1px solid ${theme.bg600}` }}>
                <input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder={t('tasks.subtaskPlaceholder')}
                  className="flex-1 text-xs"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddChildTask(addingSubtaskFor); if (e.key === 'Escape') setAddingSubtaskFor(null); }}
                />
                <button onClick={() => handleAddChildTask(addingSubtaskFor)} className="ml-1 px-2 py-1 rounded text-xs font-medium" style={{ background: theme.accent + '30', color: theme.accent }}>{t('tasks.addButton')}</button>
              </div>
            )}

            {/* Bottom drop zone */}
            <div
              className="flex-1 min-h-[40px]"
              style={{
                borderTop: (dropTargetTaskId === '__bottom' || dropTargetGroupId === '__bottom') ? `2px solid ${theme.accent}` : '2px solid transparent',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
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
            className="absolute top-0 right-0 h-full cursor-col-resize z-10"
            style={{ width: 8, marginRight: -4 }}
          >
            <div className="w-px h-full mx-auto" style={{ background: theme.bg600 }} />
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Date range controls */}
          <div className="shrink-0 flex items-center gap-3 px-3" style={{ height: 36, background: theme.bg800, borderBottom: `1px solid ${theme.bg700}` }}>
            <div className="flex items-center gap-1.5" style={{ height: 24 }}>
              <input
                type="date"
                value={state.timelineStartDate}
                onChange={(e) => { if (e.target.value) setState({ ...state, timelineStartDate: e.target.value }); }}
                className="text-xs px-1.5 rounded"
                style={{ background: theme.bg700, color: theme.text200, border: `1px solid ${theme.bg600}`, height: 24 }}
              />
              <span className="text-xs" style={{ color: theme.text400 }}>–</span>
              <input
                type="date"
                value={state.timelineEndDate}
                onChange={(e) => { if (e.target.value) setState({ ...state, timelineEndDate: e.target.value }); }}
                className="text-xs px-1.5 rounded"
                style={{ background: theme.bg700, color: theme.text200, border: `1px solid ${theme.bg600}`, height: 24 }}
              />
            </div>
            <div className="flex items-center gap-0.5" style={{ height: 24 }}>
              <button
                onClick={() => {
                  const d = new Date(state.timelineEndDate);
                  d.setMonth(d.getMonth() - 1);
                  if (d > new Date(state.timelineStartDate))
                    setState({ ...state, timelineEndDate: d.toISOString().split('T')[0] });
                }}
                className="text-xs px-2 rounded font-bold"
                style={{ background: theme.bg700, color: theme.text300, border: `1px solid ${theme.bg600}`, height: 24 }}
                title="End date −1 month"
              >−</button>
              <button
                onClick={() => {
                  const d = new Date(state.timelineEndDate);
                  d.setMonth(d.getMonth() + 1);
                  setState({ ...state, timelineEndDate: d.toISOString().split('T')[0] });
                }}
                className="text-xs px-2 rounded font-bold"
                style={{ background: theme.bg700, color: theme.text300, border: `1px solid ${theme.bg600}`, height: 24 }}
                title="End date +1 month"
              >+</button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: chartWidth, minHeight: HEADER_HEIGHT + rows.length * ROW_HEIGHT + milestoneAreaHeight }}>
            {/* Header */}
            <div className="sticky top-0 z-10" style={{ height: HEADER_HEIGHT, background: theme.bg800, borderBottom: `1px solid ${theme.bg600}` }}>
              <svg width={chartWidth} height={HEADER_HEIGHT}>
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
            <svg width={chartWidth} height={rows.length * ROW_HEIGHT + milestoneAreaHeight} style={{ display: 'block' }}>
              <defs>
                <marker id="arrowhead" markerWidth={8} markerHeight={6} refX={8} refY={3} orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill={theme.accent} opacity={0.6} />
                </marker>
              </defs>

              {/* Grid row backgrounds (task rows only) */}
              {rows.map((row, i) => (
                row.kind !== 'group' ? (
                  <rect key={`row-${i}`} x={0} y={i * ROW_HEIGHT} width="100%" height={ROW_HEIGHT}
                    fill={i % 2 === 0 ? 'transparent' : theme.rowAlt} />
                ) : null
              ))}

              {/* Grid columns */}
              {headers.flatMap((group) =>
                group.subLabels.map((sub) => (
                  <line key={`grid-${sub.dayOffset}`} x1={sub.dayOffset * dayWidth} y1={0} x2={sub.dayOffset * dayWidth} y2={rows.length * ROW_HEIGHT} stroke={theme.gridLine} strokeWidth={1} />
                ))
              )}

              {/* Group row overlays (drawn over grid columns to hide them) */}
              {rows.map((row, i) => (
                row.kind === 'group' ? (
                  <g key={`group-overlay-${i}`}>
                    <rect x={0} y={i * ROW_HEIGHT} width="100%" height={ROW_HEIGHT}
                      fill={theme.bg800} />
                    <rect x={0} y={i * ROW_HEIGHT} width="100%" height={ROW_HEIGHT}
                      fill={row.color + '30'} />
                    <text
                      x={8}
                      y={i * ROW_HEIGHT + ROW_HEIGHT / 2}
                      dominantBaseline="central"
                      fill={row.color}
                      opacity={0.7}
                      fontSize={13}
                      fontWeight={600}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {row.label}
                    </text>
                  </g>
                ) : null
              ))}

              {/* Today line */}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <line x1={todayOffset * dayWidth} y1={0} x2={todayOffset * dayWidth} y2={rows.length * ROW_HEIGHT + 40} stroke={theme.accent} strokeWidth={2} strokeDasharray="4,4" opacity={0.6} />
              )}

              {/* Milestone diamonds */}
              {(() => {
                const sorted = milestones
                  .map((m) => {
                    const mTasks = m.taskIds.map((id) => state.tasks[id]).filter(Boolean);
                    const completedTasks = mTasks.filter((mt) => computeProgress(mt, state.tasks) >= 100).length;
                    const totalTasks = mTasks.length;
                    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                    const label = `${m.title} (${progress}%)`;
                    // Estimate text width: ~6px per char + diamond + padding
                    const textWidth = label.length * 6 + 20;
                    return { ...m, mx: dateToDayOffset(m.date, state.timelineStartDate) * dayWidth, label, progress, textWidth };
                  })
                  .sort((a, b) => a.mx - b.mx);
                const rowEnds: number[] = [];
                const milestoneRows: { m: typeof sorted[0]; row: number }[] = [];
                for (const m of sorted) {
                  let placed = false;
                  for (let r = 0; r < rowEnds.length; r++) {
                    if (m.mx - rowEnds[r] >= m.textWidth) {
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
                  let mStatus: 'completed' | 'on-track' | 'at-risk' | 'behind' = 'on-track';
                  const totalTasks = mTasks.length;
                  const completedTasks = mTasks.filter((mt) => computeProgress(mt, state.tasks) >= 100).length;
                  if (totalTasks > 0 && completedTasks === totalTasks) mStatus = 'completed';
                  else if (totalTasks > 0) {
                    const statuses = mTasks.map((mt) => getTaskStatus(mt, state.tasks));
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
                        <text x={10} y={4} fill={theme.text100} fontSize={10} fontWeight={600}>{m.label}</text>
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

              {/* Subtask region backgrounds */}
              {rows.map((row, index) => {
                if (row.kind !== 'task') return null;
                const task = row.task;
                if (task.children.length === 0) return null;
                const childIndices = rows
                  .map((r, ri) => r.kind === 'task' && task.children.includes(r.task.id) ? ri : -1)
                  .filter((ri) => ri >= 0);
                if (childIndices.length === 0) return null;
                const firstChildIdx = childIndices[0];
                const lastChildIdx = childIndices[childIndices.length - 1];
                const firstChild = rows[firstChildIdx] as { kind: 'task'; task: Task; depth: number };
                const lastChild = rows[lastChildIdx] as { kind: 'task'; task: Task; depth: number };
                const bgX = dateToDayOffset(firstChild.task.startDate, state.timelineStartDate) * dayWidth;
                const bgW = dateToDayOffset(lastChild.task.endDate, state.timelineStartDate) * dayWidth - bgX;
                const bgY = index * ROW_HEIGHT + ROW_HEIGHT;
                const bgH = (lastChildIdx - index) * ROW_HEIGHT;
                return (
                  <rect key={`subtask-bg-${index}`} x={bgX} y={bgY} width={bgW} height={bgH}
                    rx={4} fill={theme.text400} opacity={0.18} style={{ pointerEvents: 'none' }} />
                );
              })}

              {/* Task bars */}
              {rows.map((row, index) => {
                if (row.kind !== 'task') return null;
                const task = row.task;
                const depth = row.depth;
                const startOffset = dateToDayOffset(task.startDate, state.timelineStartDate);
                const endOffset = dateToDayOffset(task.endDate, state.timelineStartDate);
                const x = startOffset * dayWidth;
                const width = Math.max((endOffset - startOffset) * dayWidth, 4);
                const hasChildren = task.children.length > 0;
                const isLeafChild = !hasChildren && depth > 0;

                // Leaf children get slightly thinner bars
                const y = isLeafChild ? index * ROW_HEIGHT + 10 : index * ROW_HEIGHT + 8;
                const barHeight = isLeafChild ? ROW_HEIGHT - 20 : ROW_HEIGHT - 16;

                const taskProgress = computeProgress(task, state.tasks);
                const status = getTaskStatus(task, state.tasks);
                const statusColor = getStatusColor(status);

                return (
                  <g key={`bar-${index}`}>
                    <rect x={x} y={y} width={width} height={barHeight} rx={hasChildren ? 6 : isLeafChild ? 4 : 6}
                      fill={hasChildren ? theme.barParentBg : isLeafChild ? (statusColor + '40') : theme.barBg}
                      stroke={state.selectedTaskId === task.id ? theme.accent : 'transparent'} strokeWidth={1.5}
                      style={{ cursor: readOnly ? 'pointer' : 'grab' }}
                      onClick={() => setState({ ...state, selectedTaskId: task.id, editingItemId: null, editingItemType: null })}
                      onMouseDown={(e) => {
                        if (readOnly) return;
                        e.preventDefault();
                        setDragTask({ id: task.id, type: 'move', startX: e.clientX, origStart: task.startDate, origEnd: task.endDate });
                      }}
                      onMouseEnter={(e) => { if (width <= 60) setTooltip({ text: task.title, x: e.clientX, y: e.clientY }); }}
                      onMouseMove={(e) => { if (width <= 60 && tooltip) setTooltip({ text: task.title, x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    <rect x={x} y={y} width={Math.max(width * (taskProgress / 100), 0)} height={barHeight} rx={hasChildren ? 6 : isLeafChild ? 4 : 6} fill={statusColor} opacity={0.7} style={{ pointerEvents: 'none' }} />
                    {hasChildren && (() => {
                      // Find first and last child task rows
                      const childIndices = rows
                        .map((r, ri) => r.kind === 'task' && task.children.includes(r.task.id) ? ri : -1)
                        .filter((ri) => ri >= 0);
                      if (childIndices.length === 0) return null;
                      const firstChildIdx = childIndices[0];
                      const lastChildIdx = childIndices[childIndices.length - 1];
                      const firstChild = rows[firstChildIdx] as { kind: 'task'; task: Task; depth: number };
                      const lastChild = rows[lastChildIdx] as { kind: 'task'; task: Task; depth: number };
                      const fcStartX = dateToDayOffset(firstChild.task.startDate, state.timelineStartDate) * dayWidth;
                      const lcEndX = dateToDayOffset(lastChild.task.endDate, state.timelineStartDate) * dayWidth;
                      const fcY = firstChildIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                      const lcY = lastChildIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                      const circleCy = y + barHeight - 1;
                      return (
                        <>
                          <circle cx={fcStartX} cy={circleCy} r={3} fill={theme.text400} />
                          <circle cx={lcEndX} cy={circleCy} r={3} fill={theme.text400} />
                          <line x1={fcStartX} y1={circleCy} x2={fcStartX} y2={fcY}
                            stroke={theme.text400} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} style={{ pointerEvents: 'none' }} />
                          <line x1={lcEndX} y1={circleCy} x2={lcEndX} y2={lcY}
                            stroke={theme.text400} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} style={{ pointerEvents: 'none' }} />
                        </>
                      );
                    })()}
                    {(() => {
                      const visibleX = Math.max(x, 0);
                      const visibleWidth = width - (visibleX - x);
                      if (visibleWidth <= 60) return null;
                      const textX = visibleX + 8;
                      const maxChars = Math.floor(visibleWidth / 7);
                      return (
                        <text x={textX} y={y + barHeight / 2 + 4} fill={theme.text100} fontSize={isLeafChild ? 10 : 11} fontWeight={isLeafChild ? 400 : 500} style={{ pointerEvents: 'none' }}>
                          {task.title.length > maxChars ? task.title.slice(0, maxChars) + '…' : task.title}
                        </text>
                      );
                    })()}
                    {taskProgress >= 100 && width > 10 && (
                      <line x1={x - 4} y1={y + barHeight / 2} x2={x + width + 4} y2={y + barHeight / 2}
                        stroke={theme.text100} strokeWidth={1.5} opacity={0.5} style={{ pointerEvents: 'none' }} />
                    )}
                    {!readOnly && (
                      <rect x={x + width - 6} y={y} width={6} height={barHeight} fill="transparent" style={{ cursor: 'ew-resize' }}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragTask({ id: task.id, type: 'resize-end', startX: e.clientX, origStart: task.startDate, origEnd: task.endDate }); }}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        </div>
      </div>
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 rounded text-xs font-medium shadow-lg pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 30,
            background: theme.bg600,
            color: theme.text100,
            border: `1px solid ${theme.bg500}`,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
