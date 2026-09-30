import path from 'path';
import { buildSystemDraft, decodeHtml, parseAttributes, stripTags } from './common.mjs';

function extractTitle(html, fallback) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return stripTags(titleMatch[1]) || fallback;
  }
  const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (headingMatch) {
    return stripTags(headingMatch[1]) || fallback;
  }
  return fallback;
}

function cleanText(raw, fallback = 'champ') {
  const value = stripTags(String(raw ?? '')).replace(/\s+/g, ' ').trim();
  return value || fallback;
}

function slugifyText(value, fallback = 'vue') {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return normalized || fallback;
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOpeningTag(html, tagName, startIndex = 0, attributeMatcher = null) {
  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  openPattern.lastIndex = startIndex;
  let match;
  while ((match = openPattern.exec(html)) !== null) {
    if (!attributeMatcher || attributeMatcher(match[0])) {
      return { start: match.index, end: openPattern.lastIndex, raw: match[0] };
    }
  }
  return null;
}

function extractBalancedTag(html, tagName, openStart) {
  const opening = html.slice(openStart).match(new RegExp(`^<${tagName}\\b[^>]*>`, 'i'));
  if (!opening) {
    return null;
  }
  const openRaw = opening[0];
  const contentStart = openStart + openRaw.length;
  const tokenPattern = new RegExp(`</?${tagName}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = tokenPattern.exec(html)) !== null) {
    if (match[0][1] === '/') {
      depth -= 1;
      if (depth === 0) {
        return {
          start: openStart,
          end: tokenPattern.lastIndex,
          raw: html.slice(openStart, tokenPattern.lastIndex),
          inner: html.slice(contentStart, match.index),
          openRaw
        };
      }
    } else {
      depth += 1;
    }
  }
  return null;
}

function extractBlocksByClass(html, tagName, classToken) {
  const blocks = [];
  let cursor = 0;
  while (cursor < html.length) {
    const opening = findOpeningTag(
      html,
      tagName,
      cursor,
      (raw) => new RegExp(`class=["'][^"']*${classToken}[^"']*["']`, 'i').test(raw)
    );
    if (!opening) {
      break;
    }
    const block = extractBalancedTag(html, tagName, opening.start);
    if (!block) {
      break;
    }
    blocks.push(block.inner);
    cursor = block.end;
  }
  return blocks;
}

function controlType(tag, attrs) {
  if (tag === 'textarea') {
    return 'textarea';
  }
  if (tag === 'select') {
    return 'select';
  }
  const inputType = String(attrs.type || 'text').toLowerCase();
  if (inputType === 'number') {
    return 'number';
  }
  if (inputType === 'date') {
    return 'date';
  }
  if (inputType === 'time') {
    return 'time';
  }
  if (inputType === 'checkbox') {
    return 'checkbox';
  }
  return 'text';
}

function buildControl(tag, attrs, rawValue, label, overrides = {}) {
  const type = controlType(tag, attrs);
  const control = {
    type,
    label,
    key: label,
    placeholder: String(attrs.placeholder || ''),
    ...overrides
  };

  if (type === 'checkbox') {
    control.defaultValue = Boolean(attrs.checked);
    control.checkboxLabel = overrides.checkboxLabel || label;
    return control;
  }

  if (type === 'number') {
    const numericValue = attrs.value ?? rawValue;
    control.defaultValue = numericValue === '' || numericValue === undefined ? 0 : Number(numericValue);
    if (attrs.min !== undefined) {
      control.min = Number(attrs.min);
    }
    if (attrs.max !== undefined) {
      control.max = Number(attrs.max);
    }
    if (attrs.step !== undefined) {
      control.step = Number(attrs.step);
    }
    return control;
  }

  if (type === 'select') {
    const options = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let optionMatch;
    while ((optionMatch = optionPattern.exec(rawValue || '')) !== null) {
      const optionAttrs = parseAttributes(optionMatch[1]);
      const optionValue = String(optionAttrs.value || stripTags(optionMatch[2]) || `option_${options.length + 1}`);
      const optionLabel = stripTags(optionMatch[2]) || optionValue;
      options.push(`${optionValue} => ${optionLabel}`);
    }
    control.options = options;
    control.defaultValue = String(attrs.value || '');
    return control;
  }

  control.defaultValue = String(attrs.value || rawValue || '');
  return control;
}

function sectionTitle(title, y) {
  return {
    type: 'static_text',
    label: title,
    key: title,
    content: title,
    x: 0,
    y,
    w: 24,
    h: 1
  };
}

function parseIdentitySection(sectionHtml, startY, sectionName) {
  const elements = [sectionTitle(sectionName, startY)];
  const fieldPattern = /<div\b[^>]*class="[^"]*info-field[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  let rowY = startY + 2;
  let column = 0;

  while ((match = fieldPattern.exec(sectionHtml)) !== null) {
    const blockHtml = match[0];
    const body = match[1];
    const labelMatch = body.match(/<label\b[^>]*>([\s\S]*?)<\/label>/i);
    const controlMatch = body.match(/<(input|textarea|select)\b([^>]*)>([\s\S]*?)(?:<\/\1>)?/i);
    if (!labelMatch || !controlMatch) {
      continue;
    }
    const label = cleanText(labelMatch[1]);
    const tag = controlMatch[1].toLowerCase();
    const attrs = parseAttributes(controlMatch[2]);
    const rawValue = tag === 'input' ? '' : controlMatch[3];
    const fullWidth = /info-field-full/.test(blockHtml) || tag === 'textarea';
    const width = fullWidth ? 24 : 12;
    const height = tag === 'textarea' ? 4 : 2;
    const x = fullWidth ? 0 : column * 12;

    elements.push({
      ...buildControl(tag, attrs, rawValue, label),
      x,
      y: rowY,
      w: width,
      h: height
    });

    if (fullWidth || column === 1) {
      rowY += height + 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { elements, nextY: rowY + 1 };
}

function parseCharacteristicsSection(sectionHtml, startY, sectionName) {
  const elements = [sectionTitle(sectionName, startY)];
  const headingPattern = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  const headings = [];
  let headingMatch;
  while ((headingMatch = headingPattern.exec(sectionHtml)) !== null) {
    headings.push({
      label: cleanText(headingMatch[1], 'categorie'),
      index: headingMatch.index,
      contentIndex: headingPattern.lastIndex
    });
  }

  let bottom = startY + 2;
  headings.forEach((heading, index) => {
    const nextHeading = headings[index + 1];
    const chunk = sectionHtml.slice(heading.contentIndex, nextHeading ? nextHeading.index : sectionHtml.length);
    const x = index * 8;
    let rowY = startY + 2;
    elements.push({
      type: 'static_text',
      label: heading.label,
      key: heading.label,
      content: heading.label,
      x,
      y: rowY,
      w: 8,
      h: 1
    });
    rowY += 1;

    const itemPattern = /<div\b[^>]*class="[^"]*char-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(chunk)) !== null) {
      const labelMatch = itemMatch[1].match(/<label\b[^>]*>([\s\S]*?)<\/label>/i);
      const inputMatch = itemMatch[1].match(/<input\b([^>]*)>/i);
      if (!labelMatch || !inputMatch) {
        continue;
      }
      const label = cleanText(labelMatch[1]);
      elements.push({
        ...buildControl('input', parseAttributes(inputMatch[1]), '', label),
        x,
        y: rowY,
        w: 8,
        h: 2
      });
      rowY += 2;
    }
    bottom = Math.max(bottom, rowY);
  });

  return { elements, nextY: bottom + 1 };
}

