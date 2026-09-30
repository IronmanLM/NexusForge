import { useEffect, useMemo, useRef, useState } from 'react';
import DiscordMarkdown from '../../../components/DiscordMarkdown';
import { noteRepository } from '../../../data/repositories';
import { Note, NoteType } from '../../../types/note';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';

type SessionNotesScreenWidgetProps = {
  currentUser: User;
  currentSession: Session;
  role: 'gm' | 'player';
  scope?: string;
  autosave?: boolean;
  placeholder?: string;
};

type DraftState = {
  title: string;
  content: string;
  type: NoteType;
};

const AUTOSAVE_IDLE_DELAY_MS = 1800;

function emptyDraft(role: 'gm' | 'player', scope: string): DraftState {
  if (scope === 'session') {
    return { title: '', content: '', type: 'public' };
  }
  if (scope === 'gm' || role === 'gm') {
    return { title: '', content: '', type: 'gm_private' };
  }
  return { title: '', content: '', type: 'player_private' };
}

function isDraftEmpty(draft: DraftState): boolean {
  return !draft.title.trim() && !draft.content.trim();
}

function insertTextAtSelection(value: string, token: string, selectionStart: number, selectionEnd: number) {
  const start = value.slice(0, selectionStart);
  const end = value.slice(selectionEnd);
  const nextValue = `${start}${token}${end}`;
  const nextCursor = start.length + token.length;
  return {
    value: nextValue,
    selectionStart: nextCursor,
    selectionEnd: nextCursor
  };
}

function applyMarkdownActionAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action:
    | 'bold'
    | 'italic'
    | 'inlineCode'
    | 'title1'
    | 'title2'
    | 'title3'
    | 'bulletList'
    | 'quote'
    | 'link'
    | 'separator'
    | 'lineBreak'
) {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const fallbackText = selectedText || 'texte';
  const replaceLines = (prefix: string) => {
    const block = (selectedText || 'element').split('\n');
    const next = block.map((line) => `${prefix}${line}`).join('\n');
    return insertTextAtSelection(value, next, selectionStart, selectionEnd);
  };

  switch (action) {
    case 'bold':
      return insertTextAtSelection(value, `**${fallbackText}**`, selectionStart, selectionEnd);
    case 'italic':
      return insertTextAtSelection(value, `*${fallbackText}*`, selectionStart, selectionEnd);
    case 'inlineCode':
      return insertTextAtSelection(value, `\`${fallbackText}\``, selectionStart, selectionEnd);
    case 'title1':
      return insertTextAtSelection(value, `# ${fallbackText}`, selectionStart, selectionEnd);
    case 'title2':
      return insertTextAtSelection(value, `## ${fallbackText}`, selectionStart, selectionEnd);
    case 'title3':
      return insertTextAtSelection(value, `### ${fallbackText}`, selectionStart, selectionEnd);
    case 'bulletList':
      return replaceLines('- ');
    case 'quote':
      return replaceLines('> ');
    case 'link':
      return insertTextAtSelection(value, `[${fallbackText}](https://...)`, selectionStart, selectionEnd);
    case 'separator':
      return insertTextAtSelection(value, '\n---\n', selectionStart, selectionEnd);
    case 'lineBreak':
      return insertTextAtSelection(value, '\n', selectionStart, selectionEnd);
    default:
      return { value, selectionStart, selectionEnd };
  }
}

