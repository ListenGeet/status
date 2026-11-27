export type MonitorState = 'operational' | 'down' | 'paused' | 'checking' | 'unknown';

export interface MonitorResult {
  id: string;
  label: string;
  url: string;
  host: string;
  state: MonitorState;
  detail?: string;
  monitorName?: string;
  responseTime?: number | null;
}

export interface StatusSnapshot {
  checkedAt: string;
  clientRefreshMs: number;
  monitors: MonitorResult[];
}
