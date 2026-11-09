#!/usr/bin/env node
/**
 * Offline summaries of coordinator-supplied agent transcripts.
 * Actual usage and cost are copied only from fields that are present.
 * Byte lengths are proxies. bytes/4 is a token-equivalent estimate, never tokens spent.
 * Raw tool results, prompts, and reasoning are not written to the summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const TASK_TYPES = new Set(['bugfix', 'ui', 'api', 'review', 'other']);
export const ROLES = new Set(['builder', 'reviewer', 'unknown']);
const ID_SAFE = /^[A-Za-z0-9_.:-]{1,80}$/;
const OUTCOME_SAFE = /^[A-Za-z0-9 .:_-]{1,120}$/;

const USAGE_FIELDS = [
  ['inputTokens', ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens']],
  ['outputTokens', ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens']],
  ['cachedTokens', ['cached_tokens', 'cachedTokens', 'cache_read_input_tokens', 'cache_read_tokens', 'cacheReadTokens']],
  ['cacheWriteTokens', ['cache_write_tokens', 'cacheWriteTokens', 'cache_creation_input_tokens']],
  ['reasoningTokens', ['reasoning_tokens', 'reasoningTokens']],
  ['cost', ['cost', 'cost_usd', 'costUsd', 'total_cost_usd']],
];

const PROXY_NOTE = 'tokenEquivalentEstimate is toolResultBytes / 4. It is a token-equivalent estimate, not tokens spent and not a bill. transcriptBytes overlaps tool results; do not add the two byte counts.';

export function toolBucket(name) {
  const normalized = String(name ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (['search_replace', 'strreplace', 'write', 'write_file', 'apply_patch', 'editnotebook', 'delete'].includes(normalized)) return 'edit';
  if (normalized === 'read' || normalized === 'read_file' || normalized === 'readfile') return 'read';
  if (normalized.includes('grep') || normalized === 'search' || normalized === 'ripgrep') return 'search';
  if (normalized.includes('glob') || normalized.includes('codebase') || normalized.includes('semantic') || normalized === 'list_dir' || normalized === 'listdir') return 'discovery';
  if (normalized === 'shell' || normalized === 'run_terminal_cmd' || normalized === 'bash') return 'shell';
  return 'other';
}

export function classifyTestInvocation(command, { scopedPackageScripts = false } = {}) {
  const text = String(command ?? '');
  if (!/\b(vitest|jest|pnpm|npm|node)\b/.test(text) || !/\b(test|vitest|jest)\b/.test(text)) return null;
  const parts = text.split(/\s*(?:&&|\|\||;|\n)\s*/).filter(Boolean);
  const classes = parts.map((part) => classifyOneCommand(part, scopedPackageScripts)).filter(Boolean);
  if (classes.length === 0) return null;
  return classes;
}

function classifyOneCommand(part, scopedPackageScripts) {
  if (/\bnode\s+--test\b/.test(part)) {
    return /\.test\.mjs\b/.test(part) ? 'targeted' : 'broad';
  }
  if (/scripts\/targeted-test\.mjs\b/.test(part) && /\.(?:test|spec)\.[cm]?[jt]sx?\b/.test(part)) return 'targeted';
  const packageScript = /\b(?:pnpm|npm)\s+(?:run\s+)?test:(?:api|contracts|run)\b/.test(part)
    || /\b(?:pnpm|npm)\s+(?:run\s+)?test\b/.test(part);
  const file = /\.(?:test|spec)\.[cm]?[jt]sx?\b/.test(part);
  const dashSwallow = /\s--\s+\S+\.(?:test|spec)\.[cm]?[jt]sx?\b/.test(part);
  if (packageScript && dashSwallow && !scopedPackageScripts) return 'broad';
  if (packageScript && file && scopedPackageScripts && !/scripts\/targeted-test\.mjs\b/.test(part)) return 'targeted';
  if (/\bvitest(?:\.mjs)?\s+run\s+--\s+/.test(part)) return 'broad';
  if (/\bvitest(?:\.mjs)?\s+run\s+\S+\.(?:test|spec)\.[cm]?[jt]sx?\b/.test(part)) return 'targeted';
  if (/\bjest\s+\S+\.(?:test|spec)\.[cm]?[jt]sx?\b/.test(part)) return 'targeted';
  if (/\b(vitest|jest)\b/.test(part) || packageScript) return 'broad';
  return null;
}

