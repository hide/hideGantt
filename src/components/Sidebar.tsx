import { useState, useRef, useEffect, useMemo } from 'react';
import type { GanttState, Task, SidebarSection } from '../types';
import { getTaskStatus, getStatusColor } from '../types';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';
import {
  createProject, createPerson, createCategory, createMilestone,
} from '../store';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#f97316', '#84cc16',
];

interface SidebarProps {
  state: GanttState;
  setState: (s: GanttState) => void;
  readOnly: boolean;
}

/** Compact task list shown under sidebar items */
function TaskList({ tasks, state, setState, contextProjectId }: { tasks: Task[]; state: GanttState; setState: (s: GanttState) => void; contextProjectId?: string }) {
  const theme = useTheme();
  const t = useT();

  if (tasks.length === 0)
    return (
      <div className="ml-5 mt-1 mb-1 text-[10px]" style={{ color: theme.text400 }}>
        {t('sidebar.noTasks' as any)}
      </div>
    );

  return (
    <div className="ml-5 mt-1 mb-1 space-y-0.5">
      {tasks.map((task) => {
        const status = getTaskStatus(task);
        const statusColor = getStatusColor(status);
        return (
          <button
            key={task.id}
            onClick={(e) => { e.stopPropagation(); setState({ ...state, selectedTaskId: task.id, editingItemId: null, editingItemType: null }); }}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-all menu-item"
            style={{
              background: state.selectedTaskId === task.id ? theme.bg500 : undefined,
              '--menu-hover': theme.bg600,
            } as React.CSSProperties}
          >
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />
            <span className="text-[11px] truncate flex-1" style={{ color: theme.text200 }}>{task.title}</span>
            <span className="text-[9px] shrink-0 tabular-nums" style={{ color: theme.text400 }}>{task.progress}%</span>
          </button>
        );
      })}
    </div>
  );
}

