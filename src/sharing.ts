import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { GanttState } from './types';

export function generateShareUrl(state: GanttState): string {
  const shareData = {
    tasks: state.tasks,
    projects: state.projects,
    milestones: state.milestones,
    people: state.people,
    categories: state.categories,
    activeProjectId: state.activeProjectId,
    timelineStartDate: state.timelineStartDate,
    timelineEndDate: state.timelineEndDate,
  };
  const compressed = compressToEncodedURIComponent(JSON.stringify(shareData));
  return `${window.location.origin}${window.location.pathname}?share=${compressed}`;
}

export function parseShareUrl(): Partial<GanttState> | null {
  const params = new URLSearchParams(window.location.search);
  const shareData = params.get('share');
  if (!shareData) return null;

  try {
    const decompressed = decompressFromEncodedURIComponent(shareData);
    if (!decompressed) return null;
    return JSON.parse(decompressed);
  } catch (e) {
    console.error('Failed to parse share URL:', e);
    return null;
  }
}

export function isReadOnlyMode(): boolean {
  return new URLSearchParams(window.location.search).has('share');
}