function parseResumeSection(sectionHtml, startY, sectionName) {
  const elements = [sectionTitle(sectionName, startY)];
  let rowY = startY + 2;
  let index = 0;
  const cardPattern = /<div\b[^>]*class="[^"]*resume-stat-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let cardMatch;

  while ((cardMatch = cardPattern.exec(sectionHtml)) !== null) {
    const body = cardMatch[1];
    const labelMatch = body.match(/<span\b[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const inputMatch = body.match(/<input\b([^>]*)>/i);
    if (!labelMatch || !inputMatch) {
      continue;
    }
    const label = cleanText(labelMatch[1]);
    const suffixMatch = body.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
    const attrs = parseAttributes(inputMatch[1]);
    elements.push({
      ...buildControl('input', attrs, '', label, {
        formatSuffix: suffixMatch ? cleanText(suffixMatch[1], '') : undefined
      }),
      x: (index % 3) * 8,
      y: rowY + Math.floor(index / 3) * 3,
      w: 8,
      h: 2
    });
    index += 1;
  }

  rowY += Math.max(1, Math.ceil(index / 3)) * 3;

  const diceTitleMatch = sectionHtml.match(/<h3\b[^>]*>([\s\S]*?Réserve de dés[\s\S]*?)<\/h3>/i);
  if (diceTitleMatch) {
    elements.push({
      type: 'static_text',
      label: 'reserve_de_des',
      key: 'reserve_de_des',
      content: cleanText(diceTitleMatch[1], 'Réserve de dés'),
      x: 0,
      y: rowY,
      w: 24,
      h: 1
    });
    rowY += 2;
  }

  let diceIndex = 0;
  const dicePattern = /<label\b[^>]*class="[^"]*dice-chip[^"]*"[^>]*>([\s\S]*?)<\/label>/gi;
  let diceMatch;
  while ((diceMatch = dicePattern.exec(sectionHtml)) !== null) {
    const body = diceMatch[1];
    const labelMatch = body.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
    const inputMatch = body.match(/<input\b([^>]*)>/i);
    if (!labelMatch || !inputMatch) {
      continue;
    }
    const label = cleanText(labelMatch[1], `de_${diceIndex + 1}`);
    elements.push({
      ...buildControl('input', { ...parseAttributes(inputMatch[1]), type: 'checkbox' }, '', label, { checkboxLabel: label }),
      x: (diceIndex % 4) * 6,
      y: rowY + Math.floor(diceIndex / 4) * 2,
      w: 6,
      h: 2
    });
    diceIndex += 1;
  }

  return { elements, nextY: rowY + Math.max(1, Math.ceil(diceIndex / 4)) * 2 + 1 };
}

function parseListSection(sectionHtml, startY, sectionName, itemClass, width = 8) {
  const elements = [sectionTitle(sectionName, startY)];
  const itemPattern = new RegExp(`<div\\b[^>]*class="[^"]*${itemClass}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, 'gi');
  let match;
  let index = 0;
  while ((match = itemPattern.exec(sectionHtml)) !== null) {
    const labelMatch = match[1].match(/<label\b[^>]*>([\s\S]*?)<\/label>/i);
    const inputMatch = match[1].match(/<input\b([^>]*)>/i);
    if (!labelMatch || !inputMatch) {
      continue;
    }
    const label = cleanText(labelMatch[1]);
    elements.push({
      ...buildControl('input', parseAttributes(inputMatch[1]), '', label),
      x: (index % (24 / width)) * width,
      y: startY + 2 + Math.floor(index / (24 / width)) * 2,
      w: width,
      h: 2
    });
    index += 1;
  }
  return { elements, nextY: startY + 3 + Math.max(1, Math.ceil(index / (24 / width))) * 2 };
}

function parseTalentsSection(sectionHtml, startY, sectionName) {
  const elements = [sectionTitle(sectionName, startY)];
  let index = 0;
  const blocks = extractBlocksByClass(sectionHtml, 'div', 'quality-item');

  for (const block of blocks) {
    const labelMatch =
      block.match(/<label\b[^>]*>([\s\S]*?)<\/label>/i) ||
      block.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
    if (!labelMatch) {
      continue;
    }

    const label = cleanText(labelMatch[1], `talent_${index + 1}`);
    const checkboxMatch = block.match(/<input\b([^>]*)>/i);
    const numberMatches = [...block.matchAll(/<input\b([^>]*)>/gi)].slice(1);
    const x = (index % 2) * 12;
    const y = startY + 2 + Math.floor(index / 2) * 2;

    if (checkboxMatch) {
      elements.push({
        ...buildControl('input', { ...parseAttributes(checkboxMatch[1]), type: 'checkbox' }, '', label, {
          checkboxLabel: label
        }),
        x,
        y,
        w: numberMatches.length > 0 ? 8 : 12,
        h: 2
      });

      if (numberMatches.length > 0) {
        const numberAttrs = { ...parseAttributes(numberMatches[0][1]), type: 'number' };
        elements.push({
          ...buildControl('input', numberAttrs, '', `${label} niveau`),
          x: x + 8,
          y,
          w: 4,
          h: 2
        });
      }
    } else {
      elements.push({
        type: 'static_text',
        label,
        key: label,
        content: label,
        x,
        y,
        w: 12,
        h: 1
      });
    }

    index += 1;
  }
  return { elements, nextY: startY + 3 + Math.max(1, Math.ceil(index / 2)) * 2 };
}

function parseGenericSection(sectionHtml, startY, sectionName) {
  const elements = [sectionTitle(sectionName, startY)];
  const pairPattern = /<label\b[^>]*>([\s\S]*?)<\/label>\s*<(input|textarea|select)\b([^>]*)>([\s\S]*?)(?:<\/\2>)?/gi;
  let match;
  let rowY = startY + 2;
  let column = 0;
  while ((match = pairPattern.exec(sectionHtml)) !== null) {
    const [, labelHtml, tag, rawAttrs, rawValue] = match;
    const label = cleanText(labelHtml);
    const large = tag.toLowerCase() === 'textarea';
    elements.push({
      ...buildControl(tag.toLowerCase(), parseAttributes(rawAttrs), rawValue, label),
      x: large ? 0 : column * 12,
      y: rowY,
      w: large ? 24 : 12,
      h: large ? 4 : 2
    });
    if (large || column === 1) {
      rowY += large ? 5 : 3;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { elements, nextY: rowY + 1 };
}

function inferSectionName(sectionHtml, fallbackName, hasExplicitHeading = false) {
  if (hasExplicitHeading && fallbackName && !/^Section \d+$/i.test(fallbackName)) {
    return fallbackName;
  }
  if (/info-field/.test(sectionHtml)) {
    return 'IDENTITE';
  }
  if (/characteristics-grid/.test(sectionHtml)) {
    return 'CARACTERISTIQUES';
  }
  if (/resume-compact-grid/.test(sectionHtml) || /dice-compact-grid/.test(sectionHtml)) {
    return 'VALEURS SECONDAIRES';
  }
  if (/skills-grid/.test(sectionHtml)) {
    return 'COMPETENCES';
  }
  if (/quality-grid/.test(sectionHtml)) {
    return /morosophie/i.test(sectionHtml) ? 'Morosophie' : 'Qualites & Defauts';
  }
  if (/field-group/.test(sectionHtml) && /notes/i.test(sectionHtml)) {
    return 'NOTES & HISTORIQUE';
  }
  return fallbackName;
}

function extractStructuredSections(html) {
  const sections = [];
  const sectionPattern = /<section\b[^>]*class="[^"]*steam-panel[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionPattern.exec(html)) !== null) {
    const sectionHtml = sectionMatch[1];
    const headingMatch = sectionHtml.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const sectionName = inferSectionName(
      sectionHtml,
      cleanText(headingMatch?.[1], `Section ${sections.length + 1}`),
      Boolean(headingMatch)
    );
    let result;

    if (/info-field/.test(sectionHtml)) {
      result = parseIdentitySection(sectionHtml, 0, sectionName);
    } else if (/characteristics-grid/.test(sectionHtml)) {
      result = parseCharacteristicsSection(sectionHtml, 0, sectionName);
    } else if (/resume-compact-grid/.test(sectionHtml) || /dice-compact-grid/.test(sectionHtml)) {
      result = parseResumeSection(sectionHtml, 0, sectionName);
    } else if (/skills-grid/.test(sectionHtml)) {
      result = parseListSection(sectionHtml, 0, sectionName, 'skill-item', 8);
    } else if (/quality-grid/.test(sectionHtml)) {
      result = parseTalentsSection(sectionHtml, 0, sectionName);
    } else {
      result = parseGenericSection(sectionHtml, 0, sectionName);
    }

    sections.push({
      name: sectionName,
      reference: slugifyText(sectionName, `section_${sections.length + 1}`),
      elements: result.elements
    });
  }

  return sections;
}

function extractSwitchTabs(html, { navClass, buttonClass, contentClass, switchFunction }) {
  const navBlock = extractBlocksByClass(html, 'div', navClass)[0];
  if (!navBlock) {
    return [];
  }

  const tabs = [];
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let buttonMatch;
  while ((buttonMatch = buttonPattern.exec(navBlock)) !== null) {
    const attrs = parseAttributes(buttonMatch[1]);
    const className = String(attrs.class || '');
    if (!new RegExp(`(^|\\s)${escapeRegex(buttonClass)}(\\s|$)`, 'i').test(className)) {
      continue;
    }
    const onclick = decodeHtml(String(attrs.onclick || ''));
    const onclickMatch = onclick.match(new RegExp(`${switchFunction}\\([^)]*['"]([^'"]+)['"]`, 'i'));
    if (!onclickMatch) {
      continue;
    }
    const targetId = onclickMatch[1];
    const label = cleanText(buttonMatch[2], targetId);
    const opening = findOpeningTag(
      html,
      'div',
      0,
      (raw) =>
        new RegExp(`id=["']${escapeRegex(targetId)}["']`, 'i').test(raw) &&
        new RegExp(`class=["'][^"']*${escapeRegex(contentClass)}[^"']*["']`, 'i').test(raw)
    );
    if (!opening) {
      continue;
    }
    const block = extractBalancedTag(html, 'div', opening.start);
    if (!block) {
      continue;
    }
    tabs.push({
      id: targetId,
      label,
      html: block.inner,
      isActive: /class="[^"]*active[^"]*"/i.test(opening.raw)
    });
  }

  return tabs;
}

function selectBestPrimaryTab(tabs) {
  if (tabs.length === 0) {
    return null;
  }
  return (
    tabs.find((tab) => /fiche/i.test(tab.label)) ||
    tabs.find((tab) => tab.isActive) ||
    tabs[0]
  );
}

function buildSingleViewFromSections(title, sections) {
  return {
    id: 'system_view_imported',
    name: title,
    reference: title,
    gridColumns: 24,
    isCharacterSheet: true,
    characterSheetKind: 'pc',
    elements: mergeSectionsIntoSingleView(title, sections).elements
  };
}

function buildViewFromTabContent(tab, fallbackReferencePrefix = 'tab') {
  const nestedTabs = extractSwitchTabs(tab.html, {
    navClass: 'subtabs-nav',
    buttonClass: 'subtab-btn',
    contentClass: 'subtab-content',
    switchFunction: 'switchSubTab'
  });

  if (nestedTabs.length > 0) {
    const nestedViews = nestedTabs.map((nestedTab, index) => {
      const sections = extractStructuredSections(nestedTab.html);
      const nestedViewName = `${tab.label} · ${nestedTab.label}`;
      const merged = buildSingleViewFromSections(
        nestedViewName,
        sections.length > 0 ? sections : fallbackSection(nestedViewName)
      );
      return {
        id: `system_view_${fallbackReferencePrefix}_sub_${index + 1}`,
        name: nestedViewName,
        reference: slugifyText(nestedViewName, `${fallbackReferencePrefix}_sub_${index + 1}`),
        gridColumns: 24,
        isCharacterSheet: true,
        characterSheetKind: 'pc',
        elements: merged.elements
      };
    });

    const tabsNode = {
      id: makeId('system_node_tabs'),
      type: 'tabs',
      label: `${tab.label} navigation`,
      key: `${slugifyText(tab.label, fallbackReferencePrefix)}_navigation`,
      layout: {
        x: 0,
        y: 0,
        w: 24,
        h: 28,
        minW: 1,
        minH: 1
      },
      showTitle: true,
      showBorder: true,
      tabOrientation: 'horizontal',
      tabs: nestedViews.map((view, index) => ({
        id: `${fallbackReferencePrefix}_subtab_${index + 1}`,
        label: nestedTabs[index]?.label || view.name,
        viewId: view.id
      }))
    };

    return [
      {
        id: `system_view_${fallbackReferencePrefix}`,
        name: tab.label,
        reference: slugifyText(tab.label, fallbackReferencePrefix),
        gridColumns: 24,
        isCharacterSheet: true,
        characterSheetKind: 'pc',
        nodes: [tabsNode]
      },
      ...nestedViews
    ];
  }

  const sections = extractStructuredSections(tab.html);
  const merged = buildSingleViewFromSections(tab.label, sections.length > 0 ? sections : fallbackSection(tab.label));
  return [
    {
      id: `system_view_${fallbackReferencePrefix}`,
      name: tab.label,
      reference: slugifyText(tab.label, fallbackReferencePrefix),
      gridColumns: 24,
      isCharacterSheet: true,
      characterSheetKind: 'pc',
      elements: merged.elements
    }
  ];
}

function mergeSectionsIntoSingleView(title, sections) {
  let currentY = 0;
  const elements = [];
  sections.forEach((section) => {
    const maxBottom = section.elements.reduce((max, element) => Math.max(max, (element.y ?? 0) + (element.h ?? 1)), 0);
    elements.push(
      ...section.elements.map((element) => ({
        ...element,
        y: (element.y ?? 0) + currentY
      }))
    );
    currentY += maxBottom + 2;
  });

  return {
    id: 'system_view_imported',
    name: title,
    reference: title,
    gridColumns: 24,
    isCharacterSheet: true,
    characterSheetKind: 'pc',
    elements
  };
}

function buildEnrichedViews(title, sections) {
  const sectionViews = sections.map((section, index) => ({
    id: `system_view_section_${index + 1}`,
    name: section.name,
    reference: section.reference,
    gridColumns: 24,
    isCharacterSheet: true,
    characterSheetKind: 'pc',
    elements: section.elements
  }));

  const tabsNode = {
    id: makeId('system_node_tabs'),
    type: 'tabs',
    label: 'navigation_sections',
    key: 'navigation_sections',
    layout: {
      x: 0,
      y: 0,
      w: 24,
      h: 28,
      minW: 1,
      minH: 1
    },
    showTitle: true,
    showBorder: true,
    tabOrientation: 'horizontal',
    tabs: sectionViews.map((view, index) => ({
      id: `tab_${index + 1}`,
      label: view.name,
      viewId: view.id
    }))
  };

  return [
    {
      id: 'system_view_imported',
      name: `${title} · navigation`,
      reference: `${title}_navigation`,
      gridColumns: 24,
      isCharacterSheet: true,
      characterSheetKind: 'pc',
      nodes: [tabsNode]
    },
    ...sectionViews
  ];
}

function fallbackSection(title) {
  return [
    {
      name: title,
      reference: slugifyText(title, 'import_html'),
      elements: []
    }
  ];
}

export function convertHtmlToSystemDraft({ fileName, html }) {
  const fallbackTitle = path.basename(fileName, path.extname(fileName));
  const title = extractTitle(html, fallbackTitle);
  const mainTabs = extractSwitchTabs(html, {
    navClass: 'tabs-nav',
    buttonClass: 'tab-btn',
    contentClass: 'tab-content',
    switchFunction: 'switchMainTab'
  });
  const sections = extractStructuredSections(html);
  const warnings = [];
  let view;

  if (mainTabs.length > 0) {
    const selectedTab = selectBestPrimaryTab(mainTabs);
    const selectedSections = selectedTab ? extractStructuredSections(selectedTab.html) : [];
    const resolvedSections = selectedSections.length > 0 ? selectedSections : fallbackSection(selectedTab?.label || title);
    view = buildSingleViewFromSections(title, resolvedSections);
    warnings.push(
      `Mode HTML : vue principale construite à partir de l'onglet ${selectedTab?.label || 'principal'} pour éviter les doublons entre onglets.`
    );
  } else {
    const resolvedSections = sections.length > 0 ? sections : fallbackSection(title);
    view = mergeSectionsIntoSingleView(title, resolvedSections);
  }

  if (!view.elements.some((element) => element.type !== 'static_text')) {
    warnings.push('Le HTML a ete lu, mais trop peu de champs exploitables ont ete detectes.');
  }

  return buildSystemDraft({
    sourceType: 'html',
    sourcePath: fileName,
    title,
    views: [view],
    warnings
  });
}

export function convertHtmlToEnrichedSystemDraft({ fileName, html }) {
  const fallbackTitle = path.basename(fileName, path.extname(fileName));
  const title = extractTitle(html, fallbackTitle);
  const mainTabs = extractSwitchTabs(html, {
    navClass: 'tabs-nav',
    buttonClass: 'tab-btn',
    contentClass: 'tab-content',
    switchFunction: 'switchMainTab'
  });
  const sections = extractStructuredSections(html);
  const warnings = [];
  let views;
  let resolvedSections;

  if (mainTabs.length > 0) {
    const tabViews = [];
    for (const [index, tab] of mainTabs.entries()) {
      tabViews.push(...buildViewFromTabContent(tab, `main_tab_${index + 1}`));
    }

    const rootTabsNode = {
      id: makeId('system_node_tabs'),
      type: 'tabs',
      label: 'navigation_sections',
      key: 'navigation_sections',
      layout: {
        x: 0,
        y: 0,
        w: 24,
        h: 28,
        minW: 1,
        minH: 1
      },
      showTitle: true,
      showBorder: true,
      tabOrientation: 'horizontal',
      tabs: tabViews
        .filter((view) => !/_sub_\d+$/.test(view.id))
        .map((view, index) => ({
          id: `tab_${index + 1}`,
          label: view.name,
          viewId: view.id
        }))
    };

    views = [
      {
        id: 'system_view_imported',
        name: `${title} · navigation`,
        reference: `${title}_navigation`,
        gridColumns: 24,
        isCharacterSheet: true,
        characterSheetKind: 'pc',
        nodes: [rootTabsNode]
      },
      ...tabViews
    ];

    resolvedSections = mainTabs.flatMap((tab) => extractStructuredSections(tab.html));
    warnings.push(
      'Mode HTML enrichi : détection des onglets principaux du HTML et génération d une navigation multi-vues alignée sur cette structure.'
    );
  } else {
    resolvedSections = sections.length > 0 ? sections : fallbackSection(title);
    views = buildEnrichedViews(title, resolvedSections);
  }

  warnings.push('Mode HTML enrichi : génération multi-vues avec navigation par onglets. À vérifier puis ajuster dans le Studio Système.');

  if (!resolvedSections.some((section) => section.elements.some((element) => element.type !== 'static_text'))) {
    warnings.push('Le HTML a ete lu, mais trop peu de champs exploitables ont ete detectes.');
  }

  return buildSystemDraft({
    sourceType: 'html_enriched',
    sourcePath: fileName,
    title,
    views,
    warnings
  });
}