export function Sidebar({ state, setState, readOnly }: SidebarProps) {
  const theme = useTheme();
  const t = useT();
  const section = state.sidebarSection ?? 'projects';
  const setSection = (s: SidebarSection) => { setExpandedIds(new Set()); setState({ ...state, sidebarSection: s, sidebarFilterId: null }); };
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
  const [width, setWidth] = useState(240);
  const menuRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Resize handle drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const newWidth = Math.min(480, Math.max(160, e.clientX));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = () => {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setSectionMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allTasks = useMemo(() => Object.values(state.tasks), [state.tasks]);

  // Compute tasks per item for the current section
  const getTasksForItem = (itemId: string): Task[] => {
    switch (section) {
      case 'projects':
        return allTasks.filter((tk) => tk.projectIds.includes(itemId)).sort((a, b) => a.order - b.order);
      case 'people':
        return allTasks.filter((tk) => tk.assigneeIds.includes(itemId)).sort((a, b) => a.order - b.order);
      case 'categories':
        return allTasks.filter((tk) => tk.categoryIds.includes(itemId)).sort((a, b) => a.order - b.order);
      case 'milestones': {
        const milestone = state.milestones[itemId];
        if (!milestone) return [];
        return milestone.taskIds.map((id) => state.tasks[id]).filter(Boolean).sort((a, b) => a.order - b.order);
      }
      default:
        return [];
    }
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const sectionKeys: SidebarSection[] = ['projects', 'people', 'categories', 'milestones'];
  const sectionIcons: Record<SidebarSection, string> = { projects: '◆', people: '●', categories: '■', milestones: '◇' };

  const sectionLabelKeys: Record<SidebarSection, 'section.projects' | 'section.people' | 'section.categories' | 'section.milestones'> = {
    projects: 'section.projects', people: 'section.people', categories: 'section.categories', milestones: 'section.milestones',
  };
  const addPlaceholderKeys: Record<SidebarSection, 'add.project' | 'add.person' | 'add.category' | 'add.milestone'> = {
    projects: 'add.project', people: 'add.person', categories: 'add.category', milestones: 'add.milestone',
  };

  const openEdit = (id: string) => {
    setState({ ...state, editingItemId: id, editingItemType: section, selectedTaskId: null });
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const color = pickColor();
    let next = state;
    switch (section) {
      case 'projects': next = createProject(state, newName.trim(), color); break;
      case 'people': next = createPerson(state, newName.trim(), color); break;
      case 'categories': next = createCategory(state, newName.trim(), color); break;
      case 'milestones':
        if (!milestoneDate || !state.activeProjectId) return;
        next = createMilestone(state, newName.trim(), milestoneDate, state.activeProjectId, color);
        break;
    }
    setState(next);
    setNewName('');
  };

  return (
    <div className="h-full flex shrink-0 relative" style={{ width }}>
    <div className="h-full flex flex-col flex-1 min-w-0" style={{ background: theme.bg800 }}>
      {/* Section heading — dropdown trigger */}
      <div ref={menuRef} className="relative shrink-0" style={{ borderBottom: `1px solid ${theme.bg600}` }}>
        <button
          onClick={() => setSectionMenuOpen(!sectionMenuOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-80"
          style={{ color: theme.text300 }}
        >
          <span className="flex items-center gap-2">
            <span style={{ color: theme.accent }}>{sectionIcons[section]}</span>
            {t(sectionLabelKeys[section])}
          </span>
          <span className="text-[10px]" style={{ color: theme.text400 }}>{sectionMenuOpen ? '▲' : '▼'}</span>
        </button>

        {sectionMenuOpen && (
          <div
            className="absolute top-full left-0 right-0 z-50 rounded-b-lg py-1 fade-in"
            style={{ background: theme.bg700, border: `1px solid ${theme.bg500}`, borderTop: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', '--menu-hover': theme.accent } as React.CSSProperties}
          >
            {sectionKeys.map((s) => (
              <button
                key={s}
                onClick={() => { setSection(s); setSectionMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 transition-all menu-item"
                style={{ color: theme.text200 }}
              >
                <span className="w-4 text-center">{section === s ? '✓' : ''}</span>
                <span>{sectionIcons[s]}</span>
                {t(sectionLabelKeys[s])}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Projects */}
        {section === 'projects' &&
          Object.values(state.projects).map((p) => {
            const isExpanded = expandedIds.has(p.id);
            const tasks = isExpanded ? getTasksForItem(p.id) : [];
            const taskCount = allTasks.filter((tk) => tk.projectIds.includes(p.id)).length;
            return (
              <div key={p.id} className="mb-1">
                <div
                  onClick={() => { toggleExpand(p.id); setState({ ...state, activeProjectId: p.id }); }}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all menu-item"
                  style={{ background: state.activeProjectId === p.id ? theme.bg600 : undefined, '--menu-hover': theme.bg500 } as React.CSSProperties}
                >
                  <span className="text-[8px] shrink-0 transition-transform" style={{ color: theme.text400, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: p.color }} />
                  <span className="text-sm truncate flex-1 hover:underline" onClick={(e) => { e.stopPropagation(); setState({ ...state, activeProjectId: p.id, editingItemId: p.id, editingItemType: 'projects', selectedTaskId: null }); }}>{p.name}</span>
                  <span className="text-[10px] shrink-0" style={{ color: theme.text400 }}>{taskCount}</span>
                </div>
                {isExpanded && <TaskList tasks={tasks} state={state} setState={setState} contextProjectId={p.id} />}
              </div>
            );
          })}

        {/* People */}
        {section === 'people' &&
          Object.values(state.people).map((p) => {
            const isExpanded = expandedIds.has(p.id);
            const tasks = isExpanded ? getTasksForItem(p.id) : [];
            const taskCount = allTasks.filter((tk) => tk.assigneeIds.includes(p.id)).length;
            return (
              <div key={p.id} className="mb-1">
                <div
                  onClick={() => { toggleExpand(p.id); setState({ ...state, sidebarFilterId: p.id }); }}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all menu-item"
                  style={{ background: isExpanded ? theme.bg600 : undefined, '--menu-hover': theme.bg500 } as React.CSSProperties}
                >
                  <span className="text-[8px] shrink-0 transition-transform" style={{ color: theme.text400, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: p.color }}>{p.avatar}</div>
                  <span className="text-sm truncate flex-1 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(p.id); }}>{p.name}</span>
                  <span className="text-[10px] shrink-0" style={{ color: theme.text400 }}>{taskCount}</span>
                </div>
                {isExpanded && <TaskList tasks={tasks} state={state} setState={setState} />}
              </div>
            );
          })}

        {/* Categories */}
        {section === 'categories' &&
          Object.values(state.categories).map((c) => {
            const isExpanded = expandedIds.has(c.id);
            const tasks = isExpanded ? getTasksForItem(c.id) : [];
            const taskCount = allTasks.filter((tk) => tk.categoryIds.includes(c.id)).length;
            return (
              <div key={c.id} className="mb-1">
                <div
                  onClick={() => { toggleExpand(c.id); setState({ ...state, sidebarFilterId: c.id }); }}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all menu-item"
                  style={{ background: isExpanded ? theme.bg600 : undefined, '--menu-hover': theme.bg500 } as React.CSSProperties}
                >
                  <span className="text-[8px] shrink-0 transition-transform" style={{ color: theme.text400, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="text-sm truncate flex-1 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(c.id); }}>{c.name}</span>
                  <span className="text-[10px] shrink-0" style={{ color: theme.text400 }}>{taskCount}</span>
                </div>
                {isExpanded && <TaskList tasks={tasks} state={state} setState={setState} />}
              </div>
            );
          })}

        {/* Milestones */}
        {section === 'milestones' &&
          Object.values(state.milestones)
            .filter((m) => m.projectId === state.activeProjectId)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((m) => {
              const isExpanded = expandedIds.has(m.id);
              const tasks = isExpanded ? getTasksForItem(m.id) : [];
              const taskCount = m.taskIds.length;
              const completedCount = m.taskIds.filter((id) => state.tasks[id]?.progress >= 100).length;
              return (
                <div key={m.id} className="mb-1">
                  <div
                    onClick={() => { toggleExpand(m.id); setState({ ...state, sidebarFilterId: m.id }); }}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all menu-item"
                    style={{ background: isExpanded ? theme.bg600 : undefined, '--menu-hover': theme.bg500 } as React.CSSProperties}
                  >
                    <span className="text-[8px] shrink-0 transition-transform" style={{ color: theme.text400, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <span className="text-sm truncate flex-1 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(m.id); }}>{m.title}</span>
                    <span className="text-[10px] shrink-0" style={{ color: theme.text400 }}>{completedCount}/{taskCount}</span>
                  </div>
                  {isExpanded && <TaskList tasks={tasks} state={state} setState={setState} />}
                </div>
              );
            })}
      </div>

      {/* Add Form */}
      {!readOnly && (
        <div className="p-3 shrink-0" style={{ borderTop: `1px solid ${theme.bg600}` }}>
          <div className="flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t(addPlaceholderKeys[section])}
              className="flex-1 min-w-0"
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAdd()}
            />
            <button onClick={handleAdd} className="px-2 py-1 rounded text-white text-sm font-medium" style={{ background: theme.accent }}>+</button>
          </div>
          {section === 'milestones' && (
            <input type="date" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} className="w-full mt-1" />
          )}
        </div>
      )}
    </div>
    {/* Resize handle */}
    <div
      onMouseDown={startResize}
      className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 group/handle"
      style={{ background: 'transparent' }}
    >
      <div
        className="w-px h-full ml-auto transition-colors"
        style={{ background: theme.bg600 }}
      />
    </div>
    </div>
  );
}
