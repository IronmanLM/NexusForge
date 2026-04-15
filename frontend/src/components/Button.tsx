import { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }
>;

type ActionIconName =
  | 'add'
  | 'back'
  | 'close'
  | 'convert'
  | 'copy'
  | 'cut'
  | 'edit'
  | 'export'
  | 'filter'
  | 'fullscreen'
  | 'import'
  | 'message'
  | 'move'
  | 'newfolder'
  | 'next'
  | 'open'
  | 'paste'
  | 'preview'
  | 'previous'
  | 'refresh'
  | 'save'
  | 'search'
  | 'settings'
  | 'sync'
  | 'trash'
  | 'user';

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => extractText(item)).join(' ').trim();
  }
  if (!node || typeof node !== 'object' || !('props' in node)) {
    return '';
  }
  return extractText((node as { props?: { children?: ReactNode } }).props?.children ?? '');
}

function resolveActionIcon(label: string): ActionIconName | null {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('fermer')) {
    return 'close';
  }
  if (normalized.includes('convert')) {
    return 'convert';
  }
  if (normalized.includes('enregistrer') || normalized.includes('sauvegard')) {
    return 'save';
  }
  if (normalized.includes('modifier') || normalized.includes('editer') || normalized.includes('mettre a jour')) {
    return 'edit';
  }
  if (normalized.includes('rechercher')) {
    return 'search';
  }
  if (normalized.includes('param')) {
    return 'settings';
  }
  if (normalized.includes('plein ecran')) {
    return 'fullscreen';
  }
  if (normalized.includes('previsual') || normalized.includes('apercu')) {
    return 'preview';
  }
  if (normalized.includes('retour')) {
    return 'back';
  }
  if (normalized.includes('suivant')) {
    return 'next';
  }
  if (normalized.includes('precedent') || normalized.includes('precedente')) {
    return 'previous';
  }
  if (normalized.includes('filtre')) {
    return 'filter';
  }
  if (normalized.includes('message') || normalized.includes('messagerie') || normalized.includes('contacter')) {
    return 'message';
  }
  if (normalized.includes('profil') || normalized.includes('utilisateur')) {
    return 'user';
  }
  if (normalized.includes('import') || normalized.includes('televers') || normalized.includes('upload')) {
    return 'import';
  }
  if (normalized.includes('export') || normalized.includes('telecharg')) {
    return 'export';
  }
  if (normalized.includes('synchron') || normalized.includes('rafraich') || normalized.includes('recharg')) {
    return 'sync';
  }
  if (normalized.includes('ouvrir')) {
    return 'open';
  }
  if (normalized.includes('supprimer')) {
    return 'trash';
  }
  if (normalized.includes('copier') || normalized.includes('dupliquer') || normalized.includes('cloner')) {
    return 'copy';
  }
  if (normalized.includes('couper')) {
    return 'cut';
  }
  if (normalized.includes('coller')) {
    return 'paste';
  }
  if (normalized.includes('deplacer') || normalized.includes('deplacement')) {
    return 'move';
  }
  if (normalized.includes('dossier') && (normalized.includes('ajouter') || normalized.includes('creer') || normalized.includes('nouveau'))) {
    return 'newfolder';
  }
  if (normalized.includes('ajouter') || normalized.includes('creer') || normalized.includes('nouveau') || normalized.includes('inviter')) {
    return 'add';
  }

  return null;
}

export default function Button({ children, variant = 'primary', ...props }: ButtonProps) {
  const label = extractText(children);
  const actionIcon = resolveActionIcon(label);
  const isIconOnly = Boolean(actionIcon);

  return (
    <button
      className={`button ${variant === 'secondary' ? 'secondary' : variant === 'danger' ? 'danger' : ''} ${isIconOnly ? 'button--icon-only' : ''}`.trim()}
      aria-label={isIconOnly ? (props['aria-label'] ?? label) : props['aria-label']}
      title={isIconOnly ? (props.title ?? label) : props.title}
      {...props}
    >
      {actionIcon ? (
        <img src={`/icons/${actionIcon}.png`} alt="" aria-hidden="true" className="button__icon-image" />
      ) : null}
      {!isIconOnly ? children : null}
    </button>
  );
}