export function isPollingCommand(command) {
  return /\bgh\s+(?:pr\s+checks|run\s+(?:watch|view|list))\b|statusCheckRollup|\bsleep\s+\d+/.test(String(command ?? ''));
}

export function isInstallCommand(command) {
  return /\b(?:pnpm|npm|yarn)\s+(?:install|ci)\b/.test(String(command ?? ''));
}

function shellCommand(record) {
  const args = record.tool_args ?? record.toolArgs ?? record.args ?? {};
  if (!args || typeof args !== 'object') return '';
  return String(args.command ?? args.cmd ?? '');
}

function readPath(record) {
  const args = record.tool_args ?? record.toolArgs ?? record.args ?? {};
  if (!args || typeof args !== 'object') return null;
  const value = args.target_file ?? args.path ?? args.file_path ?? args.filePath ?? null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toolName(record) {
  return record.tool_name ?? record.toolName ?? record.name ?? '';
}

function resultText(record) {
  if (!Object.prototype.hasOwnProperty.call(record, 'tool_result') && !Object.prototype.hasOwnProperty.call(record, 'toolResult') && !Object.prototype.hasOwnProperty.call(record, 'result')) {
    return '';
  }
  const value = record.tool_result ?? record.toolResult ?? record.result;
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? '');
}

function safeId(value) {
  return typeof value === 'string' && ID_SAFE.test(value) ? value : null;
}

function safeOutcome(value) {
  if (typeof value !== 'string' || !OUTCOME_SAFE.test(value)) return null;
  if (/sk_|bearer|password|secret|api[_-]?key/i.test(value)) return null;
  return value;
}

function timestampMs(record) {
  const raw = record.timestamp ?? record.createdAt ?? record.time ?? null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const parsed = typeof raw === 'number' ? raw : Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readUsage(record) {
  const usage = record.usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const sample = {
    id: typeof usage.id === 'string' ? usage.id : null,
    cumulative: Object.prototype.hasOwnProperty.call(usage, 'cumulative') ? usage.cumulative : undefined,
    retry: record.retry === true,
  };
  let present = false;
  for (const [key, aliases] of USAGE_FIELDS) {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(usage, alias)) {
        sample[key] = usage[alias];
        present = true;
        break;
      }
    }
  }
  if (typeof usage.currency === 'string') sample.currency = usage.currency;
  else if (typeof usage.cost_currency === 'string') sample.currency = usage.cost_currency;
  else if (['cost_usd', 'costUsd', 'total_cost_usd'].some((key) => Object.prototype.hasOwnProperty.call(usage, key))) sample.currency = 'USD';
  return present ? sample : null;
}

function sameUsageNumbers(left, right) {
  return USAGE_FIELDS.every(([key]) => left[key] === right[key]);
}

export function aggregateUsage(samples) {
  const empty = {
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    cost: null,
    currency: null,
    classification: 'absent',
    fieldClassification: {},
  };
  if (samples.length === 0) return empty;
  const deduped = [];
  const seen = new Set();
  for (const sample of samples) {
    if (sample.id && seen.has(sample.id)) continue;
    if (sample.id) seen.add(sample.id);
    const previous = deduped[deduped.length - 1];
    if (sample.retry && previous && sameUsageNumbers(sample, previous)) continue;
    deduped.push(sample);
  }
  const fieldClassification = {};
  const result = { ...empty, classification: 'present' };
  for (const [key] of USAGE_FIELDS) {
    const values = [];
    let nonNumeric = false;
    let flags = new Set();
    for (const sample of deduped) {
      if (!Object.prototype.hasOwnProperty.call(sample, key)) continue;
      const value = sample[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        nonNumeric = true;
        continue;
      }
      values.push(value);
      if (sample.cumulative === true) flags.add('cumulative');
      else if (sample.cumulative === false) flags.add('per_call');
      else flags.add('unspecified');
    }
    if (values.length === 0 || nonNumeric) {
      result[key] = null;
      fieldClassification[key] = nonNumeric ? 'non_numeric' : 'absent';
      continue;
    }
    if (values.length === 1) {
      result[key] = values[0];
      fieldClassification[key] = 'single';
      continue;
    }
    const decreasing = values.some((value, index) => index > 0 && value < values[index - 1]);
    if ((flags.has('cumulative') && flags.has('per_call')) || (flags.has('cumulative') && decreasing)) {
      result[key] = null;
      fieldClassification[key] = 'ambiguous';
      continue;
    }
    if (flags.has('cumulative')) {
      result[key] = values[values.length - 1];
      fieldClassification[key] = 'cumulative_last';
      continue;
    }
    if (flags.has('per_call') || decreasing) {
      result[key] = values.reduce((sum, value) => sum + value, 0);
      fieldClassification[key] = 'per_call_sum';
      continue;
    }
    result[key] = null;
    fieldClassification[key] = 'ambiguous';
  }
  const currencies = deduped.map((sample) => sample.currency).filter(Boolean);
  result.currency = currencies.length > 0 && currencies.every((currency) => currency === currencies[0]) ? currencies[0] : null;
  result.fieldClassification = fieldClassification;
  const classes = new Set(Object.values(fieldClassification));
  if ([...classes].every((value) => value === 'absent')) result.classification = 'absent';
  else if (classes.has('ambiguous') || classes.has('non_numeric')) result.classification = 'ambiguous';
  else result.classification = 'classified';
  return result;
}

