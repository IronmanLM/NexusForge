import { ScreenWidgetDefinition, ScreenWidgetType } from '../../types/screenTemplate';

export type WidgetPaletteItem = {
  type: ScreenWidgetType;
  title: string;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  description: string;
};

export const WIDGET_PALETTE: WidgetPaletteItem[] = [
  { type: 'character_sheet', title: 'Fiche de personnage', minW: 4, minH: 6, defaultW: 8, defaultH: 10, description: 'Affiche une fiche liee au systeme de jeu.' },
  { type: 'chat', title: 'Messagerie', minW: 4, minH: 5, defaultW: 7, defaultH: 8, description: 'Canaux de discussion et messages prives.' },
  { type: 'clock', title: 'Horloge temps reel', minW: 2, minH: 2, defaultW: 3, defaultH: 2, description: 'Affiche l heure en direct.' },
  { type: 'alert_overlay', title: 'Overlay d alerte', minW: 3, minH: 2, defaultW: 6, defaultH: 2, description: 'Messages prioritaires et alertes entrantes.' },
  { type: 'participant_presence', title: 'Joueurs présents', minW: 3, minH: 3, defaultW: 4, defaultH: 5, description: 'Indique quels participants ont lancé la séance et sont encore présents.' },
  { type: 'open_target_overlay', title: 'Overlay cible d ouverture', minW: 2, minH: 2, defaultW: 3, defaultH: 2, description: 'Affiche au-dessus de l ecran un contenu ouvert depuis un autre widget.' },
  { type: 'open_target_control', title: 'Controle overlay cible', minW: 3, minH: 2, defaultW: 4, defaultH: 3, description: 'Pilote un overlay cible et indique le contenu actuellement ouvert.' },
  { type: 'pdf_viewer', title: 'Lecteur PDF', minW: 5, minH: 6, defaultW: 8, defaultH: 10, description: 'Lecture de PDF dans la partie.' },
  { type: 'documents', title: 'Gestionnaire de documents', minW: 4, minH: 5, defaultW: 6, defaultH: 8, description: 'Acces aux documents partages et personnels.' },
  { type: 'media_viewer', title: 'Lecteur image / video', minW: 5, minH: 5, defaultW: 8, defaultH: 8, description: 'Images, videos et support battlemap.' },
  { type: 'notes', title: 'Prise de notes', minW: 4, minH: 4, defaultW: 6, defaultH: 7, description: 'Bloc de notes personnelles ou partagees.' },
  { type: 'character_list', title: 'Liste des personnages', minW: 3, minH: 4, defaultW: 5, defaultH: 7, description: 'Acces rapide aux personnages de la partie.' },
  { type: 'dice_history', title: 'Historique des jets', minW: 3, minH: 4, defaultW: 5, defaultH: 6, description: 'Derniers jets visibles dans la partie.' },
  { type: 'initiative', title: 'Initiative', minW: 4, minH: 4, defaultW: 6, defaultH: 7, description: 'Ordre de tour et initiative.' },
  { type: 'session_journal', title: 'Journal de partie', minW: 4, minH: 4, defaultW: 6, defaultH: 7, description: 'Evenements marquants et historique de session.' }
];

