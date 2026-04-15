import { LocalAction } from '../types/localAction';

export type EntitySyncBadgeState = 'pending' | 'failed' | 'conflict' | 'synced';

export function resolveEntitySyncBadgeState(actions: LocalAction[]): EntitySyncBadgeState {
  if (actions.some((action) => action.syncStatus === 'conflict')) {
    return 'conflict';
  }
  if (actions.some((action) => action.syncStatus === 'failed')) {
    return 'failed';
  }
  if (actions.some((action) => action.syncStatus === 'pending')) {
    return 'pending';
  }
  return 'synced';
}

export function getEntitySyncBadgeLabel(state: EntitySyncBadgeState): string {
  if (state === 'conflict') {
    return 'Conflit';
  }
  if (state === 'failed') {
    return 'Erreur';
  }
  if (state === 'pending') {
    return 'En attente';
  }
  return 'Synchronisé';
}

export default function SyncStatusBadge({
  state,
  title
}: {
  state: EntitySyncBadgeState;
  title?: string;
}) {
  const label = getEntitySyncBadgeLabel(state);
  return (
    <span
      className={`sync-status-badge sync-status-badge--${state}`.trim()}
      title={title ? `${title} · ${label}` : label}
      aria-label={label}
    >
      <img src="/icons/sync.png" alt="" aria-hidden="true" className="sync-status-badge__icon" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
