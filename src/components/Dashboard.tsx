import type { GanttState } from '../types';
import { getTaskStatus, getStatusColor } from '../types';
import { getPersonTasks, getPersonMilestoneProgress, getMilestoneProgress } from '../store';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';

interface DashboardProps {
  state: GanttState;
  setState: (s: GanttState) => void;
}

export function Dashboard({ state, setState }: DashboardProps) {
  const theme = useTheme();
  const t = useT();
  const people = Object.values(state.people);
  const milestones = Object.values(state.milestones).filter((m) => m.projectId === state.activeProjectId);
  const allTasks = Object.values(state.tasks).filter((t) =>
    state.activeProjectId ? t.projectIds.includes(state.activeProjectId) : true
  );

  const statusCounts = {
    completed: allTasks.filter((t) => getTaskStatus(t) === 'completed').length,
    'on-track': allTasks.filter((t) => getTaskStatus(t) === 'on-track').length,
    'at-risk': allTasks.filter((t) => getTaskStatus(t) === 'at-risk').length,
    behind: allTasks.filter((t) => getTaskStatus(t) === 'behind').length,
  };

  const overallProgress = allTasks.length
    ? Math.round(allTasks.reduce((s, t) => s + t.progress, 0) / allTasks.length)
    : 0;

  const cardStyle = { background: theme.bg800, border: `1px solid ${theme.bg600}` };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto fade-in">
        <h2 className="text-2xl font-bold mb-6 tracking-tight">
          {state.activeProjectId ? state.projects[state.activeProjectId]?.name : t('dashboard.allProjects')} — {t('dashboard.title')}
        </h2>

        {/* Overall Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <StatCard label={t('dashboard.totalTasks')} value={allTasks.length.toString()} color={theme.accent} bg={theme.bg800} border={theme.bg600} textColor={theme.text400} />
          <StatCard label={t('dashboard.completed')} value={statusCounts.completed.toString()} color={theme.success} bg={theme.bg800} border={theme.bg600} textColor={theme.text400} />
          <StatCard label={t('dashboard.onTrack')} value={statusCounts['on-track'].toString()} color={theme.success} bg={theme.bg800} border={theme.bg600} textColor={theme.text400} />
          <StatCard label={t('dashboard.atRisk')} value={statusCounts['at-risk'].toString()} color={theme.warning} bg={theme.bg800} border={theme.bg600} textColor={theme.text400} />
          <StatCard label={t('dashboard.behind')} value={statusCounts.behind.toString()} color={theme.danger} bg={theme.bg800} border={theme.bg600} textColor={theme.text400} />
        </div>

        {/* Overall Progress */}
        <div className="rounded-xl p-6 mb-8" style={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: theme.text300 }}>{t('dashboard.overallProgress')}</h3>
            <span className="text-2xl font-bold" style={{ color: theme.accent }}>{overallProgress}%</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: theme.bg700 }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallProgress}%`, background: `linear-gradient(90deg, ${theme.accent}, ${theme.success})` }} />
          </div>
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: theme.text300 }}>{t('dashboard.milestones')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {milestones.map((m) => {
                const progress = getMilestoneProgress(state, m.id);
                const completedTasks = m.taskIds.filter((id) => state.tasks[id]?.progress >= 100).length;
                return (
                  <div key={m.id} className="rounded-xl p-5" style={cardStyle}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 rotate-45 shrink-0" style={{ background: m.color }} />
                      <h4 className="font-semibold text-sm">{m.title}</h4>
                    </div>
                    <p className="text-xs mb-3" style={{ color: theme.text400 }}>{t('dashboard.due')}: {m.date}</p>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: theme.bg700 }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: m.color }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: m.color }}>{progress}%</span>
                    </div>
                    <p className="text-[10px]" style={{ color: theme.text400 }}>{completedTasks} / {m.taskIds.length} {t('dashboard.tasksCompleted')}</p>

                    {people.length > 0 && (
                      <div className="mt-3 pt-3 space-y-2" style={{ borderTop: `1px solid ${theme.bg600}` }}>
                        {people.map((person) => {
                          const personProgress = getPersonMilestoneProgress(state, person.id, m.id);
                          const personTaskCount = m.taskIds.filter((id) => state.tasks[id]?.assigneeIds.includes(person.id)).length;
                          if (personTaskCount === 0) return null;
                          return (
                            <div key={person.id} className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ background: person.color }}>{person.avatar}</div>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: theme.bg700 }}>
                                <div className="h-full rounded-full" style={{ width: `${personProgress}%`, background: person.color }} />
                              </div>
                              <span className="text-[10px] w-8 text-right" style={{ color: theme.text400 }}>{personProgress}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-person Task Lists */}
        {people.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: theme.text300 }}>{t('dashboard.members')}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {people.map((person) => {
                const personTasks = getPersonTasks(state, person.id);
                const completed = personTasks.filter((pt) => pt.progress >= 100).length;
                const personProgress = personTasks.length ? Math.round(personTasks.reduce((s, pt) => s + pt.progress, 0) / personTasks.length) : 0;
                return (
                  <div key={person.id} className="rounded-xl p-5" style={cardStyle}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: person.color }}>{person.avatar}</div>
                      <div>
                        <h4 className="font-semibold">{person.name}</h4>
                        <p className="text-xs" style={{ color: theme.text400 }}>{completed}/{personTasks.length} {t('dashboard.tasksCompleted')} · {personProgress}%</p>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden mb-3" style={{ background: theme.bg700 }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${personProgress}%`, background: person.color }} />
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {personTasks.length === 0 && <p className="text-xs italic" style={{ color: theme.text400 }}>{t('dashboard.noTasksAssigned')}</p>}
                      {personTasks.map((task) => {
                        const taskStatus = getTaskStatus(task);
                        const taskColor = getStatusColor(taskStatus);
                        return (
                          <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm" onClick={() => setState({ ...state, selectedTaskId: task.id, activeProjectId: task.projectIds[0] ?? state.activeProjectId, editingItemId: null, editingItemType: null, viewMode: 'gantt' })}>
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: taskColor }} />
                            <span className="truncate flex-1">{task.title}</span>
                            <span className="text-[10px] font-medium shrink-0" style={{ color: taskColor }}>{task.progress}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg, border, textColor }: { label: string; value: string; color: string; bg: string; border: string; textColor: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xs mb-1" style={{ color: textColor }}>{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