function durationFrom(records) {
  const stamps = records.map(timestampMs).filter((value) => value != null);
  if (stamps.length < 2) return null;
  for (let i = 1; i < stamps.length; i += 1) {
    if (stamps[i] < stamps[i - 1]) return null;
  }
  return stamps[stamps.length - 1] - stamps[0];
}

export function summarizeSession(records, manifest = {}, options = {}) {
  const scopedPackageScripts = options.scopedPackageScripts === true;
  const counts = { read: 0, search: 0, discovery: 0, shell: 0, edit: 0, other: 0 };
  const readPaths = new Map();
  let repeatPathReads = 0;
  let toolResultBytes = 0;
  let broad = 0;
  let targeted = 0;
  let polling = 0;
  let installs = 0;
  let callsBeforeFirstEdit = null;
  let toolIndex = 0;
  const usageSamples = [];
  for (const record of records) {
    const isTool = record.role === 'tool' || (record.role == null && Boolean(toolName(record)));
    if (isTool) {
      const bucket = toolBucket(toolName(record));
      counts[bucket] += 1;
      toolIndex += 1;
      if (bucket === 'edit' && callsBeforeFirstEdit == null) callsBeforeFirstEdit = toolIndex - 1;
      if (bucket === 'read') {
        const target = readPath(record);
        if (target) {
          const seen = readPaths.get(target) ?? 0;
          if (seen > 0) repeatPathReads += 1;
          readPaths.set(target, seen + 1);
        }
      }
      if (bucket === 'shell') {
        const command = shellCommand(record);
        const classes = classifyTestInvocation(command, { scopedPackageScripts }) ?? [];
        for (const item of classes) {
          if (item === 'broad') broad += 1;
          if (item === 'targeted') targeted += 1;
        }
        if (isPollingCommand(command)) polling += 1;
        if (isInstallCommand(command)) installs += 1;
      }
      const text = resultText(record);
      if (text) toolResultBytes += Buffer.byteLength(text);
    }
    const usage = readUsage(record);
    if (usage) usageSamples.push(usage);
  }
  if (counts.edit === 0) callsBeforeFirstEdit = null;
  const usage = aggregateUsage(usageSamples);
  const suppliedRole = ROLES.has(manifest.role) ? manifest.role : null;
  const suppliedTask = TASK_TYPES.has(manifest.taskType) ? manifest.taskType : null;
  const limitations = [
    'Tool buckets, test class, polling, and install counts are name and command-text heuristics. A shell that writes files is not counted as the first edit. Polling includes a single status read and a sleep in a script; it is not a count of GitHub requests.',
    PROXY_NOTE,
    'Missing usage or cost stays null. It is not recorded as zero. Non-decreasing usage without an explicit cumulative flag is ambiguous and stays null so a running total is not added twice.',
    'repeatPathReads counts a later read of the same path, including a different line range. Identical content is not claimed.',
  ];
  if (manifest.role != null && suppliedRole == null) limitations.push('Supplied role was not builder, reviewer, or unknown and was dropped.');
  if (manifest.taskType != null && suppliedTask == null) limitations.push('Supplied taskType was not in bugfix, ui, api, review, or other and was dropped.');
  if (manifest.outcome != null && safeOutcome(manifest.outcome) == null) limitations.push('Supplied outcome did not match the safe label pattern and was dropped.');
  const transcriptBytes = Number.isFinite(options.transcriptBytes) ? options.transcriptBytes : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: safeId(manifest.runId),
    role: suppliedRole,
    taskType: suppliedTask,
    outcome: safeOutcome(manifest.outcome),
    commitId: safeId(manifest.commitId),
    baseCommit: safeId(manifest.baseCommit),
    messages: records.length,
    toolCalls: toolIndex,
    readCalls: counts.read,
    searchCalls: counts.search,
    discoveryCalls: counts.discovery,
    shellCalls: counts.shell,
    editCalls: counts.edit,
    otherToolCalls: counts.other,
    repeatPathReads,
    broadTestInvocations: broad,
    targetedTestInvocations: targeted,
    pollingCommandBlocks: polling,
    installCommandBlocks: installs,
    callsBeforeFirstEdit,
    durationMs: durationFrom(records),
    malformedLines: options.malformedLines ?? 0,
    proxies: {
      transcriptBytes,
      toolResultBytes,
      tokenEquivalentEstimate: toolResultBytes / 4,
      transcriptTokenEquivalentEstimate: transcriptBytes == null ? null : transcriptBytes / 4,
      note: PROXY_NOTE,
    },
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.reasoningTokens,
      cost: usage.cost,
      currency: usage.currency,
      classification: usage.classification,
      fieldClassification: usage.fieldClassification,
    },
    limitations,
  };
}

