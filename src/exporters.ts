import * as XLSX from 'xlsx-js-style';
import type { GanttState, Task, TaskStatus } from './types';
import { getTaskStatus, computeProgress } from './types';
import { generateShareUrl } from './sharing';
import type { Lang } from './i18n';
import { t } from './i18n';

type GroupBy = 'projects' | 'people' | 'milestones';

const ALL_GROUPS: GroupBy[] = ['projects', 'people', 'milestones'];

// ─── helpers ──────────────────────────────────────────────────────

function statusLabel(status: TaskStatus, lang: Lang): string {
  return t(`status.${status}` as any, lang);
}

function statusSymbol(status: TaskStatus): string {
  switch (status) {
    case 'completed': return '\u2714'; // ✔
    case 'on-track': return '\u25cf';  // ●
    case 'at-risk': return '\u25b2';   // ▲
    case 'behind': return '\u25a0';    // ■
  }
}

function fmtDate(d: string): string {
  if (!d) return '';
  return d; // already YYYY-MM-DD
}

function personNames(state: GanttState, ids: string[]): string {
  return ids.map((id) => state.people[id]?.name).filter(Boolean).join(', ');
}

function projectNames(state: GanttState, ids: string[]): string {
  return ids.map((id) => state.projects[id]?.name).filter(Boolean).join(', ');
}

function milestoneName(state: GanttState, id: string | null): string {
  if (!id) return '';
  return state.milestones[id]?.title ?? '';
}

function groupByLabel(groupBy: GroupBy, lang: Lang): string {
  return t(`section.${groupBy}` as any, lang);
}

// ─── grouping ──────────────────────────────────────────────────────

interface GroupedTasks {
  label: string;
  color: string;
  tasks: Task[];
}

function groupTasks(state: GanttState, groupBy: GroupBy): GroupedTasks[] {
  const allTasks = Object.values(state.tasks).sort((a, b) => a.order - b.order);
  const groups: GroupedTasks[] = [];

  switch (groupBy) {
    case 'projects': {
      const sorted = Object.values(state.projects).sort((a, b) => a.order - b.order);
      for (const proj of sorted) {
        const tasks = allTasks.filter((t) => t.projectIds.includes(proj.id));
        if (tasks.length > 0)
          groups.push({ label: proj.name, color: proj.color, tasks });
      }
      const orphans = allTasks.filter((t) => t.projectIds.length === 0);
      if (orphans.length > 0)
        groups.push({ label: '(Unassigned)', color: '#888', tasks: orphans });
      break;
    }
    case 'people': {
      const sorted = Object.values(state.people).sort((a, b) => a.order - b.order);
      for (const person of sorted) {
        const hasAssignee = (task: Task): boolean =>
          task.assigneeIds.includes(person.id) ||
          task.children.some((cid) => { const c = state.tasks[cid]; return c ? hasAssignee(c) : false; });
        const tasks = allTasks.filter((t) => !t.parentId && hasAssignee(t));
        if (tasks.length > 0)
          groups.push({ label: person.name, color: person.color, tasks });
      }
      const unassigned = allTasks.filter((t) => t.assigneeIds.length === 0);
      if (unassigned.length > 0)
        groups.push({ label: '(Unassigned)', color: '#888', tasks: unassigned });
      break;
    }
    case 'milestones': {
      const sorted = Object.values(state.milestones).sort((a, b) => a.order - b.order);
      for (const ms of sorted) {
        const tasks = ms.taskIds
          .map((id) => state.tasks[id])
          .filter(Boolean)
          .sort((a, b) => a.order - b.order);
        if (tasks.length > 0)
          groups.push({ label: `${ms.title} (${fmtDate(ms.date)})`, color: ms.color, tasks });
      }
      const msTaskIds = new Set(sorted.flatMap((m) => m.taskIds));
      const noMs = allTasks.filter((t) => !msTaskIds.has(t.id));
      if (noMs.length > 0)
        groups.push({ label: '(No milestone)', color: '#888', tasks: noMs });
      break;
    }
  }
  return groups;
}

