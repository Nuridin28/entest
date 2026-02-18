#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '../public/locales');
const languages = ['en', 'ru', 'kz'];

console.log('🔍 Проверка консистентности переводов...\n');

const translations = {};
for (const lang of languages) {
  const filePath = path.join(localesDir, lang, 'translation.json');
  try {
    translations[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`❌ Ошибка чтения файла ${lang}: ${error.message}`);
    process.exit(1);
  }
}

const allKeys = new Set();
for (const lang of languages) {
  Object.keys(translations[lang]).forEach(key => allKeys.add(key));
}

console.log('📊 Статистика переводов:');
for (const lang of languages) {
  const keysCount = Object.keys(translations[lang]).length;
  const percentage = ((keysCount / allKeys.size) * 100).toFixed(1);
  console.log(`  ${lang.toUpperCase()}: ${keysCount}/${allKeys.size} ключей (${percentage}%)`);
}

console.log('\n🔍 Недостающие ключи:');
let hasIssues = false;
for (const lang of languages) {
  const missingKeys = [];
  for (const key of allKeys) {
    if (!(key in translations[lang])) {
      missingKeys.push(key);
    }
  }
  if (missingKeys.length > 0) {
    hasIssues = true;
    console.log(`\n❌ ${lang.toUpperCase()} (отсутствует ${missingKeys.length} ключей):`);
    missingKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`));
    if (missingKeys.length > 10) {
      console.log(`  ... и еще ${missingKeys.length - 10} ключей`);
    }
  } else {
    console.log(`\n✅ ${lang.toUpperCase()}: все ключи присутствуют`);
  }
}

console.log('\n🔍 Пустые значения:');
for (const lang of languages) {
  const emptyKeys = [];
  for (const [key, value] of Object.entries(translations[lang])) {
    if (!value || value.trim() === '') {
      emptyKeys.push(key);
    }
  }
  if (emptyKeys.length > 0) {
    hasIssues = true;
    console.log(`\n⚠️  ${lang.toUpperCase()}: ${emptyKeys.length} пустых значений`);
    emptyKeys.forEach(key => console.log(`  - ${key}`));
  }
}

console.log('\n🔍 Проверка интерполяций:');
const interpolationRegex = /\{\{([^}]+)\}\}/g;
for (const key of allKeys) {
  const interpolations = {};
  let hasInterpolationIssue = false;
  for (const lang of languages) {
    if (key in translations[lang]) {
      const matches = [...translations[lang][key].matchAll(interpolationRegex)];
      interpolations[lang] = matches.map(match => match[1]).sort();
    } else {
      interpolations[lang] = [];
    }
  }
  const firstLang = languages.find(lang => interpolations[lang].length > 0);
  if (firstLang) {
    for (const lang of languages) {
      if (lang !== firstLang && key in translations[lang]) {
        if (JSON.stringify(interpolations[lang]) !== JSON.stringify(interpolations[firstLang])) {
          if (!hasInterpolationIssue) {
            hasIssues = true;
            hasInterpolationIssue = true;
            console.log(`\n⚠️  Несоответствие интерполяций для ключа "${key}":`);
          }
          console.log(`  ${lang.toUpperCase()}: [${interpolations[lang].join(', ')}]`);
          console.log(`  ${firstLang.toUpperCase()}: [${interpolations[firstLang].join(', ')}]`);
        }
      }
    }
  }
}

console.log('\n' + '='.repeat(50));
if (hasIssues) {
  console.log('❌ Найдены проблемы с переводами. Требуется исправление.');
  process.exit(1);
} else {
  console.log('✅ Все переводы в порядке!');
  process.exit(0);
}
