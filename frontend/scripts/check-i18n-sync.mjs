#!/usr/bin/env node

/**
 * i18n Key Sync & Interpolation Checker
 *
 * 1. Compares en.json and zh.json to ensure all keys exist in both files.
 * 2. Verifies interpolation parameters ({{param}}) match across locales.
 *
 * Exit code 1 if mismatches are found (useful for CI).
 *
 * Usage:
 *   node scripts/check-i18n-sync.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', 'src', 'i18n', 'locales');

function getDeepEntries(obj, prefix = '') {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      entries.push(...getDeepEntries(value, fullKey));
    } else if (typeof value === 'string') {
      entries.push([fullKey, value]);
    }
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

function extractInterpolationParams(value) {
  const regex = /\{\{(\w+)\}\}/g;
  const params = new Set();
  let match;
  while ((match = regex.exec(value)) !== null) {
    params.add(match[1]);
  }
  return params;
}

try {
  const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
  const zh = JSON.parse(readFileSync(join(localesDir, 'zh.json'), 'utf-8'));

  const enEntries = getDeepEntries(en);
  const zhEntries = getDeepEntries(zh);

  const enKeys = new Set(enEntries.map(([k]) => k));
  const zhKeys = new Set(zhEntries.map(([k]) => k));

  let hasError = false;

  // --- Check 1: Key existence ---
  const onlyInEn = [...enKeys].filter((k) => !zhKeys.has(k));
  const onlyInZh = [...zhKeys].filter((k) => !enKeys.has(k));

  if (onlyInEn.length > 0 || onlyInZh.length > 0) {
    hasError = true;
    console.error('i18n key mismatch detected!');
    if (onlyInEn.length > 0) {
      console.error(`\n  Only in en.json (${onlyInEn.length}):`);
      onlyInEn.forEach((k) => console.error(`    + ${k}`));
    }
    if (onlyInZh.length > 0) {
      console.error(`\n  Only in zh.json (${onlyInZh.length}):`);
      onlyInZh.forEach((k) => console.error(`    + ${k}`));
    }
  }

  // --- Check 2: Interpolation parameter consistency ---
  const enMap = new Map(enEntries);
  const zhMap = new Map(zhEntries);
  const paramMismatches = [];

  for (const [key, enValue] of enEntries) {
    const zhValue = zhMap.get(key);
    if (zhValue === undefined) continue;

    const enParams = extractInterpolationParams(enValue);
    const zhParams = extractInterpolationParams(zhValue);

    if (enParams.size !== zhParams.size || ![...enParams].every((p) => zhParams.has(p))) {
      paramMismatches.push({
        key,
        enParams: [...enParams].sort(),
        zhParams: [...zhParams].sort(),
      });
    }
  }

  if (paramMismatches.length > 0) {
    hasError = true;
    console.error('\nInterpolation parameter mismatch detected!');
    for (const { key, enParams, zhParams } of paramMismatches) {
      console.error(`  ${key}:`);
      const fmt = (params) => params.length ? params.map(p => `{{${p}}}`).join(', ') : '(none)';
      console.error(`    en: ${fmt(enParams)}`);
      console.error(`    zh: ${fmt(zhParams)}`);
    }
  }

  if (!hasError) {
    console.log(`i18n sync check passed. ${enKeys.size} keys in sync, interpolation params verified.`);
    process.exit(0);
  }

  process.exit(1);
} catch (err) {
  console.error('Failed to check i18n sync:', err.message);
  process.exit(1);
}
