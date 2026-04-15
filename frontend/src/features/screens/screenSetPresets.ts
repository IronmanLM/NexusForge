import type { ScreenDefinition, ScreenSetDefinition } from '../../types/screenTemplate';

export type ScreenOrientation = 'landscape' | 'portrait';
export type ScreenFormatPreset =
  | 'desktop_full_hd'
  | 'desktop_wide'
  | 'ultrawide'
  | 'tablet_landscape'
  | 'tablet_portrait'
  | 'mobile_portrait'
  | 'mobile_landscape'
  | 'custom';

export type ScreenFormatDefinition = {
  preset: ScreenFormatPreset;
  label: string;
  aspectRatio: string;
  orientation: ScreenOrientation;
  referenceWidth: number;
  referenceHeight: number;
};

type ScreenFormatCarrier = {
  screenFormatPreset?: ScreenFormatPreset;
  aspectRatio?: string;
  orientation?: ScreenOrientation;
  referenceWidth?: number;
  referenceHeight?: number;
};

function swapAspectRatio(aspectRatio?: string): string | undefined {
  if (!aspectRatio || !aspectRatio.includes(':')) {
    return aspectRatio;
  }
  const [left, right] = aspectRatio.split(':').map((value) => value.trim());
  if (!left || !right) {
    return aspectRatio;
  }
  return `${right}:${left}`;
}

function normalizeCarrierOrientation<T extends ScreenFormatCarrier>(target: T): T {
  const orientation = target.orientation ?? 'landscape';
  const referenceWidth = typeof target.referenceWidth === 'number' ? target.referenceWidth : undefined;
  const referenceHeight = typeof target.referenceHeight === 'number' ? target.referenceHeight : undefined;
  if (!referenceWidth || !referenceHeight) {
    return target;
  }
  if (orientation === 'portrait' && referenceWidth > referenceHeight) {
    return {
      ...target,
      referenceWidth: referenceHeight,
      referenceHeight: referenceWidth,
      aspectRatio: swapAspectRatio(target.aspectRatio)
    };
  }
  if (orientation === 'landscape' && referenceHeight > referenceWidth) {
    return {
      ...target,
      referenceWidth: referenceHeight,
      referenceHeight: referenceWidth,
      aspectRatio: swapAspectRatio(target.aspectRatio)
    };
  }
  return target;
}

export const SCREEN_FORMAT_PRESETS: ScreenFormatDefinition[] = [
  { preset: 'desktop_full_hd', label: 'PC Full HD', aspectRatio: '16:9', orientation: 'landscape', referenceWidth: 1920, referenceHeight: 1080 },
  { preset: 'desktop_wide', label: 'PC 16:10', aspectRatio: '16:10', orientation: 'landscape', referenceWidth: 1920, referenceHeight: 1200 },
  { preset: 'ultrawide', label: 'Ultrawide', aspectRatio: '21:9', orientation: 'landscape', referenceWidth: 2560, referenceHeight: 1080 },
  { preset: 'tablet_landscape', label: 'Tablette paysage', aspectRatio: '4:3', orientation: 'landscape', referenceWidth: 1024, referenceHeight: 768 },
  { preset: 'tablet_portrait', label: 'Tablette portrait', aspectRatio: '3:4', orientation: 'portrait', referenceWidth: 768, referenceHeight: 1024 },
  { preset: 'mobile_portrait', label: 'Téléphone portrait', aspectRatio: '9:16', orientation: 'portrait', referenceWidth: 1080, referenceHeight: 1920 },
  { preset: 'mobile_landscape', label: 'Téléphone paysage', aspectRatio: '16:9', orientation: 'landscape', referenceWidth: 1920, referenceHeight: 1080 },
  { preset: 'custom', label: 'Personnalisé', aspectRatio: '16:9', orientation: 'landscape', referenceWidth: 1920, referenceHeight: 1080 }
];

