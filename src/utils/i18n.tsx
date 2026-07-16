import type { ReactNode } from 'react';

export type TextMode = 'bilingual' | 'zh' | 'en';

export function formatText(zh: string, en: string, mode: TextMode): string {
  if (mode === 'zh') return zh;
  if (mode === 'en') return en;
  return `${zh} · ${en}`;
}

export function nextTextMode(mode: TextMode): TextMode {
  if (mode === 'bilingual') return 'zh';
  if (mode === 'zh') return 'en';
  return 'bilingual';
}

export function textModeShortLabel(mode: TextMode): string {
  if (mode === 'zh') return '中';
  if (mode === 'en') return 'EN';
  return '中/EN';
}

export function textModeLabel(mode: TextMode): string {
  if (mode === 'zh') return '只显示中文 · Chinese only';
  if (mode === 'en') return 'English only · 只显示英文';
  return '双语显示 · Bilingual';
}

export function I18nText({ zh, en, mode }: { zh: string; en: string; mode: TextMode }): ReactNode {
  if (mode === 'zh') return zh;
  if (mode === 'en') return en;
  return (
    <span className="i18n-pair">
      <span className="i18n-zh">{zh}</span>
      <span className="i18n-separator" aria-hidden="true"> · </span>
      <span className="i18n-en">{en}</span>
    </span>
  );
}

function splitFormattedText(text: string): { zh: string; en: string } | null {
  const parts = text.split(' · ').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const englishIndex = parts.findIndex((part, index) => index > 0 && /[A-Za-z]/.test(part));
  if (englishIndex <= 0) return null;
  return {
    zh: parts.slice(0, englishIndex).join(' · '),
    en: parts.slice(englishIndex).join(' · ')
  };
}

export function I18nAutoText({ text, mode }: { text: string; mode: TextMode }): ReactNode {
  if (mode !== 'bilingual') return text;
  const split = splitFormattedText(text);
  if (!split) return text;
  return <I18nText zh={split.zh} en={split.en} mode={mode} />;
}

export function localizedNameForMode(
  item: { name: string; nameZh?: string; nameEn?: string } | undefined,
  mode: TextMode
): string {
  if (!item) return '';
  const zh = item.nameZh?.trim() || item.name;
  const en = item.nameEn?.trim() || item.name;
  return formatText(zh, en, mode);
}

export function localizedNameNodeForMode(
  item: { name: string; nameZh?: string; nameEn?: string } | undefined,
  mode: TextMode
): ReactNode {
  if (!item) return '';
  const zh = item.nameZh?.trim() || item.name;
  const en = item.nameEn?.trim() || item.name;
  return <I18nText zh={zh} en={en} mode={mode} />;
}

export function singleNameForMode(
  item: { name: string; nameZh?: string; nameEn?: string } | undefined,
  mode: TextMode
): string {
  if (!item) return '';
  const primary = item.nameZh?.trim() || item.name;
  if (mode === 'en') return item.nameEn?.trim() || primary;
  return primary;
}

export function singleNameNodeForMode(
  item: { name: string; nameZh?: string; nameEn?: string } | undefined,
  mode: TextMode
): ReactNode {
  return singleNameForMode(item, mode);
}
