import { useEffect, useMemo, useState } from 'react';
import { sessionRepository } from '../../../data/repositories';
import { Session, SessionParticipant } from '../../../types/session';

type SessionParticipantPresenceWidgetProps = {
  currentSession: Session;
  showOffline?: boolean;
  staleAfterSeconds?: number;
};

function participantName(participant: SessionParticipant): string {
  return participant.nickname || participant.displayName || participant.userId;
}

function participantInitials(participant: SessionParticipant): string {
  const label = participantName(participant).trim();
  if (!label) {
    return '?';
  }
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function isParticipantRuntimeActive(participant: SessionParticipant, staleAfterSeconds: number): boolean {
  if (!participant.isConnected || !participant.lastSeenAt) {
    return false;
  }
  const ageMs = Date.now() - new Date(participant.lastSeenAt).getTime();
  return ageMs <= staleAfterSeconds * 1000;
}

export default function SessionParticipantPresenceWidget({
  currentSession,
  showOffline = true,
  staleAfterSeconds = 45
}: SessionParticipantPresenceWidgetProps) {
  const [participants, setParticipants] = useState<SessionParticipant[]>(currentSession.participants ?? []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const refreshed = await sessionRepository.getById(currentSession.id);
      if (active) {
        if (refreshed?.participants) {
          setParticipants(refreshed.participants);
        }
      }
    };

    setParticipants(currentSession.participants ?? []);
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentSession.id, currentSession.participants]);

  const rows = useMemo(() => {
    return participants
      .map((participant) => ({
        participant,
        isActive: isParticipantRuntimeActive(participant, staleAfterSeconds)
      }))
      .filter((entry) => showOffline || entry.isActive)
      .sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }
        return participantName(left.participant).localeCompare(participantName(right.participant), 'fr');
      });
  }, [participants, showOffline, staleAfterSeconds]);

  const activeCount = rows.filter((entry) => entry.isActive).length;

  return (
    <div className="screen-widget-list screen-widget-list--compact">
      <div className="screen-widget-list__header">
        <strong>Présence</strong>
        <small>{activeCount} actif(s)</small>
      </div>
      {rows.length === 0 ? <p style={{ margin: 0 }}>Aucun participant à afficher.</p> : null}
      <div className="screen-widget-list__items">
        {rows.map(({ participant, isActive }) => {
          return (
            <article
              key={participant.userId}
              className={`screen-widget-row screen-widget-row--presence${isActive ? ' is-active' : ''}`.trim()}
            >
              <div className="screen-widget-avatar" aria-hidden="true">
                {participantInitials(participant)}
              </div>
              <div className={`screen-widget-row__dot${isActive ? ' is-active' : ''}`.trim()} aria-hidden="true" />
              <strong className="screen-widget-row__label">{participantName(participant)}</strong>
              <span className={`screen-widget-status${isActive ? ' is-active' : ''}`.trim()}>
                {isActive ? 'En ligne' : 'Hors ligne'}
              </span>
            </article>
          );
        })}
      </div>
    </div>
  );
}