export default function SessionNotesScreenWidget({
  currentUser,
  currentSession,
  role,
  scope = 'private',
  autosave = true,
  placeholder = 'Prendre des notes...'
}: SessionNotesScreenWidgetProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => emptyDraft(role, scope));
  const [dirty, setDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);

  const allowedTypes = role === 'gm' ? (['public', 'gm_private'] as NoteType[]) : (['public', 'player_private'] as NoteType[]);

  const visibleNotes = useMemo(() => {
    if (scope === 'session') {
      return notes.filter((note) => note.type === 'public');
    }
    if (scope === 'gm') {
      return notes.filter((note) => note.type === 'gm_private');
    }
    if (role === 'gm') {
      return notes.filter((note) => note.type === 'gm_private');
    }
    return notes.filter((note) => note.type === 'player_private' || note.createdByUserId === currentUser.id);
  }, [currentUser.id, notes, role, scope]);

  const selectedNote = useMemo(
    () => visibleNotes.find((note) => note.id === selectedNoteId) ?? null,
    [selectedNoteId, visibleNotes]
  );

  const loadNotes = async () => {
    try {
      const loaded = await noteRepository.listForSession({
        sessionId: currentSession.id,
        currentUserId: currentUser.id,
        role
      });
      setNotes(loaded);
      setErrorMessage(null);
      return loaded;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les notes.');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession.id, currentUser.id, role]);

  useEffect(() => {
    if (selectedNote) {
      setDraft({
        title: selectedNote.title || '',
        content: selectedNote.content,
        type: selectedNote.type
      });
      setDirty(false);
      return;
    }
    setDraft(emptyDraft(role, scope));
    setDirty(false);
  }, [role, scope, selectedNote]);

  useEffect(() => {
    if (!pendingSelection || !textareaRef.current) {
      return;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(pendingSelection.start, pendingSelection.end);
    setPendingSelection(null);
  }, [pendingSelection]);

  const applyMarkdownAction = (
    action:
      | 'bold'
      | 'italic'
      | 'inlineCode'
      | 'title1'
      | 'title2'
      | 'title3'
      | 'bulletList'
      | 'quote'
      | 'link'
      | 'separator'
      | 'lineBreak'
  ) => {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? draft.content.length;
    const selectionEnd = textarea?.selectionEnd ?? draft.content.length;
    const next = applyMarkdownActionAtSelection(draft.content, selectionStart, selectionEnd, action);
    setDraft((current) => ({ ...current, content: next.value }));
    setDirty(true);
    setPendingSelection({ start: next.selectionStart, end: next.selectionEnd });
  };

  const saveNote = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!dirty || isDraftEmpty(draft)) {
      return true;
    }
    setIsSaving(true);
    setErrorMessage(null);
    if (!silent) {
      setStatusMessage(null);
    }
    try {
      const payload: Note = selectedNote
        ? {
            ...selectedNote,
            title: draft.title.trim(),
            content: draft.content,
            type: draft.type,
            updatedAt: new Date().toISOString()
          }
        : {
            id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            scope: 'session',
            scopeRefId: currentSession.id,
            sessionId: currentSession.id,
            type: draft.type,
            title: draft.title.trim(),
            content: draft.content,
            createdByUserId: currentUser.id,
            ownerUserId: draft.type === 'player_private' ? currentUser.id : null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

      const saved = selectedNote ? await noteRepository.update(payload) : await noteRepository.create(payload);
      const loaded = await loadNotes();
      setSelectedNoteId(saved.id);
      setNotes(loaded);
      setDirty(false);
      if (!silent) {
        setStatusMessage(selectedNote ? 'Note enregistree.' : 'Note creee.');
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'enregistrer la note.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!autosave || !dirty) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveNote({ silent: true });
    }, AUTOSAVE_IDLE_DELAY_MS);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, dirty, draft, selectedNoteId]);

  const handleCreate = () => {
    setSelectedNoteId(null);
    setDraft(emptyDraft(role, scope));
    setDirty(false);
    setStatusMessage(null);
  };

  const handleDelete = async () => {
    if (!selectedNote) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await noteRepository.remove({ sessionId: currentSession.id, noteId: selectedNote.id });
      const loaded = await loadNotes();
      setNotes(loaded);
      setSelectedNoteId(null);
      setDraft(emptyDraft(role, scope));
      setDirty(false);
      setStatusMessage('Note supprimee.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer la note.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="session-notes-widget">
      <aside className="card session-notes-widget__sidebar">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
          <strong>Notes</strong>
          <button className="button secondary" type="button" onClick={handleCreate}>
            Nouvelle
          </button>
        </div>
        {visibleNotes.length === 0 ? <p style={{ margin: 0 }}>Aucune note visible.</p> : null}
        <div className="session-notes-widget__note-list">
          {visibleNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className={`button secondary ${selectedNoteId === note.id ? 'is-active' : ''}`.trim()}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => setSelectedNoteId(note.id)}
            >
              {note.title?.trim() || 'Sans titre'}
            </button>
          ))}
        </div>
      </aside>

      <section className="card session-notes-widget__editor">
        <div className="session-notes-widget__status-stack">
          {isLoading ? <p style={{ margin: 0 }}>Chargement des notes...</p> : null}
          {errorMessage ? <p style={{ margin: 0, color: '#fca5a5' }}>{errorMessage}</p> : null}
          {statusMessage ? <p style={{ margin: 0, color: '#93c5fd' }}>{statusMessage}</p> : null}
        </div>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Titre</span>
          <input
            value={draft.title}
            onChange={(event) => {
              setDraft((current) => ({ ...current, title: event.target.value }));
              setDirty(true);
            }}
            placeholder="Titre de la note"
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Type</span>
          <select
            value={draft.type}
            onChange={(event) => {
              setDraft((current) => ({ ...current, type: event.target.value as NoteType }));
              setDirty(true);
            }}
          >
            {allowedTypes.map((type) => (
              <option key={type} value={type}>
                {type === 'public' ? 'Publique' : type === 'gm_private' ? 'Privee MJ' : 'Privee joueur'}
              </option>
            ))}
          </select>
        </label>
        <label className="session-notes-widget__content-field">
          <span>Contenu</span>
          <div className="session-notes-widget__markdown-tools">
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('bold')} title="Met en gras la selection">
              Gras
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('italic')} title="Met en italique la selection">
              Italique
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('inlineCode')} title="Entoure la selection en code">
              Code
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('title1')} title="Insere un titre principal">
              T1
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('title2')} title="Insere un titre secondaire">
              T2
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('title3')} title="Insere un petit titre">
              T3
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('bulletList')} title="Transforme la selection en liste">
              Liste
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('quote')} title="Transforme la selection en citation">
              Citation
            </button>
            <button type="button" className="button secondary" onClick={() => applyMarkdownAction('link')} title="Insere un lien Markdown">
              Lien
            </button>
          </div>
          <div className="session-notes-widget__editor-layout">
            <textarea
              ref={textareaRef}
              value={draft.content}
              onChange={(event) => {
                setDraft((current) => ({ ...current, content: event.target.value }));
                setDirty(true);
              }}
              placeholder={placeholder}
              rows={12}
              className="session-notes-widget__textarea"
            />
            <div className="session-notes-widget__preview">
              <strong>Apercu</strong>
              {draft.content.trim() ? (
                <DiscordMarkdown content={draft.content} />
              ) : (
                <p style={{ margin: 0, opacity: 0.72 }}>Le rendu Markdown apparaitra ici au fil de la saisie.</p>
              )}
            </div>
          </div>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="button" type="button" onClick={() => void saveNote()} disabled={isSaving || isDraftEmpty(draft)}>
            Enregistrer
          </button>
          {selectedNote ? (
            <button className="button danger" type="button" onClick={() => void handleDelete()} disabled={isSaving}>
              Supprimer
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
