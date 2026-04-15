#!/usr/bin/env node
import path from 'path';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { buildSystemDraft, writeJsonOutput } from './common.mjs';

function usage() {
  process.stderr.write('Usage: node scripts/system-tools/pdf-to-system-json.mjs <input.pdf> [output.json]\n');
}

function normalizeLine(line) {
  return String(line ?? '').replace(/\s+/g, ' ').trim();
}

function classifyLine(line, index) {
  const trimmed = normalizeLine(line);
  if (!trimmed) {
    return null;
  }

  if (/^\[[ xX]\]\s+/.test(trimmed)) {
    const label = trimmed.replace(/^\[[ xX]\]\s+/, '');
    return {
      type: 'checkbox',
      label,
      key: label
    };
  }

  if (/:$/.test(trimmed)) {
    const label = trimmed.replace(/:$/, '').trim();
    return {
      type: 'text',
      label,
      key: label
    };
  }

  if (/[_]{3,}/.test(trimmed) || /[.]{4,}/.test(trimmed)) {
    const label = trimmed.split(/[_]{3,}|[.]{4,}/)[0].replace(/:$/, '').trim() || `champ_${index + 1}`;
    return {
      type: 'text',
      label,
      key: label
    };
  }

  if (/^[A-Z0-9 \-]{4,}$/.test(trimmed)) {
    return {
      type: 'static_text',
      label: trimmed,
      key: trimmed,
      content: trimmed,
      h: 2
    };
  }

  return {
    type: 'static_text',
    label: `texte_${index + 1}`,
    key: `texte_${index + 1}`,
    content: trimmed,
    h: 2
  };
}

function resolvePdfToTextBinary() {
  const envCandidate = typeof process.env.PDFTOTEXT_BIN === 'string' ? process.env.PDFTOTEXT_BIN.trim() : '';
  const candidates = [envCandidate, 'pdftotext', '/usr/bin/pdftotext', '/usr/local/bin/pdftotext'].filter(Boolean);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const probeCommand = candidate.includes(path.sep) ? candidate : 'sh';
      const probeArgs = candidate.includes(path.sep)
        ? ['-v']
        : ['-lc', `command -v ${candidate} >/dev/null 2>&1`];
      execFileSync(probeCommand, probeArgs, {
        stdio: ['ignore', 'ignore', 'ignore']
      });
      if (!candidate.includes(path.sep) || existsSync(candidate)) {
        return candidate;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const suffix =
    lastError && typeof lastError === 'object' && 'code' in lastError && lastError.code
      ? ` (${String(lastError.code)})`
      : '';
  throw new Error(
    `pdftotext est introuvable ou non executable${suffix}. Installe poppler-utils ou renseigne PDFTOTEXT_BIN avec le chemin du binaire.`
  );
}

function extractPdfTextWithPdftotext(pdfPath) {
  const binary = resolvePdfToTextBinary();
  try {
    return execFileSync(binary, ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && error.code ? String(error.code) : '';
    if (code === 'EACCES') {
      throw new Error(
        `Le binaire pdftotext n est pas executable (${binary}). Verifie ses permissions ou renseigne PDFTOTEXT_BIN avec un binaire accessible.`
      );
    }
    if (code === 'ENOENT') {
      throw new Error(
        `Le binaire pdftotext est introuvable (${binary}). Installe poppler-utils ou renseigne PDFTOTEXT_BIN.`
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Impossible d extraire le texte du PDF avec pdftotext: ${detail}`);
  }
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath) {
  usage();
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), inputPath);
const fallbackTitle = path.basename(absolutePath, path.extname(absolutePath));

let extractedText = '';
try {
  extractedText = extractPdfTextWithPdftotext(absolutePath);
} catch (error) {
  process.stderr.write(`Impossible d'extraire le texte du PDF avec pdftotext: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const lines = extractedText
  .split(/\r?\n/)
  .map((line) => line.replace(/\s+$/g, ''))
  .filter((line) => line.trim().length > 0);

const title = normalizeLine(lines[0]) || fallbackTitle;
const elements = lines
  .map((line, index) => classifyLine(line, index))
  .filter(Boolean);
const warnings = [];

if (elements.length === 0) {
  warnings.push('Aucun contenu exploitable n a ete extrait du PDF.');
}

const payload = buildSystemDraft({
  sourceType: 'pdf',
  sourcePath: absolutePath,
  title,
  elements,
  warnings
});

writeJsonOutput(payload, outputPath);
