import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import { useT } from '../LangContext';
import { THEMES } from '../theme';
import type { ThemeName } from '../theme';
import type { Lang } from '../i18n';
import type { GanttState } from '../types';
import { saveState } from '../store';
import { exportPDF, exportExcel, exportJSON, importJSON } from '../exporters';

interface MenuBarProps {
  state: GanttState;
  setState: (s: GanttState) => void;
  themeName: ThemeName;
  onThemeChange: (name: ThemeName) => void;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onShare: () => void;
  readOnly: boolean;
}

type SubMenu = 'view' | 'theme' | 'language' | 'export' | 'import' | null;

import pkg from '../../package.json';
const APP_VERSION = pkg.version;

export function MenuBar({ state, setState, themeName, onThemeChange, lang, onLangChange, onShare, readOnly }: MenuBarProps) {
  const theme = useTheme();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSubMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeAll = () => { setMenuOpen(false); setSubMenu(null); };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importJSON(file).then((imported) => {
      setState(imported);
      saveState(imported);
    }).catch(() => {
      alert('Invalid JSON file');
    });
    e.target.value = '';
  }, [setState]);

  const dropdownStyle: React.CSSProperties & Record<string, string> = {
    background: theme.bg700,
    border: `1px solid ${theme.bg500}`,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    '--menu-hover': theme.accent,
  };

  const itemStyle = (): React.CSSProperties => ({
    color: theme.text200,
  });

  const itemBase = "w-full text-left px-3 py-1.5 text-xs font-medium transition-all menu-item";

  return (
    <div
      ref={menuRef}
      className="h-8 flex items-center px-2 shrink-0 select-none"
      style={{ background: theme.bg800, borderBottom: `1px solid ${theme.bg600}` }}
    >
      <div className="relative">
        <button
          onClick={() => { setMenuOpen(!menuOpen); setSubMenu(null); }}
          className="px-2.5 py-1 rounded text-xs font-bold tracking-wide transition-all hover:opacity-80"
          style={{ background: menuOpen ? theme.bg600 : 'transparent', color: menuOpen ? theme.text100 : theme.accent }}
        >
          hideGantt
        </button>

        {menuOpen && (
          <div className="absolute top-full left-0 mt-0.5 rounded-lg py-1 min-w-[200px] z-50 fade-in" style={dropdownStyle}>

            {/* About */}
            <button
              onClick={() => { setAboutOpen(true); closeAll(); }}
              className={itemBase}
              style={itemStyle()}
              onMouseEnter={() => setSubMenu(null)}
            >
              {t('menu.about' as any)}
            </button>

            {/* Divider */}
            <div className="my-1 mx-2" style={{ borderTop: `1px solid ${theme.bg500}` }} />

            {/* View submenu */}
            <div className="relative"
              onMouseEnter={() => setSubMenu('view')}
              onMouseLeave={() => { if (subMenu === 'view') setSubMenu(null); }}
            >
              <button
                className={`${itemBase} flex items-center justify-between`}
                style={itemStyle()}
              >
                <span>{t('menu.view')}</span>
                <span className="text-[10px] ml-4">▶</span>
              </button>
              {subMenu === 'view' && (
                <div className="absolute left-full top-0 ml-0.5 rounded-lg py-1 min-w-[160px] z-50 fade-in" style={dropdownStyle}>
                  <button
                    onClick={() => { setState({ ...state, viewMode: 'gantt' }); closeAll(); }}
                    className={itemBase}
                    style={itemStyle()}
                  >
                    {state.viewMode === 'gantt' ? '✓ ' : '　'}{t('menu.gantt')}
                  </button>
                  <button
                    onClick={() => { setState({ ...state, viewMode: 'dashboard' }); closeAll(); }}
                    className={itemBase}
                    style={itemStyle()}
                  >
                    {state.viewMode === 'dashboard' ? '✓ ' : '　'}{t('menu.dashboard')}
                  </button>
                </div>
              )}
            </div>

            {/* Theme submenu */}
            <div className="relative"
              onMouseEnter={() => setSubMenu('theme')}
              onMouseLeave={() => { if (subMenu === 'theme') setSubMenu(null); }}
            >
              <button
                className={`${itemBase} flex items-center justify-between`}
                style={itemStyle()}
              >
                <span>{t('menu.theme')}</span>
                <span className="text-[10px] ml-4">▶</span>
              </button>
              {subMenu === 'theme' && (
                <div className="absolute left-full top-0 ml-0.5 rounded-lg py-1 min-w-[160px] z-50 fade-in" style={dropdownStyle}>
                  {(Object.keys(THEMES) as ThemeName[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => { onThemeChange(key); closeAll(); }}
                      className={itemBase}
                      style={itemStyle()}
                    >
                      {themeName === key ? '✓ ' : '　'}{t(`theme.${key}` as any)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Language submenu */}
            <div className="relative"
              onMouseEnter={() => setSubMenu('language')}
              onMouseLeave={() => { if (subMenu === 'language') setSubMenu(null); }}
            >
              <button
                className={`${itemBase} flex items-center justify-between`}
                style={itemStyle()}
              >
                <span>{t('menu.language')}</span>
                <span className="text-[10px] ml-4">▶</span>
              </button>
              {subMenu === 'language' && (
                <div className="absolute left-full top-0 ml-0.5 rounded-lg py-1 min-w-[140px] z-50 fade-in" style={dropdownStyle}>
                  {(['ja', 'en'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => { onLangChange(l); closeAll(); }}
                      className={itemBase}
                      style={itemStyle()}
                    >
                      {lang === l ? '✓ ' : '　'}{t(`lang.${l}` as any)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="my-1 mx-2" style={{ borderTop: `1px solid ${theme.bg500}` }} />

            {/* ===== Export (書き出し) submenu ===== */}
            <div className="relative"
              onMouseEnter={() => setSubMenu('export')}
              onMouseLeave={() => { if (subMenu === 'export') setSubMenu(null); }}
            >
              <button
                className={`${itemBase} flex items-center justify-between`}
                style={itemStyle()}
              >
                <span>{t('menu.export' as any)}</span>
                <span className="text-[10px] ml-4">▶</span>
              </button>
              {subMenu === 'export' && (
                <div
                  className="absolute left-full top-0 ml-0.5 rounded-lg py-1 min-w-[160px] z-50 fade-in"
                  style={dropdownStyle}
                >
                  <button
                    onClick={() => { exportPDF(state, lang); closeAll(); }}
                    className={itemBase}
                    style={itemStyle()}
                  >
                    {t('menu.exportPDF' as any)}
                  </button>
                  <button
                    onClick={() => { exportExcel(state, lang); closeAll(); }}
                    className={itemBase}
                    style={itemStyle()}
                  >
                    {t('menu.exportExcel' as any)}
                  </button>

                  {/* Divider */}
                  <div className="my-1 mx-2" style={{ borderTop: `1px solid ${theme.bg500}` }} />

                  {!readOnly && (
                    <button
                      onClick={() => { onShare(); closeAll(); }}
                      className={itemBase}
                      style={itemStyle()}
                    >
                      {t('menu.exportURL' as any)}
                    </button>
                  )}
                  <button
                    onClick={() => { exportJSON(state); closeAll(); }}
                    className={itemBase}
                    style={itemStyle()}
                  >
                    {t('menu.exportJSON' as any)}
                  </button>
                </div>
              )}
            </div>

            {/* ===== Import (読み込み) submenu ===== */}
            {!readOnly && (
              <div className="relative"
                onMouseEnter={() => setSubMenu('import')}
                onMouseLeave={() => { if (subMenu === 'import') setSubMenu(null); }}
              >
                <button
                  className={`${itemBase} flex items-center justify-between`}
                  style={itemStyle()}
                >
                  <span>{t('menu.import' as any)}</span>
                  <span className="text-[10px] ml-4">▶</span>
                </button>
                {subMenu === 'import' && (
                  <div className="absolute left-full top-0 ml-0.5 rounded-lg py-1 min-w-[140px] z-50 fade-in" style={dropdownStyle}>
                    <button
                      onClick={() => { fileInputRef.current?.click(); closeAll(); }}
                      className={itemBase}
                      style={itemStyle()}
                    >
                      {t('menu.importJSON' as any)}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Version */}
      <span className="text-[11px] ml-1" style={{ color: theme.text400 }}>v{APP_VERSION}</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Hidden file input for import */}
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

      {/* About dialog */}
      {aboutOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAboutOpen(false)}>
          <div
            className="rounded-2xl p-6 w-[320px] max-w-[90vw] fade-in text-center"
            style={{ background: theme.bg800, border: `1px solid ${theme.bg600}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-bold mb-1" style={{ color: theme.accent }}>hideGantt</div>
            <div className="text-xs mb-4" style={{ color: theme.text400 }}>Version {APP_VERSION}</div>
            <div className="text-xs" style={{ color: theme.text300 }}>&copy; 2026 Hideaki HAYASHI</div>
            <div className="text-[10px] mt-1 mb-4" style={{ color: theme.text400 }}>MIT License</div>
            <button
              onClick={() => setAboutOpen(false)}
              className="px-4 py-1.5 rounded text-xs font-medium"
              style={{ background: theme.accent + '30', color: theme.accent }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