export function getScreenFormatDefinition(preset?: ScreenFormatPreset | null): ScreenFormatDefinition {
  return SCREEN_FORMAT_PRESETS.find((entry) => entry.preset === preset) ?? SCREEN_FORMAT_PRESETS[0];
}

export function getDefaultScreenFormatPreset(devicePreset: ScreenSetDefinition['devicePreset']): ScreenFormatPreset {
  switch (devicePreset) {
    case 'tablet':
      return 'tablet_landscape';
    case 'mobile':
      return 'mobile_portrait';
    case 'desktop_1':
    case 'desktop_2':
    case 'desktop_3':
    default:
      return 'desktop_full_hd';
  }
}

function applyFormatCarrier<T extends object>(target: T, preset: ScreenFormatPreset): T & ScreenFormatCarrier {
  const definition = getScreenFormatDefinition(preset);
  return normalizeCarrierOrientation({
    ...target,
    screenFormatPreset: preset,
    aspectRatio: definition.aspectRatio,
    orientation: definition.orientation,
    referenceWidth: definition.referenceWidth,
    referenceHeight: definition.referenceHeight
  });
}

export function applyScreenFormatPreset<T extends object>(
  set: T,
  preset: ScreenFormatPreset
): T & Pick<ScreenSetDefinition, 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'> {
  return applyFormatCarrier(set, preset);
}

export function applyScreenFormatPresetToScreen<T extends object>(
  screen: T,
  preset: ScreenFormatPreset
): T & Pick<ScreenDefinition, 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'> {
  return applyFormatCarrier(screen, preset);
}

export function ensureScreenSetFormat<T extends Pick<ScreenSetDefinition, 'devicePreset' | 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'>>(
  set: T
): T & Pick<ScreenSetDefinition, 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'> {
  if (set.aspectRatio && set.orientation && typeof set.referenceWidth === 'number' && typeof set.referenceHeight === 'number') {
    return normalizeCarrierOrientation(set);
  }
  return applyScreenFormatPreset(set, set.screenFormatPreset ?? getDefaultScreenFormatPreset(set.devicePreset));
}

export function ensureScreenFormatForScreen<T extends Pick<ScreenDefinition, 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'>>(
  screen: T,
  set?: Pick<ScreenSetDefinition, 'devicePreset' | 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'> | null
): T & Pick<ScreenDefinition, 'screenFormatPreset' | 'aspectRatio' | 'orientation' | 'referenceWidth' | 'referenceHeight'> {
  if (screen.aspectRatio && screen.orientation && typeof screen.referenceWidth === 'number' && typeof screen.referenceHeight === 'number') {
    return normalizeCarrierOrientation(screen);
  }
  if (set) {
    const normalizedSet = ensureScreenSetFormat(set);
    return normalizeCarrierOrientation({
      ...screen,
      screenFormatPreset: normalizedSet.screenFormatPreset,
      aspectRatio: normalizedSet.aspectRatio,
      orientation: normalizedSet.orientation,
      referenceWidth: normalizedSet.referenceWidth,
      referenceHeight: normalizedSet.referenceHeight
    });
  }
  return applyScreenFormatPresetToScreen(screen, 'desktop_full_hd');
}

export function screenOrientationLabel(orientation?: ScreenOrientation | null): string {
  return orientation === 'portrait' ? 'Portrait' : 'Paysage';
}

export function screenFormatSummary(target: ScreenFormatCarrier): string {
  const fallback = applyFormatCarrier({}, target.screenFormatPreset ?? 'desktop_full_hd');
  const aspectRatio = target.aspectRatio || fallback.aspectRatio || '16:9';
  const orientation = target.orientation || fallback.orientation || 'landscape';
  const referenceWidth = typeof target.referenceWidth === 'number' ? target.referenceWidth : fallback.referenceWidth || 1920;
  const referenceHeight = typeof target.referenceHeight === 'number' ? target.referenceHeight : fallback.referenceHeight || 1080;
  return `${aspectRatio} · ${screenOrientationLabel(orientation)} · ${referenceWidth}x${referenceHeight}`;
}
