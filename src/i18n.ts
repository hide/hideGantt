export type Lang = 'ja' | 'en';

const LANG_STORAGE_KEY = 'gantt-app-lang';

export function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch (_e) { /* noop */ }
  return 'ja';
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(LANG_STORAGE_KEY, lang);
}

const translations = {
  // Menu bar
  'menu.file': { ja: 'ファイル', en: 'File' },
  'menu.view': { ja: '表示', en: 'View' },
  'menu.share': { ja: '共有', en: 'Share' },
  'menu.data': { ja: 'データ', en: 'Data' },
  'menu.export': { ja: '書き出し', en: 'Export' },
  'menu.import': { ja: '読み込み', en: 'Import' },
  'menu.shareSnapshot': { ja: 'スナップショットを共有', en: 'Share Snapshot' },
  'menu.exportPDF': { ja: 'PDF', en: 'PDF' },
  'menu.exportExcel': { ja: 'Excel', en: 'Excel' },
  'menu.exportURL': { ja: 'URL', en: 'URL' },
  'menu.exportJSON': { ja: 'JSON', en: 'JSON' },
  'menu.importJSON': { ja: 'JSON', en: 'JSON' },
  'menu.byProjects': { ja: 'プロジェクト単位', en: 'By Project' },
  'menu.byPeople': { ja: 'メンバー単位', en: 'By Person' },
  'menu.byMilestones': { ja: 'マイルストーン単位', en: 'By Milestone' },
  'menu.about': { ja: 'hideGantt について...', en: 'About hideGantt...' },
  'menu.theme': { ja: 'テーマ', en: 'Theme' },
  'menu.language': { ja: '言語', en: 'Language' },
  'menu.gantt': { ja: 'ガントチャート', en: 'Gantt Chart' },
  'menu.dashboard': { ja: 'ダッシュボード', en: 'Dashboard' },

  // Theme names
  'theme.dark': { ja: 'ダーク', en: 'Dark' },
  'theme.light': { ja: 'ライト', en: 'Light' },
  'theme.pop': { ja: 'ポップ', en: 'Pop' },
  'theme.wild': { ja: 'ワイルド', en: 'Wild' },

  // Language names
  'lang.ja': { ja: '日本語', en: 'Japanese' },
  'lang.en': { ja: '英語', en: 'English' },

  // Sidebar sections
  'section.projects': { ja: 'プロジェクト', en: 'Projects' },
  'section.people': { ja: 'メンバー', en: 'People' },
  'section.categories': { ja: 'カテゴリ', en: 'Categories' },
  'section.milestones': { ja: 'マイルストーン', en: 'Milestones' },

  // Sidebar add placeholders
  'add.project': { ja: '新しいプロジェクト名...', en: 'New project name...' },
  'add.person': { ja: '新しいメンバー名...', en: 'New member name...' },
  'add.category': { ja: '新しいカテゴリ名...', en: 'New category name...' },
  'add.milestone': { ja: '新しいマイルストーン名...', en: 'New milestone name...' },

  // Sidebar task list
  'sidebar.tasks': { ja: 'タスク', en: 'Tasks' },
  'sidebar.noTasks': { ja: 'タスクなし', en: 'No tasks' },

  // Confirm delete
  'confirm.delete': { ja: '「{name}」を削除しますか？', en: 'Delete "{name}"?' },

  // Editable label
  'label.doubleClickToRename': { ja: 'ダブルクリックで名前を変更', en: 'Double-click to rename' },

  // Gantt toolbar
  'zoom.day': { ja: '日', en: 'Day' },
  'zoom.week': { ja: '週', en: 'Week' },
  'zoom.month': { ja: '月', en: 'Month' },
  'toolbar.from': { ja: '開始', en: 'From' },
  'toolbar.to': { ja: '終了', en: 'To' },
  'toolbar.fitAll': { ja: '全体表示', en: 'Fit All' },

  // Task list
  'tasks.header': { ja: 'タスク', en: 'Tasks' },
  'tasks.empty': { ja: 'タスクがまだありません。下の入力欄から追加してください。', en: 'No tasks yet. Add one below!' },
  'tasks.newPlaceholder': { ja: '新しいタスク名...', en: 'New task name...' },
  'tasks.add': { ja: '+ 追加', en: '+ Add' },
  'tasks.addSubtask': { ja: 'サブタスクを追加', en: 'Add subtask' },
  'tasks.subtaskPlaceholder': { ja: 'サブタスク名...', en: 'Subtask name...' },
  'tasks.addButton': { ja: '追加', en: 'Add' },
  'tasks.selectProject': { ja: 'プロジェクトを選択してください', en: 'Select a project' },

  // Task detail panel
  'detail.title': { ja: 'タイトル', en: 'Title' },
  'detail.description': { ja: '説明', en: 'Description' },
  'detail.descriptionPlaceholder': { ja: '説明を入力...', en: 'Enter description...' },
  'detail.startDate': { ja: '開始日', en: 'Start date' },
  'detail.endDate': { ja: '終了日', en: 'End date' },
  'detail.progress': { ja: '進捗', en: 'Progress' },
  'detail.projects': { ja: 'プロジェクト', en: 'Projects' },
  'detail.assignees': { ja: '担当者', en: 'Assignees' },
  'detail.category': { ja: 'カテゴリ', en: 'Category' },
  'detail.milestone': { ja: 'マイルストーン', en: 'Milestone' },
  'detail.dependencies': { ja: '依存タスク', en: 'Dependencies' },
  'detail.none': { ja: 'なし', en: 'None' },
  'detail.status': { ja: 'ステータス', en: 'Status' },
  'detail.subtasks': { ja: '子タスク', en: 'Child Tasks' },
  'detail.addSubtask': { ja: '子タスク名を入力...', en: 'Enter child task name...' },
  'detail.markDone': { ja: '完了にする', en: 'Mark as done' },
  'detail.deleteTask': { ja: 'タスクを削除', en: 'Delete task' },

  // Delete by type
  'delete.projects': { ja: 'プロジェクトを削除', en: 'Delete project' },
  'delete.people': { ja: 'メンバーを削除', en: 'Delete member' },
  'delete.categories': { ja: 'カテゴリを削除', en: 'Delete category' },
  'delete.milestones': { ja: 'マイルストーンを削除', en: 'Delete milestone' },

  // Status
  'status.on-track': { ja: '順調', en: 'On Track' },
  'status.at-risk': { ja: '注意', en: 'At Risk' },
  'status.behind': { ja: '遅延', en: 'Behind' },
  'status.completed': { ja: '完了', en: 'Completed' },

  // Dashboard
  'dashboard.title': { ja: 'ダッシュボード', en: 'Dashboard' },
  'dashboard.allProjects': { ja: '全プロジェクト', en: 'All Projects' },
  'dashboard.totalTasks': { ja: '全タスク', en: 'Total Tasks' },
  'dashboard.completed': { ja: '完了', en: 'Completed' },
  'dashboard.onTrack': { ja: '順調', en: 'On Track' },
  'dashboard.atRisk': { ja: '注意', en: 'At Risk' },
  'dashboard.behind': { ja: '遅延', en: 'Behind' },
  'dashboard.overallProgress': { ja: '全体進捗', en: 'Overall Progress' },
  'dashboard.milestones': { ja: 'マイルストーン', en: 'Milestones' },
  'dashboard.due': { ja: '期限', en: 'Due' },
  'dashboard.tasksCompleted': { ja: 'タスク完了', en: 'tasks completed' },
  'dashboard.members': { ja: 'メンバー', en: 'Members' },
  'dashboard.noTasksAssigned': { ja: '割り当てられたタスクはありません', en: 'No tasks assigned' },

  // Share modal
  'share.title': { ja: 'プロジェクトを共有', en: 'Share Project' },
  'share.description': { ja: 'このリンクを共有すると、プロジェクトの読み取り専用スナップショットを閲覧できます。', en: 'Anyone with this link can view a read-only snapshot of your project.' },
  'share.copy': { ja: 'コピー', en: 'Copy' },
  'share.close': { ja: '閉じる', en: 'Close' },

  // Read-only banner
  'readonly.banner': { ja: '閲覧専用モード — 変更は保存されません', en: 'Read-only view — changes will not be saved' },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Lang, params?: Record<string, string>): string {
  const entry = translations[key];
  let text: string = entry?.[lang] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params))
      text = text.replace(`{${k}}`, v);
  }
  return text;
}