// ─── gantt timeline helpers ────────────────────────────────────────

function computeTimeline(groups: GroupedTasks[]) {
  const allTasks = groups.flatMap((g) => g.tasks);
  if (allTasks.length === 0) return { minDate: new Date(), maxDate: new Date(), totalDays: 1 };
  const dates = allTasks.flatMap((t) => [new Date(t.startDate), new Date(t.endDate)]);
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  return { minDate, maxDate, totalDays };
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── PDF (HTML print) ──────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  'on-track': '#10b981',
  'at-risk': '#f59e0b',
  'behind': '#ef4444',
  'completed': '#9ca3af',
};

export function exportPDF(state: GanttState, lang: Lang): void {
  const now = new Date().toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US');

  // Compute global timeline for consistent Gantt bars
  const allTasks = Object.values(state.tasks);
  const globalTimeline = computeTimeline([{ label: '', color: '', tasks: allTasks }]);
  const useWeeks = globalTimeline.totalDays > 60;
  const useMonths = globalTimeline.totalDays > 180;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>hideGantt</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a2e; padding: 16px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  h2 { font-size: 15px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; color: #6366f1; }
  .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
  .group { margin-bottom: 16px; page-break-inside: avoid; }
  .group-header { font-size: 13px; font-weight: 700; padding: 5px 10px; border-radius: 4px; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th, td { border: 1px solid #ddd; padding: 3px 6px; text-align: left; font-size: 10px; white-space: nowrap; }
  th { background: #f5f5f5; font-weight: 600; }
  .status-badge { display: inline-block; padding: 1px 6px; border-radius: 8px; color: #fff; font-size: 9px; font-weight: 600; }
  .progress-bar { width: 60px; height: 10px; background: #eee; border-radius: 5px; display: inline-block; position: relative; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 5px; }
  .subtask-row td { padding-left: 24px; color: #555; }
  .gantt-container { overflow-x: auto; margin-top: 4px; max-width: 100%; }
  .gantt-table { border-collapse: collapse; }
  .gantt-table th, .gantt-table td { border: 1px solid #e0e0e0; padding: 2px; text-align: center; font-size: 8px; min-width: ${useMonths ? '30px' : useWeeks ? '20px' : '14px'}; }
  .gantt-table th { background: #f0f0f0; }
  .gantt-bar { height: 14px; width: 100%; border-radius: 3px; opacity: 0.85; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .status-badge, .progress-fill, .group-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 20px; background: #6366f1; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; z-index: 100; }
  .print-btn:hover { background: #4f46e5; }
  .section { margin-bottom: 32px; }
  .section-break { page-break-before: always; }
  @page { size: landscape; margin: 10mm; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .gantt-container { overflow: visible; }
    .gantt-table { transform-origin: top left; transform: scale(var(--gantt-scale, 1)); }
  }
</style></head><body>
<button class="print-btn" onclick="window.print()">${lang === 'ja' ? 'PDF\u306b\u4fdd\u5b58 / \u5370\u5237' : 'Save as PDF / Print'}</button>
<h1>hideGantt</h1>
<div class="subtitle">${lang === 'ja' ? '\u51fa\u529b\u65e5' : 'Exported'}: ${now}</div>
`;

  ALL_GROUPS.forEach((gb, gi) => {
    const groups = groupTasks(state, gb);
    const sectionLabel = groupByLabel(gb, lang);

    html += `<div class="section${gi > 0 ? ' section-break' : ''}">`;
    html += `<h2>${sectionLabel}</h2>`;

    for (const group of groups) {
      html += `<div class="group">`;
      html += `<div class="group-header" style="background:${group.color}">${esc(group.label)} (${group.tasks.length} ${lang === 'ja' ? '\u30bf\u30b9\u30af' : 'tasks'})</div>`;

      // Detail table
      html += `<table><thead><tr>
        <th>${t('detail.title' as any, lang)}</th>
        <th>${t('detail.status' as any, lang)}</th>
        <th>${t('detail.progress' as any, lang)}</th>
        <th>${t('detail.startDate' as any, lang)}</th>
        <th>${t('detail.endDate' as any, lang)}</th>
        <th>${t('detail.assignees' as any, lang)}</th>
        <th>${gb === 'projects' ? t('detail.milestone' as any, lang) : gb === 'people' ? t('detail.projects' as any, lang) : t('detail.assignees' as any, lang)}</th>
      </tr></thead><tbody>`;

      const renderTaskRow = (task: Task, depth: number) => {
        const progress = computeProgress(task, state.tasks);
        const status = getTaskStatus(task, state.tasks);
        const sc = STATUS_COLORS[status];
        const extra = gb === 'projects'
          ? milestoneName(state, task.milestoneId)
          : gb === 'people'
            ? projectNames(state, task.projectIds)
            : personNames(state, task.assigneeIds);
        const indent = depth > 0 ? `padding-left:${depth * 16}px;color:#555` : '';
        html += `<tr${depth > 0 ? ' class="subtask-row"' : ''}>
          <td style="${indent}"><strong>${esc(task.title)}</strong></td>
          <td><span class="status-badge" style="background:${sc}">${statusSymbol(status)} ${statusLabel(status, lang)}</span></td>
          <td><div class="progress-bar"><div class="progress-fill" style="width:${progress}%;background:${sc}"></div></div> ${progress}%</td>
          <td>${fmtDate(task.startDate)}</td>
          <td>${fmtDate(task.endDate)}</td>
          <td>${esc(personNames(state, task.assigneeIds))}</td>
          <td>${esc(extra)}</td>
        </tr>`;
        // Render children recursively
        for (const childId of task.children) {
          const child = state.tasks[childId];
          if (child) renderTaskRow(child, depth + 1);
        }
      };
      for (const task of group.tasks) renderTaskRow(task, 0);
      html += `</tbody></table>`;

      // Mini Gantt chart
      html += renderGanttTimeline(group.tasks, globalTimeline.minDate, globalTimeline.totalDays, useWeeks, useMonths);

      html += `</div>`;
    }

    html += `</div>`;
  });

  html += `</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

function renderGanttTimeline(tasks: Task[], minDate: Date, totalDays: number, useWeeks: boolean, useMonths: boolean): string {
  type Col = { label: string; startDay: number; span: number };
  const cols: Col[] = [];

  if (useMonths) {
    const d = new Date(minDate);
    d.setDate(1);
    const endDay = totalDays;
    while (daysBetween(minDate, d) < endDay + 31) {
      const start = Math.max(0, daysBetween(minDate, d));
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const end = Math.min(endDay, daysBetween(minDate, nextMonth));
      if (end > start)
        cols.push({ label: `${d.getFullYear()}/${d.getMonth() + 1}`, startDay: start, span: end - start });
      d.setMonth(d.getMonth() + 1);
      if (cols.length > 50) break;
    }
  } else if (useWeeks) {
    for (let day = 0; day < totalDays; day += 7) {
      const d = new Date(minDate.getTime() + day * 86400000);
      const span = Math.min(7, totalDays - day);
      cols.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, startDay: day, span });
      if (cols.length > 80) break;
    }
  } else {
    for (let day = 0; day < totalDays; day++) {
      const d = new Date(minDate.getTime() + day * 86400000);
      cols.push({ label: `${d.getDate()}`, startDay: day, span: 1 });
      if (cols.length > 120) break;
    }
  }

  if (cols.length === 0) return '';

  let html = `<div class="gantt-container"><table class="gantt-table"><thead><tr><th style="min-width:120px"></th>`;
  for (const col of cols)
    html += `<th>${col.label}</th>`;
  html += `</tr></thead><tbody>`;

  for (const task of tasks) {
    const taskStart = daysBetween(minDate, new Date(task.startDate));
    const taskEnd = daysBetween(minDate, new Date(task.endDate));
    const status = getTaskStatus(task);
    const color = STATUS_COLORS[status];

    html += `<tr><td style="text-align:left;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${esc(task.title)}</td>`;
    for (const col of cols) {
      const colEnd = col.startDay + col.span;
      const overlap = taskStart < colEnd && taskEnd >= col.startDay;
      if (overlap)
        html += `<td style="padding:0;height:18px"><div class="gantt-bar" style="background:${color}"></div></td>`;
      else
        html += `<td></td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Excel ──────────────────────────────────────────────────────────

// hex color (#rrggbb) → RRGGBB for xlsx-js-style
function toXlsxRgb(hex: string): string {
  return hex.replace('#', '').toUpperCase();
}

const STATUS_COLORS_HEX: Record<TaskStatus, string> = {
  'on-track': '10B981',
  'at-risk': 'F59E0B',
  'behind': 'EF4444',
  'completed': '9CA3AF',
};

type CellStyle = {
  font?: { bold?: boolean; color?: { rgb: string }; sz?: number };
  fill?: { fgColor: { rgb: string } };
  alignment?: { horizontal?: string };
  border?: Record<string, { style: string; color: { rgb: string } }>;
};


export function exportExcel(state: GanttState, lang: Lang): void {
  const wb = XLSX.utils.book_new();

  for (const gb of ALL_GROUPS) {
    const groups = groupTasks(state, gb);
    const sectionLabel = groupByLabel(gb, lang);
    const sheetName = sectionLabel.slice(0, 31);

    const data: (string | number)[][] = [
      [`hideGantt - ${sectionLabel}`],
      [`${lang === 'ja' ? '\u51fa\u529b\u65e5' : 'Exported'}: ${new Date().toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}`],
      [],
    ];

    // Track rows that need styling: { row, type, status?, color? }
    type RowMeta = { row: number; type: 'title' | 'header' | 'group' | 'task' | 'subtask'; status?: TaskStatus; color?: string };
    const rowMetas: RowMeta[] = [];

    // Track gantt cells: { row, col, color }
    type GanttCell = { row: number; col: number; color: string };
    const ganttCells: GanttCell[] = [];
    // Track gantt task name cells
    type GanttNameCell = { row: number; col: number; status: TaskStatus };
    const ganttNameCells: GanttNameCell[] = [];

    rowMetas.push({ row: 0, type: 'title' });

    for (const group of groups) {
      const groupRow = data.length;
      data.push([`\u25a0 ${group.label} (${group.tasks.length} ${lang === 'ja' ? '\u30bf\u30b9\u30af' : 'tasks'})`]);
      rowMetas.push({ row: groupRow, type: 'group', color: toXlsxRgb(group.color) });

      const headerRow = data.length;
      data.push([
        t('detail.title' as any, lang),
        t('detail.status' as any, lang),
        t('detail.progress' as any, lang) + ' (%)',
        t('detail.startDate' as any, lang),
        t('detail.endDate' as any, lang),
        t('detail.assignees' as any, lang),
        gb === 'projects' ? t('detail.milestone' as any, lang) :
          gb === 'people' ? t('detail.projects' as any, lang) :
            t('detail.assignees' as any, lang),
      ]);
      rowMetas.push({ row: headerRow, type: 'header' });

      const addExcelTaskRow = (task: Task, depth: number) => {
        const progress = computeProgress(task, state.tasks);
        const status = getTaskStatus(task, state.tasks);
        const extra = gb === 'projects'
          ? milestoneName(state, task.milestoneId)
          : gb === 'people'
            ? projectNames(state, task.projectIds)
            : personNames(state, task.assigneeIds);
        const taskRow = data.length;
        const prefix = '  '.repeat(depth);
        data.push([
          `${prefix}${task.title}`,
          `${statusSymbol(status)} ${statusLabel(status, lang)}`,
          progress,
          task.startDate,
          task.endDate,
          personNames(state, task.assigneeIds),
          extra,
        ]);
        rowMetas.push({ row: taskRow, type: depth > 0 ? 'subtask' : 'task', status });
        for (const childId of task.children) {
          const child = state.tasks[childId];
          if (child) addExcelTaskRow(child, depth + 1);
        }
      };
      for (const task of group.tasks) addExcelTaskRow(task, 0);

      // Gantt timeline for this group
      const { minDate, totalDays } = computeTimeline([group]);
      if (totalDays > 0 && group.tasks.length > 0) {
        data.push([]);
        const headerRowData: (string | number)[] = [''];
        const useWeeks = totalDays > 60;
        const cols: { label: string; startDay: number; span: number }[] = [];

        if (useWeeks) {
          for (let day = 0; day < totalDays; day += 7) {
            const d = new Date(minDate.getTime() + day * 86400000);
            cols.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, startDay: day, span: Math.min(7, totalDays - day) });
            if (cols.length > 52) break;
          }
        } else {
          for (let day = 0; day < totalDays; day++) {
            const d = new Date(minDate.getTime() + day * 86400000);
            cols.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, startDay: day, span: 1 });
            if (cols.length > 90) break;
          }
        }

        for (const col of cols) headerRowData.push(col.label);
        const ganttHeaderRow = data.length;
        data.push(headerRowData);
        rowMetas.push({ row: ganttHeaderRow, type: 'header' });

        for (const task of group.tasks) {
          const ganttRow = data.length;
          const row: (string | number)[] = [task.title];
          const taskStart = daysBetween(minDate, new Date(task.startDate));
          const taskEnd = daysBetween(minDate, new Date(task.endDate));
          const status = getTaskStatus(task);
          const colorHex = STATUS_COLORS_HEX[status];

          ganttNameCells.push({ row: ganttRow, col: 0, status });

          for (const col of cols) {
            const colEnd = col.startDay + col.span;
            const overlap = taskStart < colEnd && taskEnd >= col.startDay;
            row.push(overlap ? '' : '');
            if (overlap)
              ganttCells.push({ row: ganttRow, col: 1 + cols.indexOf(col), color: colorHex });
          }
          data.push(row);
        }
      }

      data.push([]);
      data.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 },
    ];

    // Apply styles
    const thinBorder = { style: 'thin', color: { rgb: 'CCCCCC' } };
    const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    for (const meta of rowMetas) {
      const colCount = data[meta.row]?.length ?? 0;
      for (let c = 0; c < colCount; c++) {
        const addr = XLSX.utils.encode_cell({ r: meta.row, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        switch (meta.type) {
          case 'title':
            ws[addr].s = { font: { bold: true, sz: 14, color: { rgb: '333366' } } };
            break;
          case 'group':
            ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: meta.color || '666666' } } };
            break;
          case 'header':
            ws[addr].s = { font: { bold: true, sz: 10, color: { rgb: '333333' } }, fill: { fgColor: { rgb: 'F0F0F0' } }, border: borders };
            break;
          case 'task': {
            const style: CellStyle = { border: borders };
            if (c === 0 && meta.status) {
              const isBeforeStart = false; // task name always colored by status in Excel
              style.font = { bold: true, color: { rgb: STATUS_COLORS_HEX[meta.status] } };
            }
            if (c === 1 && meta.status)
              style.font = { color: { rgb: STATUS_COLORS_HEX[meta.status] } };
            ws[addr].s = style;
            break;
          }
          case 'subtask': {
            const style: CellStyle = { border: borders };
            if (meta.status === 'completed')
              style.font = { color: { rgb: '9CA3AF' } };
            ws[addr].s = style;
            break;
          }
        }
      }
    }

    // Apply gantt bar cell colors
    for (const gc of ganttCells) {
      const addr = XLSX.utils.encode_cell({ r: gc.row, c: gc.col });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = { fill: { fgColor: { rgb: gc.color } } };
    }

    // Apply gantt task name colors
    for (const gn of ganttNameCells) {
      const addr = XLSX.utils.encode_cell({ r: gn.row, c: gn.col });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = { font: { bold: true, color: { rgb: STATUS_COLORS_HEX[gn.status] } } };
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const filename = `gantt-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ─── URL (share) ────────────────────────────────────────────────────

export function exportURL(state: GanttState): string {
  return generateShareUrl(state);
}

// ─── JSON ───────────────────────────────────────────────────────────

export function exportJSON(state: GanttState): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hideGantt-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(file: File): Promise<GanttState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as GanttState;
        resolve(imported);
      } catch (err) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
