import { useState, useEffect, useCallback } from 'react';
import type { GanttState } from './types';
import { loadState, saveState } from './store';
import { parseShareUrl, isReadOnlyMode, generateShareUrl } from './sharing';
import { THEMES, loadTheme, saveTheme } from './theme';
import type { ThemeName } from './theme';
import { loadLang, saveLang } from './i18n';
import type { Lang } from './i18n';
import { t } from './i18n';
import { ThemeContext } from './ThemeContext';
import { LangContext } from './LangContext';
import { MenuBar } from './components/MenuBar';
import { Sidebar } from './components/Sidebar';
import { GanttChart } from './components/GanttChart';
import { TaskDetailPanel } from './components/TaskDetailPanel';
import { Dashboard } from './components/Dashboard';
import { ItemEditPanel } from './components/ItemEditPanel';

function App() {
  const [state, setStateRaw] = useState<GanttState>(() => {
    const shared = parseShareUrl();
    if (shared) {
      return {
        ...loadState(),
        ...shared,
        selectedTaskId: null,
        viewMode: 'gantt' as const,
        zoomLevel: 'week' as const,
      };
    }
    return loadState();
  });

  const [themeName, setThemeName] = useState<ThemeName>(loadTheme);
  const [lang, setLang] = useState<Lang>(loadLang);
  const theme = THEMES[themeName];

  const readOnly = isReadOnlyMode();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const setState = useCallback(
    (newState: GanttState) => {
      setStateRaw(newState);
      if (!readOnly) saveState(newState);
    },
    [readOnly]
  );

  const handleThemeChange = (name: ThemeName) => { setThemeName(name); saveTheme(name); };
  const handleLangChange = (l: Lang) => { setLang(l); saveLang(l); };

  useEffect(() => {
    if (!readOnly) {
      const timer = setInterval(() => saveState(state), 5000);
      return () => clearInterval(timer);
    }
  }, [state, readOnly]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-bg900', theme.bg900);
    root.style.setProperty('--theme-bg800', theme.bg800);
    root.style.setProperty('--theme-bg700', theme.bg700);
    root.style.setProperty('--theme-bg600', theme.bg600);
    root.style.setProperty('--theme-bg500', theme.bg500);
    root.style.setProperty('--theme-text400', theme.text400);
    root.style.setProperty('--theme-text300', theme.text300);
    root.style.setProperty('--theme-text200', theme.text200);
    root.style.setProperty('--theme-text100', theme.text100);
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-accentGlow', theme.accentGlow);
  }, [theme]);

  const handleShare = () => {
    const url = generateShareUrl(state);
    setShareUrl(url);
    setShareModalOpen(true);
  };

  const selectedTask = state.selectedTaskId ? state.tasks[state.selectedTaskId] : null;

  return (
    <ThemeContext.Provider value={theme}>
      <LangContext.Provider value={lang}>
        <div className="h-full flex flex-col" style={{ background: theme.bg900, color: theme.text100 }}>
          {/* Read-only banner */}
          {readOnly && (
            <div
              className="h-8 flex items-center justify-center text-xs shrink-0"
              style={{ background: 'rgba(217,119,6,0.15)', borderBottom: '1px solid rgba(217,119,6,0.25)', color: '#fbbf24' }}
            >
              {t('readonly.banner', lang)}
            </div>
          )}

          {/* Menu Bar */}
          <MenuBar
            state={state}
            setState={setState}
            themeName={themeName}
            onThemeChange={handleThemeChange}
            lang={lang}
            onLangChange={handleLangChange}
            onShare={handleShare}
            readOnly={readOnly}
          />

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              {state.viewMode === 'gantt' ? (
                <GanttChart state={state} setState={setState} readOnly={readOnly} />
              ) : (
                <Dashboard state={state} setState={setState} />
              )}
            </div>

            {state.editingItemId && state.editingItemType ? (
              <ItemEditPanel
                state={state}
                setState={setState}
                itemId={state.editingItemId}
                itemType={state.editingItemType}
                onClose={() => setState({ ...state, editingItemId: null, editingItemType: null })}
              />
            ) : selectedTask ? (
              <TaskDetailPanel
                state={state}
                setState={setState}
                taskId={selectedTask.id}
                onClose={() => setState({ ...state, selectedTaskId: null })}
                readOnly={readOnly}
              />
            ) : null}
          </div>

          {/* Share Modal */}
          {shareModalOpen && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="rounded-2xl p-6 w-[500px] max-w-[90vw] fade-in" style={{ background: theme.bg800, border: `1px solid ${theme.bg600}` }}>
                <h3 className="text-lg font-bold mb-2">{t('share.title', lang)}</h3>
                <p className="text-sm mb-4" style={{ color: theme.text400 }}>{t('share.description', lang)}</p>
                <div className="flex gap-2">
                  <input value={shareUrl} readOnly className="flex-1 text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button onClick={() => navigator.clipboard.writeText(shareUrl)} className="px-3 py-1.5 rounded text-xs font-medium text-white shrink-0" style={{ background: theme.accent }}>
                    {t('share.copy', lang)}
                  </button>
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={() => setShareModalOpen(false)} className="px-4 py-1.5 rounded text-xs font-medium hover:opacity-80" style={{ color: theme.text300 }}>
                    {t('share.close', lang)}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </LangContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
