#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { writeJsonOutput } from './common.mjs';
import { convertHtmlToSystemDraft } from './htmlDraftConverter.mjs';

function usage() {
  process.stderr.write('Usage: node scripts/system-tools/html-to-system-json.mjs <input.html> [output.json]\n');
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath) {
  usage();
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), inputPath);
const html = fs.readFileSync(absolutePath, 'utf8');
const payload = convertHtmlToSystemDraft({
  fileName: absolutePath,
  html
});

writeJsonOutput(payload, outputPath);
