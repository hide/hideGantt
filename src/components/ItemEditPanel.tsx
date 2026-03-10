import type { GanttState, SidebarSection } from '../types';
import {
  updateProject, deleteProject,
  updatePerson, deletePerson,
  updateCategory, deleteCategory,
  updateMilestone, deleteMilestone,
} from '../store';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#f97316', '#84cc16',
];

interface ItemEditPanelProps {
  state: GanttState;
  setState: (s: GanttState) => void;
  itemId: string;
  itemType: SidebarSection;
  onClose: () => void;
}

export function ItemEditPanel({ state, setState, itemId, itemType, onClose }: ItemEditPanelProps) {
  const theme = useTheme();
  const t = useT();
  const labelStyle = { color: theme.text400 };

  const project = itemType === 'projects' ? state.projects[itemId] : null;
  const person = itemType === 'people' ? state.people[itemId] : null;
  const category = itemType === 'categories' ? state.categories[itemId] : null;
  const milestone = itemType === 'milestones' ? state.milestones[itemId] : null;

  const item = project || person || category || milestone;
  if (!item) return null;

  const name = project?.name ?? person?.name ?? category?.name ?? milestone?.title ?? '';
  const color = project?.color ?? person?.color ?? category?.color ?? milestone?.color ?? '#6366f1';

  const updateName = (newName: string) => {
    if (!newName.trim()) return;
    switch (itemType) {
      case 'projects': setState(updateProject(state, itemId, { name: newName })); break;
      case 'people': setState(updatePerson(state, itemId, { name: newName })); break;
      case 'categories': setState(updateCategory(state, itemId, { name: newName })); break;
      case 'milestones': setState(updateMilestone(state, itemId, { title: newName })); break;
    }
  };

  const updateColor = (newColor: string) => {
    switch (itemType) {
      case 'projects': setState(updateProject(state, itemId, { color: newColor })); break;
      case 'people': setState(updatePerson(state, itemId, { color: newColor })); break;
      case 'categories': setState(updateCategory(state, itemId, { color: newColor })); break;
      case 'milestones': setState(updateMilestone(state, itemId, { color: newColor })); break;
    }
  };

  const handleDelete = () => {
    if (!confirm(t('confirm.delete', { name }))) return;
    let next = state;
    switch (itemType) {
      case 'projects': next = deleteProject(state, itemId); break;
      case 'people': next = deletePerson(state, itemId); break;
      case 'categories': next = deleteCategory(state, itemId); break;
      case 'milestones': next = deleteMilestone(state, itemId); break;
    }
    setState({ ...next, editingItemId: null, editingItemType: null });
  };

  return (
    <div className="w-80 h-full shrink-0 slide-in overflow-y-auto" style={{ background: theme.bg800, borderLeft: `1px solid ${theme.bg600}` }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${theme.bg600}` }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.text300 }}>
          {t(`section.${itemType}` as any)}
        </span>
        <button onClick={onClose} className="text-lg" style={{ color: theme.text400 }}>×</button>
      </div>

      <div className="p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>
            {t('detail.title')}
          </label>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="w-full text-base font-semibold"
          />
        </div>

        {/* Color */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={labelStyle}>
            {t('detail.color' as any)}
          </label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => updateColor(c)}
                className="w-7 h-7 rounded-full transition-transform"
                style={{
                  background: c,
                  transform: color === c ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: color === c ? `0 0 8px ${c}` : 'none',
                  border: color === c ? '2px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        {/* Milestone-specific: date */}
        {milestone && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>
              {t('detail.endDate')}
            </label>
            <input
              type="date"
              value={milestone.date}
              onChange={(e) => setState(updateMilestone(state, itemId, { date: e.target.value }))}
              className="w-full"
            />
          </div>
        )}

        {/* Project-specific: description */}
        {project && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={labelStyle}>
              {t('detail.description')}
            </label>
            <textarea
              value={project.description}
              onChange={(e) => setState(updateProject(state, itemId, { description: e.target.value }))}
              className="w-full h-20 resize-none"
            />
          </div>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="w-full py-2 rounded-lg text-sm font-medium transition-all"
          style={{ color: theme.danger, border: `1px solid ${theme.danger}33` }}
        >
          {t(`delete.${itemType}` as any)}
        </button>
      </div>
    </div>
  );
}
