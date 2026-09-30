import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../../components/Button';
import DiscordMarkdown from '../../../components/DiscordMarkdown';
import {
  SystemDiscordConfig,
  SystemDiscordOutputDefinition,
  SystemDiscordOutputFormat,
  SystemDiscordOutputKey,
  SystemDiscordOutputSourceType,
  SystemDiscordVisibility,
  SystemStudioViewDefinitionV2
} from '../../../types/system';

type Props = {
  config?: SystemDiscordConfig;
  onChange: (config: SystemDiscordConfig) => void;
  disabled?: boolean;
  views?: SystemStudioViewDefinitionV2[];
};

type TemplateFieldKey = 'template' | 'itemTemplate' | 'emptyTemplate';

type TemplateEditorState = {
  outputKey: SystemDiscordOutputKey;
  field: TemplateFieldKey;
  title: string;
  value: string;
  search: string;
  selectionStart: number;
  selectionEnd: number;
} | null;

type TemplateVariableCandidate = {
  id: string;
  group: string;
  label: string;
  token: string;
  description: string;
};

type DetachedPanelProps = {
  panelKey: string;
  title: string;
  existingWindow?: Window | null;
  onClose: () => void;
  onBlocked?: () => void;
  children: React.ReactNode;
};

const OUTPUT_ORDER: SystemDiscordOutputKey[] = [
  'sheet',
  'inventory',
  'notes',
  'view1',
  'view2',
  'view3',
  'view4',
  'view5',
  'view6',
  'view7',
  'view8',
  'view9'
];