export function parseTranscript(text) {
  const records = [];
  let malformedLines = 0;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return { records: parsed.filter((item) => item && typeof item === 'object'), malformedLines: 0, manifest: {} };
      if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.events) || parsed.manifest)) {
        const events = Array.isArray(parsed.events) ? parsed.events : [];
        return {
          records: events.filter((item) => item && typeof item === 'object'),
          malformedLines: 0,
          manifest: parsed.manifest && typeof parsed.manifest === 'object' ? parsed.manifest : {},
        };
      }
      if (parsed && typeof parsed === 'object' && (parsed.role || parsed.tool_name || parsed.toolName)) {
        return { records: [parsed], malformedLines: 0, manifest: {} };
      }
    } catch {
      // A JSONL export starts with "{" and is not one JSON value.
    }
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') records.push(parsed);
      else malformedLines += 1;
    } catch {
      malformedLines += 1;
    }
  }
  return { records, malformedLines, manifest: {} };
}

export function median(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  const mid = Math.floor(numbers.length / 2);
  if (numbers.length % 2 === 1) return numbers[mid];
  return (numbers[mid - 1] + numbers[mid]) / 2;
}

export function compareToBaseline({ baseline, summary, taskType }) {
  const peers = (baseline.sessions ?? []).filter((session) => session.taskType === taskType);
  const note = 'Deltas compare this summary with the baseline median for the same supplied task type. Byte proxies and token-equivalent estimates are not tokens spent and not a bill. A lower number is not a promised saving.';
  if (peers.length < 2) {
    return { schemaVersion: SCHEMA_VERSION, taskType, peerCount: peers.length, comparable: false, note, metrics: null };
  }
  const metric = (name, pick) => {
    const baselineMedian = median(peers.map(pick));
    const current = pick(summary);
    return {
      baselineMedian,
      current: typeof current === 'number' ? current : null,
      delta: typeof current === 'number' && baselineMedian != null ? current - baselineMedian : null,
    };
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    taskType,
    peerCount: peers.length,
    comparable: true,
    note,
    metrics: {
      toolCalls: metric('toolCalls', (session) => session.toolCalls),
      toolResultBytes: metric('toolResultBytes', (session) => session.proxies?.toolResultBytes),
      tokenEquivalentEstimate: metric('tokenEquivalentEstimate', (session) => session.proxies?.tokenEquivalentEstimate),
      callsBeforeFirstEdit: metric('callsBeforeFirstEdit', (session) => session.callsBeforeFirstEdit),
      inputTokens: metric('inputTokens', (session) => session.usage?.inputTokens),
    },
  };
}

function loadManifest(filePath, embedded) {
  const sibling = filePath.replace(/\.jsonl?$/, '.manifest.json');
  let fromFile = {};
  if (sibling !== filePath && fs.existsSync(sibling)) fromFile = JSON.parse(fs.readFileSync(sibling, 'utf8'));
  return { ...embedded, ...fromFile };
}