export function getWidgetDefaults(type: ScreenWidgetType): Pick<ScreenWidgetDefinition, 'config' | 'dataSource' | 'permissions'> {
  switch (type) {
    case 'character_sheet':
      return {
        config: { sourceMode: 'auto_current', viewMode: 'player', viewId: '', showHeader: true },
        dataSource: { characterId: '', characterLabel: '' },
        permissions: {}
      };
    case 'chat':
      return {
        config: { channel: 'global', allowWhispers: true },
        dataSource: {},
        permissions: {}
      };
    case 'clock':
      return {
        config: { format: '24h', showSeconds: false },
        dataSource: {},
        permissions: {}
      };
    case 'alert_overlay':
      return {
        config: { source: 'all', durationMs: 5000, position: 'top_right' },
        dataSource: {},
        permissions: {}
      };
    case 'participant_presence':
      return {
        config: { showOffline: true, staleAfterSeconds: 45 },
        dataSource: {},
        permissions: {}
      };
    case 'open_target_overlay':
      return {
        config: { showHeader: false, channelKey: 'primary' },
        dataSource: {},
        permissions: {}
      };
    case 'open_target_control':
      return {
        config: { targetWidgetId: '', targetChannelKey: 'primary' },
        dataSource: {},
        permissions: {}
      };
    case 'pdf_viewer':
      return {
        config: { page: 1, showToolbar: true },
        dataSource: { resourceId: '', url: '' },
        permissions: {}
      };
    case 'documents':
      return {
        config: { scope: 'all', allowUpload: true },
        dataSource: {},
        permissions: {}
      };
    case 'media_viewer':
      return {
        config: { mode: 'image', fit: 'contain', autoplay: false },
        dataSource: { resourceId: '', url: '' },
        permissions: {}
      };
    case 'notes':
      return {
        config: { scope: 'private', autosave: true, placeholder: 'Prendre des notes...' },
        dataSource: {},
        permissions: {}
      };
    case 'character_list':
      return {
        config: { showPcs: true, showNpcs: false, showMonsters: false, compact: false },
        dataSource: {},
        permissions: {}
      };
    case 'dice_history':
      return {
        config: { scope: 'party', limit: 10 },
        dataSource: {},
        permissions: {}
      };
    case 'initiative':
      return {
        config: { compact: false, showDetails: true },
        dataSource: {},
        permissions: {}
      };
    case 'session_journal':
      return {
        config: { limit: 10, showFilters: true },
        dataSource: {},
        permissions: {}
      };
    default:
      return { config: {}, dataSource: {}, permissions: {} };
  }
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function widgetTypeLabel(type: ScreenWidgetType): string {
  return WIDGET_PALETTE.find((item) => item.type === type)?.title ?? type;
}

export function widgetPreviewContent(widget: ScreenWidgetDefinition): { headline: string; details: string[] } {
  const config = widget.config ?? {};
  const dataSource = widget.dataSource ?? {};

  switch (widget.type) {
    case 'character_sheet':
      return {
        headline: asString(dataSource.characterLabel, 'Aucune fiche cible'),
        details: [
          `Source: ${asString(config.sourceMode, 'auto_current') === 'explicit' ? 'explicite' : 'joueur courant'}`,
          `Mode: ${asString(config.viewMode, 'player')}`,
          asString(config.viewId) ? `Vue: ${asString(config.viewId)}` : 'Vue auto'
        ]
      };
    case 'chat':
      return {
        headline: `Canal ${asString(config.channel, 'global')}`,
        details: [asBoolean(config.allowWhispers, true) ? 'Whispers actifs' : 'Whispers desactives']
      };
    case 'clock': {
      const options: Intl.DateTimeFormatOptions =
        asString(config.format, '24h') === '12h'
          ? { hour: 'numeric', minute: '2-digit', second: asBoolean(config.showSeconds, false) ? '2-digit' : undefined, hour12: true }
          : { hour: '2-digit', minute: '2-digit', second: asBoolean(config.showSeconds, false) ? '2-digit' : undefined, hour12: false };
      return {
        headline: new Date().toLocaleTimeString('fr-FR', options),
        details: [asString(config.format, '24h').toUpperCase()]
      };
    }
    case 'alert_overlay':
      return {
        headline: 'Alerte prioritaire',
        details: [`Source: ${asString(config.source, 'all')}`, `Position: ${asString(config.position, 'top_right')}`]
      };
    case 'participant_presence':
      return {
        headline: 'Présence de séance',
        details: [
          asBoolean(config.showOffline, true) ? 'Hors ligne visibles' : 'Hors ligne masqués',
          `Délai: ${asNumber(config.staleAfterSeconds, 45)}s`
        ]
      };
    case 'open_target_overlay':
      return {
        headline: 'Overlay cible',
        details: [
          'Affichage plein ecran sur l ecran courant',
          `Canal: ${asString(config.channelKey, 'primary')}`,
          'Reagit aux actions Ouvrir dans'
        ]
      };
    case 'open_target_control':
      return {
        headline: 'Controle overlay',
        details: [
          asString(config.targetWidgetId) ? `Cible: ${asString(config.targetWidgetId)}` : 'Aucune cible associee',
          `Canal: ${asString(config.targetChannelKey, 'primary')}`
        ]
      };
    case 'pdf_viewer':
      return {
        headline: asString(dataSource.url) || asString(dataSource.resourceId, 'PDF non selectionne'),
        details: [`Page ${asNumber(config.page, 1)}`, asBoolean(config.showToolbar, true) ? 'Barre visible' : 'Barre masquee']
      };
    case 'documents':
      return {
        headline: 'Documents',
        details: [`Scope: ${asString(config.scope, 'all')}`, asBoolean(config.allowUpload, true) ? 'Upload autorise' : 'Upload bloque']
      };
    case 'media_viewer':
      return {
        headline: asString(dataSource.url) || asString(dataSource.resourceId, 'Media non selectionne'),
        details: [`Mode: ${asString(config.mode, 'image')}`, `Fit: ${asString(config.fit, 'contain')}`]
      };
    case 'notes':
      return {
        headline: asString(config.placeholder, 'Prendre des notes...'),
        details: [`Scope: ${asString(config.scope, 'private')}`, asBoolean(config.autosave, true) ? 'Autosave active' : 'Autosave inactive']
      };
    case 'character_list':
      return {
        headline: 'Liste personnages',
        details: [
          asBoolean(config.showPcs, true) ? 'PJ visibles' : 'PJ masques',
          asBoolean(config.showNpcs, false) ? 'PNJ visibles' : 'PNJ masques',
          asBoolean(config.showMonsters, false) ? 'Monstres visibles' : 'Monstres masques'
        ]
      };
    case 'dice_history':
      return {
        headline: 'D20 16 + 2',
        details: [`Scope: ${asString(config.scope, 'party')}`, `Limite: ${asNumber(config.limit, 10)}`]
      };
    case 'initiative':
      return {
        headline: 'Ordre du tour',
        details: [asBoolean(config.compact, false) ? 'Vue compacte' : 'Vue detaillee', asBoolean(config.showDetails, true) ? 'Details visibles' : 'Details masques']
      };
    case 'session_journal':
      return {
        headline: 'Journal de partie',
        details: [`Limite: ${asNumber(config.limit, 10)}`, asBoolean(config.showFilters, true) ? 'Filtres visibles' : 'Filtres masques']
      };
    default:
      return { headline: widgetTypeLabel(widget.type), details: [] };
  }
}
