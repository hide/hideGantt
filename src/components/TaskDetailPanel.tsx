import { useState } from 'react';
import type { GanttState, Task } from '../types';
import { getTaskStatus, getStatusColor, computeProgress } from '../types';
import { updateTask, deleteTask, createTask, canAddChild } from '../store';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';

interface TaskDetailPanelProps {
  state: GanttState;
  setState: (s: GanttState) => void;
  taskId: string;
  onClose: () => void;
  readOnly: boolean;
}

export function TaskDetailPanel({ state, setState, taskId, onClose, readOnly }: TaskDetailPanelProps) {
  const theme = useTheme();
  const t = useT();
  const task = state.tasks[taskId];
  if (!task) return null;

  const taskProgress = computeProgress(task, state.tasks);
  const status = getTaskStatus(task, state.tasks);
  const statusColor = getStatusColor(status);

  const update = (updates: Partial<Task>) => {
    setState(updateTask(state, taskId, updates));
  };

  const handleDelete = () => {
    setState({ ...deleteTask(state, taskId), selectedTaskId: null });
  };

  const allTasks = Object.values(state.tasks).filter((t) => t.id !== taskId);
  const isLeaf = task.children.length === 0;

  const labelStyle = { color: theme.text400 };

  return (
    <div className="w-96 h-full shrink-0 slide-in overflow-y-auto" style={{ background: theme.bg800, borderLeft: `1px solid ${theme.bg600}` }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${theme.bg600}` }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
          <span className="text-xs font-semibold" style={{ color: statusColor }}>
            {t('detail.status' as any)}：{t(`status.${status}` as any)}
          </span>
        </div>
        <button onClick={onClose} className="text-lg" style={{ color: theme.text400 }}>×</button>
      </div>

      <div className="p-4 space-y-4">
        {/* Title */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.title')}</label>
          {readOnly ? <p className="text-base font-semibold">{task.title}</p> : (
            <input value={task.title} onChange={(e) => update({ title: e.target.value })} className="w-full text-base font-semibold" />
          )}
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.description')}</label>
          {readOnly ? <p className="text-sm" style={{ color: theme.text200 }}>{task.description || '—'}</p> : (
            <textarea value={task.description} onChange={(e) => update({ description: e.target.value })} className="w-full h-20 resize-none" placeholder={t('detail.descriptionPlaceholder')} />
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.startDate')}</label>
            {readOnly ? <p className="text-sm">{task.startDate}</p> : (
              <input type="date" value={task.startDate} onChange={(e) => update({ startDate: e.target.value })} className="w-full" />
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.endDate')}</label>
            {readOnly ? <p className="text-sm">{task.endDate}</p> : (
              <input type="date" value={task.endDate} onChange={(e) => update({ endDate: e.target.value })} className="w-full" />
            )}
          </div>
        </div>

        {/* Progress */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.progress')}: {taskProgress}%</label>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: theme.bg600 }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${taskProgress}%`, background: statusColor }} />
          </div>
          {/* Leaf tasks: toggle done */}
          {isLeaf && !readOnly && (
            <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={task.progress >= 100}
                onChange={() => update({ progress: task.progress >= 100 ? 0 : 100 })}
                style={{ accentColor: theme.accent }}
              />
              <span style={{ color: theme.text200 }}>{t('detail.markDone' as any)}</span>
            </label>
          )}
        </div>

        {/* Child Tasks */}
        <ChildTaskList task={task} state={state} setState={setState} readOnly={readOnly} />

        {/* Projects */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.projects')}</label>
          <div className="flex flex-wrap gap-1">
            {Object.values(state.projects).map((p) => {
              const isActive = task.projectIds.includes(p.id);
              return (
                <button key={p.id}
                  onClick={() => { if (readOnly) return; update({ projectIds: isActive ? task.projectIds.filter((id) => id !== p.id) : [...task.projectIds, p.id] }); }}
                  className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                  style={isActive ? { background: p.color, color: '#fff' } : { background: theme.bg700, color: theme.text400 }}
                >{p.name}</button>
              );
            })}
          </div>
        </div>

        {/* Assignees */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.assignees')}</label>
          <div className="flex flex-wrap gap-1">
            {Object.values(state.people).map((p) => {
              const isAssigned = task.assigneeIds.includes(p.id);
              return (
                <button key={p.id}
                  onClick={() => { if (readOnly) return; update({ assigneeIds: isAssigned ? task.assigneeIds.filter((id) => id !== p.id) : [...task.assigneeIds, p.id] }); }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all"
                  style={isAssigned ? { background: p.color, color: '#fff' } : { background: theme.bg700, color: theme.text400 }}
                >
                  <span className="text-[10px]">{p.avatar}</span>{p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.category')}</label>
          <div className="flex flex-wrap gap-1">
            {Object.values(state.categories).map((c) => {
              const isActive = task.categoryIds.includes(c.id);
              return (
                <button key={c.id}
                  onClick={() => { if (readOnly) return; update({ categoryIds: isActive ? task.categoryIds.filter((id) => id !== c.id) : [...task.categoryIds, c.id] }); }}
                  className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                  style={isActive ? { background: c.color, color: '#fff' } : { background: theme.bg700, color: theme.text400 }}
                >{c.name}</button>
              );
            })}
          </div>
        </div>

        {/* Milestone */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.milestone')}</label>
          {readOnly ? (
            <span className="text-sm">{task.milestoneId ? state.milestones[task.milestoneId]?.title : '—'}</span>
          ) : (
            <select value={task.milestoneId ?? ''}
              onChange={(e) => {
                const milestoneId = e.target.value || null;
                let next = updateTask(state, taskId, { milestoneId });
                if (task.milestoneId && next.milestones[task.milestoneId])
                  next = { ...next, milestones: { ...next.milestones, [task.milestoneId]: { ...next.milestones[task.milestoneId], taskIds: next.milestones[task.milestoneId].taskIds.filter((id) => id !== taskId) } } };
                if (milestoneId && next.milestones[milestoneId])
                  next = { ...next, milestones: { ...next.milestones, [milestoneId]: { ...next.milestones[milestoneId], taskIds: [...next.milestones[milestoneId].taskIds, taskId] } } };
                setState(next);
              }}
              className="w-full"
            >
              <option value="">{t('detail.none')}</option>
              {Object.values(state.milestones).filter((m) => m.projectId === state.activeProjectId).map((m) => (
                <option key={m.id} value={m.id}>{m.title} ({m.date})</option>
              ))}
            </select>
          )}
        </div>

        {/* Dependencies */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>{t('detail.dependencies')}</label>
          {readOnly ? (
            <div className="space-y-1">
              {task.dependencyIds.length === 0 && <span className="text-sm" style={{ color: theme.text400 }}>—</span>}
              {task.dependencyIds.map((depId) => (
                <div key={depId} className="text-sm" style={{ color: theme.text200 }}>{state.tasks[depId]?.title ?? depId}</div>
              ))}
            </div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {allTasks.filter((t) => t.id !== taskId && t.parentId !== taskId).map((depTask) => {
                const isDep = task.dependencyIds.includes(depTask.id);
                return (
                  <label key={depTask.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={isDep}
                      onChange={() => update({ dependencyIds: isDep ? task.dependencyIds.filter((id) => id !== depTask.id) : [...task.dependencyIds, depTask.id] })}
                      style={{ accentColor: theme.accent }}
                    />
                    <span style={{ color: isDep ? theme.text100 : theme.text400 }}>{depTask.title}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Delete */}
        {!readOnly && (
          <button
            onClick={handleDelete}
            className="w-full py-2 rounded-lg text-sm font-medium transition-all"
            style={{ color: theme.danger, border: `1px solid ${theme.danger}33` }}
          >
            {t('detail.deleteTask')}
          </button>
        )}
      </div>
    </div>
  );
}

function ChildTaskList({ task, state, setState, readOnly }: { task: Task; state: GanttState; setState: (s: GanttState) => void; readOnly: boolean }) {
  const theme = useTheme();
  const t = useT();
  const [newTitle, setNewTitle] = useState('');

  const children = task.children
    .map((id) => state.tasks[id])
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);

  const canAdd = canAddChild(state, task.id);
  const doneCount = children.filter((c) => computeProgress(c, state.tasks) >= 100).length;

  const addChild = () => {
    if (!newTitle.trim()) return;
    setState(createTask(state, {
      title: newTitle.trim(),
      parentId: task.id,
      startDate: task.startDate,
      endDate: task.endDate,
      projectIds: [...task.projectIds],
    }));
    setNewTitle('');
  };

  const toggleDone = (childId: string) => {
    const child = state.tasks[childId];
    if (!child || child.children.length > 0) return; // only toggle leaf tasks
    const newProgress = child.progress >= 100 ? 0 : 100;
    setState(updateTask(state, childId, { progress: newProgress }));
  };

  const removeChild = (childId: string) => {
    setState(deleteTask(state, childId));
  };

  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: theme.text400 }}>
        {t('detail.subtasks' as any)} ({doneCount}/{children.length})
      </label>
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {children.map((child) => {
          const childProgress = computeProgress(child, state.tasks);
          const childStatus = getTaskStatus(child, state.tasks);
          const childStatusColor = getStatusColor(childStatus);
          const isLeaf = child.children.length === 0;
          const isDone = childProgress >= 100;

          return (
            <div key={child.id} className="rounded group" style={{ background: theme.bg700 }}>
              <div className="flex items-center gap-2 py-1 px-1">
                {isLeaf && (
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => !readOnly && toggleDone(child.id)}
                    style={{ accentColor: theme.accent }}
                    disabled={readOnly}
                  />
                )}
                {!isLeaf && (
                  <div className="w-4 h-4 flex items-center justify-center text-[8px]" style={{ color: childStatusColor }}>
                    ▼
                  </div>
                )}
                <span
                  className="text-sm flex-1 truncate cursor-pointer"
                  style={{ color: isDone ? theme.text400 : childStatusColor, textDecoration: isDone ? 'line-through' : 'none' }}
                  onClick={() => setState({ ...state, selectedTaskId: child.id })}
                >
                  {child.title}
                </span>
                <span className="text-[10px] font-medium shrink-0" style={{ color: childStatusColor }}>{childProgress}%</span>
                {child.assigneeIds.length > 0 && (
                  <div className="flex -space-x-1 shrink-0">
                    {child.assigneeIds.slice(0, 2).map((aid) => {
                      const person = state.people[aid];
                      if (!person) return null;
                      return <div key={aid} className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ background: person.color, border: `1px solid ${theme.bg700}` }}>{person.avatar}</div>;
                    })}
                  </div>
                )}
                {!readOnly && (
                  <button
                    onClick={() => removeChild(child.id)}
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ color: theme.danger }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!readOnly && canAdd && (
        <div className="flex gap-1 mt-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('detail.addSubtask' as any)}
            className="flex-1 text-xs min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addChild()}
          />
          <button onClick={addChild} className="px-2 py-1 rounded text-xs font-medium" style={{ background: theme.accent + '30', color: theme.accent }}>+</button>
        </div>
      )}
    </div>
  );
}