const OUTPUT_LABELS: Record<SystemDiscordOutputKey, { label: string; description: string; sourceType: SystemDiscordOutputSourceType }> = {
  sheet: { label: 'Fiche', description: 'Résumé principal de la fiche personnage.', sourceType: 'sheet' },
  inventory: { label: 'Inventaire', description: 'Résumé d une collection d inventaire ou d équipement.', sourceType: 'collection' },
  notes: { label: 'Notes', description: 'Notes, historique ou journal liés au personnage.', sourceType: 'notes' },
  view1: { label: 'Vue 1', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view2: { label: 'Vue 2', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view3: { label: 'Vue 3', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view4: { label: 'Vue 4', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view5: { label: 'Vue 5', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view6: { label: 'Vue 6', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view7: { label: 'Vue 7', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view8: { label: 'Vue 8', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' },
  view9: { label: 'Vue 9', description: 'Sortie Discord libre configurée par le système.', sourceType: 'view' }
};

const FORMAT_OPTIONS: Array<{ value: SystemDiscordOutputFormat; label: string }> = [
  { value: 'text', label: 'Texte' },
  { value: 'embed', label: 'Embed Discord' }
];

const SOURCE_TYPE_OPTIONS: Array<{ value: SystemDiscordOutputSourceType; label: string }> = [
  { value: 'sheet', label: 'Fiche' },
  { value: 'collection', label: 'Collection' },
  { value: 'notes', label: 'Notes / historique' },
  { value: 'view', label: 'Vue système libre' }
];

function createDefaultOutput(key: SystemDiscordOutputKey): SystemDiscordOutputDefinition {
  const defaults = OUTPUT_LABELS[key];
  return {
    key,
    label: defaults.label,
    description: defaults.description,
    enabled: false,
    format: 'text',
    defaultVisibility: 'private',
    allowedVisibilities: ['private'],
    sourceType: defaults.sourceType,
    sourceRef: '',
    template: '',
    itemTemplate: '',
    emptyTemplate: '',
    maxItems: null
  };
}

function normalizeConfig(config?: SystemDiscordConfig): SystemDiscordConfig {
  const byKey = new Map((config?.outputs ?? []).map((output) => [output.key, output]));
  return {
    version: 1,
    outputs: OUTPUT_ORDER.map((key) => {
      const existing = byKey.get(key);
      if (!existing) {
        return createDefaultOutput(key);
      }
      return {
        ...createDefaultOutput(key),
        ...existing,
        allowedVisibilities:
          Array.isArray(existing.allowedVisibilities) && existing.allowedVisibilities.length > 0
            ? Array.from(new Set(existing.allowedVisibilities))
            : ['private']
      };
    })
  };
}

function normalizeCommandName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

function normalizeIdentifier(input: string): string {
  return String(input || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
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
    const block = (selectedText || 'élément').split('\n');
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

function extractPreviewMediaAndContent(rawContent: string) {
  const lines = String(rawContent || '').split(/\r?\n/);
  let imageSource: string | null = null;
  const keptLines: string[] = [];

  const takeImage = (candidate: string | null | undefined) => {
    if (imageSource || !candidate) {
      return false;
    }
    const trimmed = String(candidate).trim();
    if (!trimmed) {
      return false;
    }
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
      imageSource = trimmed;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const markdownMatch = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)(.*)$/);
    if (markdownMatch && takeImage(markdownMatch[1])) {
      const trailing = String(markdownMatch[2] || '').trim();
      if (trailing) {
        keptLines.push(trailing);
      }
      continue;
    }
    const inlineImageMatch = trimmed.match(/^(data:image\/[a-zA-Z0-9.+-]+;base64,[^\s]+|https?:\/\/[^\s]+)(.*)$/i);
    if (inlineImageMatch && takeImage(inlineImageMatch[1])) {
      const trailing = String(inlineImageMatch[2] || '').trim();
      if (trailing) {
        keptLines.push(trailing);
      }
      continue;
    }
    if (takeImage(trimmed)) {
      continue;
    }
    keptLines.push(line);
  }

  return {
    imageSource,
    content: keptLines.join('\n').trim()
  };
}

function buildPreviewContent(output: SystemDiscordOutputDefinition) {
  if (output.sourceType === 'collection') {
    const header = String(output.template || '').trim();
    const itemTemplate = String(output.itemTemplate || '').trim() || '- @item.nom x@item.quantite';
    const body = [itemTemplate, itemTemplate, itemTemplate].join('\n');
    return [header, body].filter(Boolean).join('\n');
  }
  if (output.sourceType === 'notes') {
    const header = String(output.template || '').trim();
    const itemTemplate = String(output.itemTemplate || '').trim() || '- @note.title : @note.content';
    const body = [itemTemplate, itemTemplate].join('\n');
    return [header, body].filter(Boolean).join('\n');
  }
  return String(output.template || '').trim() || String(output.emptyTemplate || '').trim();
}

function openDetachedDiscordTemplateWindow(panelKey: string, title: string) {
  if (typeof window === 'undefined') {
    return null;
  }
  const popup = window.open('', `nexusforge-discord-template-${panelKey}`, 'popup=yes,width=1500,height=980');
  if (!popup) {
    return null;
  }
  popup.document.title = title;
  return popup;
}

function DetachedTemplatePortal({ panelKey, title, existingWindow, onClose, onBlocked, children }: DetachedPanelProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const isUnmountingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const popup = existingWindow ?? openDetachedDiscordTemplateWindow(panelKey, title);
    if (!popup) {
      onBlocked?.();
      return;
    }

    popup.document.title = title;
    popup.document.head.innerHTML = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      popup.document.head.appendChild(node.cloneNode(true));
    });
    popup.document.body.className = document.body.className;
    popup.document.body.innerHTML = '';
    popup.document.body.style.margin = '0';

    const mountNode = popup.document.createElement('div');
    mountNode.className = 'studio-panel-popout-shell';
    popup.document.body.appendChild(mountNode);
    setContainer(mountNode);

    const observer = new MutationObserver(() => {
      popup.document.body.className = document.body.className;
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const handleBeforeUnload = () => {
      if (isUnmountingRef.current) {
        return;
      }
      observer.disconnect();
      onCloseRef.current();
    };
    popup.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isUnmountingRef.current = true;
      observer.disconnect();
      popup.removeEventListener('beforeunload', handleBeforeUnload);
      if (!popup.closed) {
        popup.close();
      }
    };
  }, [existingWindow, onBlocked, panelKey, title]);

  return container ? createPortal(children, container) : null;
}

function buildTemplateVariableCandidates(
  views: SystemStudioViewDefinitionV2[],
  output: SystemDiscordOutputDefinition,
  field: TemplateFieldKey
): TemplateVariableCandidate[] {
  const items: TemplateVariableCandidate[] = [
    { id: 'global-character-name', group: 'Global', label: 'Nom du personnage', token: '@character.name', description: 'Nom principal du personnage.' },
    { id: 'global-session-name', group: 'Global', label: 'Nom de la partie', token: '@session.name', description: 'Nom de la partie courante.' },
    { id: 'global-system-name', group: 'Global', label: 'Nom du système', token: '@system.name', description: 'Nom du système utilisé.' },
    { id: 'global-user-name', group: 'Global', label: 'Nom du compte lié', token: '@user.displayName', description: 'Nom Nexus Forge du compte lié.' },
    { id: 'global-role', group: 'Global', label: 'Rôle dans la partie', token: '@participant.role', description: 'Rôle du participant dans la session.' }
  ];

  if (output.sourceType === 'view') {
    items.push(
      { id: 'view-name', group: 'Vue ciblée', label: 'Nom de la vue ciblée', token: '@view.name', description: 'Nom de la vue ciblée via sourceRef.' },
      { id: 'view-reference', group: 'Vue ciblée', label: 'Référence de la vue ciblée', token: '@view.reference', description: 'Référence technique de la vue ciblée.' }
    );
  }

  if (field === 'itemTemplate' && output.sourceType === 'collection') {
    items.push(
      { id: 'item-index', group: 'Item collection', label: 'Index', token: '@index', description: 'Index zéro-based de l item.' },
      { id: 'item-position', group: 'Item collection', label: 'Position', token: '@position', description: 'Position humaine de l item.' },
      { id: 'item-root', group: 'Item collection', label: 'Objet item', token: '@item', description: 'Objet item brut de la collection.' }
    );
  }

  if (field === 'itemTemplate' && output.sourceType === 'notes') {
    items.push(
      { id: 'note-index', group: 'Note', label: 'Index', token: '@index', description: 'Index zéro-based de la note.' },
      { id: 'note-position', group: 'Note', label: 'Position', token: '@position', description: 'Position humaine de la note.' },
      { id: 'note-title', group: 'Note', label: 'Titre de note', token: '@note.title', description: 'Titre de la note.' },
      { id: 'note-content', group: 'Note', label: 'Contenu de note', token: '@note.content', description: 'Contenu de la note.' },
      { id: 'note-type', group: 'Note', label: 'Type de note', token: '@note.type', description: 'public, gm_private ou player_private.' }
    );
  }

  const seen = new Set(items.map((item) => item.token));
  for (const view of views) {
    const aliases = Array.from(
      new Set(
        [view.reference, normalizeIdentifier(view.name), view.id]
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
      )
    );
    const preferredAlias = aliases[0];
    for (const node of view.nodes || []) {
      const nodeKey = String(node.key || '').trim();
      if (!nodeKey) {
        continue;
      }
      const directToken = `@${nodeKey}`;
      if (!seen.has(directToken)) {
        seen.add(directToken);
        items.push({
          id: `direct-${view.id}-${node.id}`,
          group: 'Champs directs',
          label: `${node.label || nodeKey} (${view.name})`,
          token: directToken,
          description: 'Accès direct par clé de champ.'
        });
      }

      if (preferredAlias) {
        const scopedToken = `{{${preferredAlias}.${nodeKey}}}`;
        if (!seen.has(scopedToken)) {
          seen.add(scopedToken);
          items.push({
            id: `scoped-${view.id}-${node.id}`,
            group: `Vue : ${view.name}`,
            label: node.label || nodeKey,
            token: scopedToken,
            description: `Accès scoped par vue via ${preferredAlias}.`
          });
        }
      }
    }
  }

  return items;
}

function DiscordTemplateComposer({
  state,
  output,
  views,
  onClose,
  onApply,
  onSearchChange,
  onValueChange,
  onSelectionChange,
  onInsert
}: {
  state: NonNullable<TemplateEditorState>;
  output: SystemDiscordOutputDefinition;
  views: SystemStudioViewDefinitionV2[];
  onClose: () => void;
  onApply: () => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  onInsert: (token: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const candidates = useMemo(() => buildTemplateVariableCandidates(views, output, state.field), [output, state.field, views]);
  const filteredCandidates = useMemo(() => {
    const search = state.search.trim().toLowerCase();
    if (!search) {
      return candidates;
    }
    return candidates.filter((item) =>
      [item.group, item.label, item.token, item.description].join(' ').toLowerCase().includes(search)
    );
  }, [candidates, state.search]);
  const groups = useMemo(() => {
    const grouped = new Map<string, TemplateVariableCandidate[]>();
    for (const item of filteredCandidates) {
      const current = grouped.get(item.group) ?? [];
      current.push(item);
      grouped.set(item.group, current);
    }
    return [...grouped.entries()];
  }, [filteredCandidates]);

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
    const next = applyMarkdownActionAtSelection(state.value, state.selectionStart, state.selectionEnd, action);
    onValueChange(next.value);
    onSelectionChange(next.selectionStart, next.selectionEnd);
  };

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(state.selectionStart, state.selectionEnd);
  }, [state.selectionEnd, state.selectionStart, state.value]);

  return (
    <div className="card" style={{ margin: 0, display: 'grid', gap: '1rem', minHeight: '100vh', boxSizing: 'border-box', alignContent: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{state.title}</h2>
          <p style={{ margin: 0, opacity: 0.82 }}>
            Éditeur plein format pour les templates Discord. Clique une variable pour l insérer à l endroit du curseur.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button type="button" onClick={onApply}>
            Appliquer
          </Button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 420px) minmax(0, 1fr)', alignItems: 'start' }}>
        <section className="card" style={{ margin: 0, display: 'grid', gap: '0.75rem', maxHeight: '80vh', overflow: 'auto' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <strong>Matrice des variables</strong>
            <small>Variables globales, champs directs et accès par vue <code>{'{{VueRef.cle}}'}</code>.</small>
          </div>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Recherche</span>
            <input value={state.search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Vue, variable, clé..." />
          </label>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {groups.map(([group, items]) => (
              <div key={group} style={{ display: 'grid', gap: '0.35rem' }}>
                <strong>{group}</strong>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="button secondary"
                      style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                      onClick={() => onInsert(item.token)}
                      title={item.description}
                    >
                      <span>
                        <strong>{item.label}</strong>
                        <br />
                        <code>{item.token}</code>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 ? <p style={{ margin: 0, opacity: 0.8 }}>Aucune variable ne correspond à la recherche.</p> : null}
          </div>
        </section>

        <section className="card" style={{ margin: 0, display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <strong>Template en cours</strong>
            <small>
              Utilise les clés directes <code>@ma_cle</code> ou les chemins par vue <code>{'{{MaVue.ma_cle}}'}</code>.
            </small>
          </div>
          <textarea
            ref={textareaRef}
            rows={22}
            value={state.value}
            onChange={(event) => onValueChange(event.target.value)}
            onSelect={(event) => onSelectionChange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
            onClick={(event) => onSelectionChange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
            onKeyUp={(event) => onSelectionChange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
            placeholder="Compose le template Discord ici"
          />
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <strong style={{ fontSize: '0.95rem' }}>Aides Markdown</strong>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('bold')} title="Met en gras la sélection">
                Gras
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('italic')} title="Met en italique la sélection">
                Italique
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('inlineCode')} title="Entoure la sélection en code inline">
                Code
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('title1')} title="Insère un grand titre">
                Titre 1
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('title2')} title="Insère un titre secondaire">
                Titre 2
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('title3')} title="Insère un petit titre">
                Titre 3
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('bulletList')} title="Transforme la sélection en liste à puces">
                Liste
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('quote')} title="Transforme la sélection en citation">
                Citation
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('link')} title="Insère un lien Markdown">
                Lien
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('separator')} title="Insère un séparateur">
                Séparateur
              </button>
              <button type="button" className="button secondary" onClick={() => applyMarkdownAction('lineBreak')} title="Ajoute un retour à la ligne">
                Retour ligne
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function renderTemplateFieldEditorButton(params: {
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
      <Button type="button" variant="secondary" onClick={params.onClick} disabled={params.disabled}>
        Éditeur détaché
      </Button>
    </div>
  );
}

export default function SystemDiscordConfigManager({ config, onChange, disabled = false, views = [] }: Props) {
  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
  const [selectedKey, setSelectedKey] = useState<SystemDiscordOutputKey>('sheet');
  const [templateEditor, setTemplateEditor] = useState<TemplateEditorState>(null);
  const [detachedOpen, setDetachedOpen] = useState(false);
  const [detachedBlocked, setDetachedBlocked] = useState(false);
  const [detachedRetryKey, setDetachedRetryKey] = useState(0);
  const detachedWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!OUTPUT_ORDER.includes(selectedKey)) {
      setSelectedKey('sheet');
    }
  }, [selectedKey]);

  const selectedOutput = useMemo(
    () => normalizedConfig.outputs.find((output) => output.key === selectedKey) ?? normalizedConfig.outputs[0],
    [normalizedConfig.outputs, selectedKey]
  );

  const editorOutput = useMemo(
    () => (templateEditor ? normalizedConfig.outputs.find((output) => output.key === templateEditor.outputKey) ?? null : null),
    [normalizedConfig.outputs, templateEditor]
  );

  const preview = useMemo(() => {
    if (!selectedOutput) {
      return { content: '', imageSource: null as string | null };
    }
    return extractPreviewMediaAndContent(buildPreviewContent(selectedOutput));
  }, [selectedOutput]);

  const updateOutput = (key: SystemDiscordOutputKey, updater: (output: SystemDiscordOutputDefinition) => SystemDiscordOutputDefinition) => {
    onChange({
      version: 1,
      outputs: normalizedConfig.outputs.map((output) => (output.key === key ? updater(output) : output))
    });
  };

  const handleVisibilityToggle = (output: SystemDiscordOutputDefinition, value: SystemDiscordVisibility) => {
    const nextAllowed = output.allowedVisibilities.includes(value)
      ? output.allowedVisibilities.filter((entry) => entry !== value)
      : [...output.allowedVisibilities, value];
    const safeAllowed = nextAllowed.length > 0 ? nextAllowed : [output.defaultVisibility];
    updateOutput(output.key, (current) => ({
      ...current,
      allowedVisibilities: safeAllowed,
      defaultVisibility: safeAllowed.includes(current.defaultVisibility) ? current.defaultVisibility : safeAllowed[0]
    }));
  };

  const openTemplateEditor = (field: TemplateFieldKey, title: string, value: string) => {
    const popup = openDetachedDiscordTemplateWindow('discord-template', `Nexus Forge - ${title}`);
    setTemplateEditor({
      outputKey: selectedOutput.key,
      field,
      title,
      value,
      search: '',
      selectionStart: value.length,
      selectionEnd: value.length
    });
    detachedWindowRef.current = popup;
    setDetachedBlocked(!popup);
    setDetachedOpen(true);
  };

  const applyTemplateEditor = () => {
    if (!templateEditor) {
      return;
    }
    updateOutput(templateEditor.outputKey, (current) => ({
      ...current,
      [templateEditor.field]: templateEditor.value
    }));
    detachedWindowRef.current = null;
    setDetachedOpen(false);
    setTemplateEditor(null);
  };

  return (
    <>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)' }}>
        <aside className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
          <div>
            <strong>Sorties Discord</strong>
            <div>
              <small>{normalizedConfig.outputs.filter((output) => output.enabled).length} activée(s) sur {normalizedConfig.outputs.length}</small>
            </div>
          </div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {normalizedConfig.outputs.map((output) => (
              <button
                key={output.key}
                type="button"
                className="button secondary"
                style={{
                  justifyContent: 'space-between',
                  borderColor: selectedKey === output.key ? '#3b82f6' : undefined,
                  background: selectedKey === output.key ? 'rgba(59,130,246,0.15)' : undefined
                }}
                onClick={() => setSelectedKey(output.key)}
              >
                <span>{output.label || output.key}</span>
                <small>{output.enabled ? 'Activée' : 'Inactive'}</small>
              </button>
            ))}
          </div>
        </aside>

        {selectedOutput ? (
          <section className="card" style={{ margin: 0, padding: '1rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong>{selectedOutput.label || selectedOutput.key}</strong>
                  <div>
                    <small>{selectedOutput.description || OUTPUT_LABELS[selectedOutput.key].description}</small>
                  </div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedOutput.enabled}
                    disabled={disabled}
                    onChange={(event) =>
                      updateOutput(selectedOutput.key, (current) => ({
                        ...current,
                        enabled: event.target.checked
                      }))
                    }
                  />
                  Activée
                </label>
              </div>
            </div>

            <div className="grid">
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Libellé</span>
                <input
                  value={selectedOutput.label}
                  disabled={disabled}
                  onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, label: event.target.value }))}
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Description</span>
                <textarea
                  rows={2}
                  value={selectedOutput.description ?? ''}
                  disabled={disabled}
                  onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label>
                <span>Format</span>
                <select
                  value={selectedOutput.format}
                  disabled={disabled}
                  onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, format: event.target.value as SystemDiscordOutputFormat }))}
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Source</span>
                <select
                  value={selectedOutput.sourceType}
                  disabled={disabled}
                  onChange={(event) =>
                    updateOutput(selectedOutput.key, (current) => ({
                      ...current,
                      sourceType: event.target.value as SystemDiscordOutputSourceType
                    }))
                  }
                >
                  {SOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Commande courte</span>
                <input
                  value={selectedOutput.commandName ?? ''}
                  disabled={disabled}
                  placeholder="ex: fiche, inv, vue1"
                  onChange={(event) =>
                    updateOutput(selectedOutput.key, (current) => ({
                      ...current,
                      commandName: normalizeCommandName(event.target.value)
                    }))
                  }
                />
              </label>
              <label>
                <span>Référence source</span>
                <input
                  value={selectedOutput.sourceRef ?? ''}
                  disabled={disabled}
                  placeholder="ex: inventaire, notes, vue_resume"
                  onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, sourceRef: event.target.value }))}
                />
              </label>
              <label>
                <span>Visibilité par défaut</span>
                <select
                  value={selectedOutput.defaultVisibility}
                  disabled={disabled}
                  onChange={(event) =>
                    updateOutput(selectedOutput.key, (current) => ({
                      ...current,
                      defaultVisibility: event.target.value as SystemDiscordVisibility
                    }))
                  }
                >
                  <option value="private">Privé</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label>
                <span>Limite d éléments</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedOutput.maxItems ?? ''}
                  disabled={disabled}
                  placeholder="vide = pas de limite"
                  onChange={(event) =>
                    updateOutput(selectedOutput.key, (current) => ({
                      ...current,
                      maxItems: event.target.value === '' ? null : Math.max(0, Math.min(100, Number(event.target.value) || 0))
                    }))
                  }
                />
              </label>
            </div>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <strong>Visibilités autorisées</strong>
              <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedOutput.allowedVisibilities.includes('private')}
                    disabled={disabled}
                    onChange={() => handleVisibilityToggle(selectedOutput, 'private')}
                  />
                  Privé
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedOutput.allowedVisibilities.includes('public')}
                    disabled={disabled}
                    onChange={() => handleVisibilityToggle(selectedOutput, 'public')}
                  />
                  Public
                </label>
              </div>
              <small>Une sortie peut n autoriser que le privé, ou laisser le choix entre privé et public.</small>
            </div>

            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Template principal</span>
              <textarea
                rows={8}
                value={selectedOutput.template}
                disabled={disabled}
                placeholder="Exemple : **@nom**&#10;HP : @hp/@hp_max&#10;ou **{{Identitee.nom_du_personnage}}**"
                onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, template: event.target.value }))}
              />
              {renderTemplateFieldEditorButton({
                disabled,
                title: 'Template principal',
                onClick: () => openTemplateEditor('template', `Discord - ${selectedOutput.label} - template principal`, selectedOutput.template)
              })}
            </label>

            <div className="grid">
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Template item</span>
                <textarea
                  rows={3}
                  value={selectedOutput.itemTemplate ?? ''}
                  disabled={disabled}
                  placeholder="- @item.nom x@item.quantite"
                  onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, itemTemplate: event.target.value }))}
                />
                {renderTemplateFieldEditorButton({
                  disabled,
                  title: 'Template item',
                  onClick: () => openTemplateEditor('itemTemplate', `Discord - ${selectedOutput.label} - template item`, selectedOutput.itemTemplate ?? '')
                })}
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Template vide</span>
                <textarea
                  rows={2}
                  value={selectedOutput.emptyTemplate ?? ''}
                  disabled={disabled}
                  placeholder="Aucune donnée disponible."
                  onChange={(event) => updateOutput(selectedOutput.key, (current) => ({ ...current, emptyTemplate: event.target.value }))}
                />
                {renderTemplateFieldEditorButton({
                  disabled,
                  title: 'Template vide',
                  onClick: () => openTemplateEditor('emptyTemplate', `Discord - ${selectedOutput.label} - template vide`, selectedOutput.emptyTemplate ?? '')
                })}
              </label>
            </div>

            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <strong>Rappel</strong>
              <small>
                Cette configuration prépare uniquement des sorties Discord en lecture. Le bot n écrit rien dans la fiche, ne modifie
                pas l inventaire et ne déclenche aucune action système depuis ce bloc.
              </small>
              <small>
                Tu peux maintenant utiliser des chemins par vue du type <code>{'{{Identitee.nom_du_personnage}}'}</code> si la référence de vue
                et la clé de champ existent.
              </small>
            </div>

            <section className="card" style={{ margin: 0, display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <strong>Prévisualisation live Discord</strong>
                <small>
                  Cette preview montre le rendu auteur actuel, y compris l extraction d image pour les embeds. Les variables restent visibles tant qu elles ne sont pas résolues dans une vraie partie.
                </small>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="button secondary" style={{ pointerEvents: 'none' }}>
                  Format : {selectedOutput.format === 'embed' ? 'Embed Discord' : 'Texte'}
                </span>
                <span className="button secondary" style={{ pointerEvents: 'none' }}>
                  Visibilité par défaut : {selectedOutput.defaultVisibility === 'public' ? 'Public' : 'Privé'}
                </span>
              </div>
              {selectedOutput.format === 'embed' ? (
                <div className="card" style={{ margin: 0, background: 'rgba(88,101,242,0.08)', borderColor: 'rgba(88,101,242,0.35)', display: 'grid', gap: '0.75rem' }}>
                  <div style={{ borderLeft: '4px solid #5865f2', paddingLeft: '0.85rem', display: 'grid', gap: '0.65rem' }}>
                    <strong>{selectedOutput.label || 'Sortie Discord'}</strong>
                    {preview.imageSource ? (
                      <img
                        src={preview.imageSource}
                        alt="Prévisualisation Discord"
                        style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '0.75rem', background: 'rgba(15,23,42,0.35)' }}
                      />
                    ) : null}
                    {preview.content ? <DiscordMarkdown content={preview.content} /> : <small>Aucun contenu texte à afficher dans l embed.</small>}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ margin: 0, display: 'grid', gap: '0.5rem' }}>
                  {preview.imageSource ? (
                    <small>L image détectée ne sera pas affichée en mode texte. Passe la sortie en `embed` pour profiter d une vraie image Discord.</small>
                  ) : null}
                  <DiscordMarkdown content={preview.content || 'Aucun contenu texte.'} />
                </div>
              )}
            </section>
          </section>
        ) : null}
      </div>

      {detachedOpen && templateEditor && editorOutput && !detachedBlocked ? (
        <DetachedTemplatePortal
          key={`discord-template-${detachedRetryKey}`}
          panelKey="discord-template"
          title={`Nexus Forge - ${templateEditor.title}`}
          existingWindow={detachedWindowRef.current}
          onClose={() => {
            detachedWindowRef.current = null;
            setDetachedOpen(false);
            setTemplateEditor(null);
          }}
          onBlocked={() => setDetachedBlocked(true)}
        >
          <section className="studio-panel studio-panel--detached">
            <DiscordTemplateComposer
              state={templateEditor}
              output={editorOutput}
              views={views}
              onClose={() => {
                detachedWindowRef.current = null;
                setDetachedOpen(false);
                setTemplateEditor(null);
              }}
              onApply={applyTemplateEditor}
              onSearchChange={(value) => setTemplateEditor((current) => (current ? { ...current, search: value } : current))}
              onValueChange={(value) => setTemplateEditor((current) => (current ? { ...current, value } : current))}
              onSelectionChange={(start, end) =>
                setTemplateEditor((current) => (current ? { ...current, selectionStart: start, selectionEnd: end } : current))
              }
              onInsert={(token) =>
                setTemplateEditor((current) =>
                  current
                    ? {
                        ...current,
                        ...insertTextAtSelection(current.value, token, current.selectionStart, current.selectionEnd)
                      }
                    : current
                )
              }
            />
          </section>
        </DetachedTemplatePortal>
      ) : null}

      {detachedOpen && templateEditor && editorOutput && detachedBlocked
        ? createPortal(
            <div
              className="resource-preview-modal"
              onClick={() => {
                setDetachedOpen(false);
                setTemplateEditor(null);
              }}
            >
              <section
                className="resource-preview-modal__dialog"
                style={{ width: 'min(1480px, 98vw)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="resource-preview-modal__header">
                  <div>
                    <strong>{templateEditor.title}</strong>
                    <small>Fenêtre détachée bloquée : l éditeur est affiché dans une modale intégrée.</small>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const popup = openDetachedDiscordTemplateWindow('discord-template', `Nexus Forge - ${templateEditor.title}`);
                        detachedWindowRef.current = popup;
                        setDetachedBlocked(!popup);
                        setDetachedRetryKey((value) => value + 1);
                      }}
                    >
                      Réessayer en fenêtre
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        detachedWindowRef.current = null;
                        setDetachedOpen(false);
                        setTemplateEditor(null);
                      }}
                    >
                      Fermer
                    </Button>
                  </div>
                </header>
                <div className="resource-preview-modal__body">
                  <DiscordTemplateComposer
                    state={templateEditor}
                    output={editorOutput}
                    views={views}
                    onClose={() => {
                      detachedWindowRef.current = null;
                      setDetachedOpen(false);
                      setTemplateEditor(null);
                    }}
                    onApply={applyTemplateEditor}
                    onSearchChange={(value) => setTemplateEditor((current) => (current ? { ...current, search: value } : current))}
                    onValueChange={(value) => setTemplateEditor((current) => (current ? { ...current, value } : current))}
                    onSelectionChange={(start, end) =>
                      setTemplateEditor((current) => (current ? { ...current, selectionStart: start, selectionEnd: end } : current))
                    }
                    onInsert={(token) =>
                      setTemplateEditor((current) =>
                        current
                          ? {
                              ...current,
                              ...insertTextAtSelection(current.value, token, current.selectionStart, current.selectionEnd)
                            }
                          : current
                      )
                    }
                  />
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