export function summarizeFile(filePath, options = {}) {
  const text = fs.readFileSync(filePath);
  const parsed = parseTranscript(text.toString('utf8'));
  const summary = summarizeSession(parsed.records, loadManifest(filePath, parsed.manifest), {
    ...options,
    transcriptBytes: text.byteLength,
    malformedLines: parsed.malformedLines,
  });
  if (!summary.runId) summary.runId = safeId(path.basename(filePath).replace(/\.jsonl?$/, ''));
  return summary;
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function summariesToCsv(summaries) {
  const columns = [
    'runId', 'role', 'taskType', 'outcome', 'commitId', 'toolCalls', 'readCalls', 'searchCalls',
    'discoveryCalls', 'repeatPathReads', 'broadTestInvocations', 'targetedTestInvocations',
    'pollingCommandBlocks', 'installCommandBlocks', 'callsBeforeFirstEdit', 'durationMs',
    'toolResultBytes', 'tokenEquivalentEstimate', 'transcriptBytes', 'inputTokens', 'outputTokens',
    'cachedTokens', 'cacheWriteTokens', 'reasoningTokens', 'cost',
  ];
  const lines = [columns.join(',')];
  for (const summary of summaries) {
    const values = {
      runId: summary.runId,
      role: summary.role,
      taskType: summary.taskType,
      outcome: summary.outcome,
      commitId: summary.commitId,
      toolCalls: summary.toolCalls,
      readCalls: summary.readCalls,
      searchCalls: summary.searchCalls,
      discoveryCalls: summary.discoveryCalls,
      repeatPathReads: summary.repeatPathReads,
      broadTestInvocations: summary.broadTestInvocations,
      targetedTestInvocations: summary.targetedTestInvocations,
      pollingCommandBlocks: summary.pollingCommandBlocks,
      installCommandBlocks: summary.installCommandBlocks,
      callsBeforeFirstEdit: summary.callsBeforeFirstEdit,
      durationMs: summary.durationMs,
      toolResultBytes: summary.proxies.toolResultBytes,
      tokenEquivalentEstimate: summary.proxies.tokenEquivalentEstimate,
      transcriptBytes: summary.proxies.transcriptBytes,
      inputTokens: summary.usage.inputTokens,
      outputTokens: summary.usage.outputTokens,
      cachedTokens: summary.usage.cachedTokens,
      cacheWriteTokens: summary.usage.cacheWriteTokens,
      reasoningTokens: summary.usage.reasoningTokens,
      cost: summary.usage.cost,
    };
    lines.push(columns.map((column) => csvCell(values[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function collectInputs(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) {
    return fs.readdirSync(inputPath)
      .filter((name) => name.endsWith('.jsonl') || name.endsWith('.json'))
      .filter((name) => !name.endsWith('.manifest.json'))
      .sort()
      .map((name) => path.join(inputPath, name));
  }
  return [inputPath];
}

function packageScriptsScope(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return String(packageJson.scripts?.['test:api'] ?? '').includes('targeted-test.mjs');
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) options[key] = true;
      else {
        options[key] = value;
        i += 1;
      }
    }
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (command === 'summarize') {
    if (!options.input) throw new Error('summarize requires --input');
    const scopedPackageScripts = packageScriptsScope(root);
    const summaries = collectInputs(options.input).map((file) => summarizeFile(file, { scopedPackageScripts }));
    const payload = summaries.length === 1 ? summaries[0] : { schemaVersion: SCHEMA_VERSION, sessions: summaries };
    const json = JSON.stringify(payload, null, 2);
    if (options.out) {
      if (String(options.out).endsWith('.jsonl')) throw new Error('Refusing to write a JSONL transcript. Choose a .json summary path.');
      fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
      fs.writeFileSync(options.out, json);
    }
    if (options.csv) fs.writeFileSync(options.csv, summariesToCsv(summaries));
    if (!options.out) console.log(json);
    return;
  }
  if (command === 'compare') {
    if (!options.baseline || !options.summary || !options['task-type']) {
      throw new Error('compare requires --baseline, --summary, and --task-type');
    }
    const baseline = JSON.parse(fs.readFileSync(options.baseline, 'utf8'));
    const summary = JSON.parse(fs.readFileSync(options.summary, 'utf8'));
    const report = compareToBaseline({ baseline, summary, taskType: options['task-type'] });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error('Usage: node scripts/agent-efficiency.mjs summarize --input <file-or-dir> [--out file.json] [--csv file.csv] | compare --baseline <baseline.json> --summary <summary.json> --task-type <bugfix|ui|api|review|other>');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'agent-efficiency failed');
    process.exit(1);
  }
}
