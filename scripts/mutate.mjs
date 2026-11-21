// Makes the two breaks described in the README and runs both test suites against each of them.
// Every run works on its own copy of the project in the system temp directory; the repo is never modified.
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const { version: vitestVersion } = JSON.parse(
  readFileSync(join(root, 'node_modules', 'vitest', 'package.json'), 'utf8'),
);

const runs = [
  { id: '0', title: 'Unmodified code', change: 'none' },
  {
    id: 'A',
    title: 'toClientView no longer returns phone',
    change: '`toClientView` without `phone`',
    file: 'src/clientView.js',
    line: /^[ \t]*phone: client\.phone,\r?\n/m,
  },
  {
    id: 'B',
    title: 'saveClient no longer saves name',
    change: '`saveClient` without `name`',
    file: 'src/saveClient.js',
    line: /^[ \t]*name: client\.name,\r?\n/m,
  },
];

const suites = [
  { label: 'original tests', heading: 'Original tests', file: 'test/old.test.js', catchesBugs: false },
  { label: 'new tests', heading: 'New tests', file: 'test/new.test.js', catchesBugs: true },
];

const expectedVerdict = (run, suite) => (run.file && suite.catchesBugs ? 'fail' : 'pass');

function prepareCopy(run) {
  const dir = mkdtempSync(join(tmpdir(), `mutation-${run.id}-`));
  for (const entry of ['package.json', 'src', 'test']) {
    cpSync(join(root, entry), join(dir, entry), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
  if (!run.file) return { dir, removed: null };

  const path = join(dir, run.file);
  const source = readFileSync(path, 'utf8');
  const matches = source.match(new RegExp(run.line, 'gm')) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Mutation ${run.id}: expected one matching line in ${run.file}, found ${matches.length}`);
  }
  writeFileSync(path, source.replace(run.line, ''));
  return { dir, removed: matches[0].replace(/\r?\n$/, '') };
}

function runSuite(dir, suite) {
  const reportPath = join(dir, `${basename(suite.file)}.json`);
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  const result = spawnSync(
    process.execPath,
    [vitest, 'run', suite.file, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`],
    { cwd: dir, env, encoding: 'utf8', timeout: 120_000 },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .split('\n')
    .filter((line) => !line.startsWith('JSON report written to'))
    .join('\n')
    .trim();

  let report = null;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    // No report means vitest stopped before running the tests; that counts as a crash below.
  }
  const total = report?.numTotalTests ?? 0;
  const passed = report?.numPassedTests ?? 0;
  const failed = report?.numFailedTests ?? 0;

  let verdict = 'crash';
  if (result.status === 0 && total > 0 && passed === total) verdict = 'pass';
  else if (result.status === 1 && failed > 0) verdict = 'fail';
  return { output, total, passed, failed, verdict, exit: result.status ?? result.signal };
}

// Failed tests in vitest's default output, each with the -/+ lines of its expected/received diff.
function failures(output) {
  const found = [];
  for (const line of output.split('\n')) {
    const header = line.match(/^ FAIL {2}\S+ > (.+)$/);
    if (header) found.push({ name: header[1], diff: [] });
    else if (found.length > 0 && /^[-+] {2,}\S/.test(line)) found.at(-1).diff.push(line);
  }
  return found;
}

function summary(r) {
  if (r.verdict === 'pass') return `${r.passed}/${r.total} pass`;
  if (r.verdict === 'fail') return `${r.failed}/${r.total} fail`;
  return `exit ${r.exit}, ${r.failed}/${r.total} fail`;
}

console.log(styleText('bold', 'Mutation check: the unmodified code and two mutations, both suites on each'));

const results = [];
for (const run of runs) {
  const { dir, removed } = prepareCopy(run);
  console.log(`\n${styleText('bold', `[${run.id}] ${run.title}`)}`);
  if (removed) console.log(styleText('dim', `    removed from ${run.file}: ${removed.trim()}`));

  const suiteResults = suites.map((suite) => ({ suite, ...runSuite(dir, suite) }));
  const matches = suiteResults.every((r) => r.verdict === expectedVerdict(run, r.suite));
  results.push({ run, removed, suiteResults, matches });

  for (const r of suiteResults) {
    const status = r.verdict === 'pass' ? styleText('green', 'PASS') : styleText('red', r.verdict.toUpperCase());
    let note = '';
    if (run.file && r.verdict === expectedVerdict(run, r.suite)) {
      note = styleText('dim', r.verdict === 'pass' ? '   <- the bug goes unnoticed' : '   <- caught');
    }
    console.log(`    ${r.suite.label.padEnd(15)} ${status}  ${summary(r)}${note}`);
    for (const failure of failures(r.output)) {
      console.log(styleText('red', `      × ${failure.name}`));
      for (const line of failure.diff) console.log(styleText('red', `          ${line}`));
    }
  }
  if (!matches) console.log(styleText('red', `    Unexpected result (copy: ${dir})`));
}

const md = [
  '# Mutation check',
  '',
  '| Run | Change | Original tests | New tests | Expected | Matches |',
  '|---|---|---|---|---|---|',
  ...results.map(({ run, suiteResults, matches }) => {
    const [original, rewritten] = suiteResults.map(summary);
    const expected = run.file ? 'original pass, new fail' : 'both pass';
    return `| ${run.id} | ${run.change} | ${original} | ${rewritten} | ${expected} | ${matches ? 'yes' : 'NO'} |`;
  }),
  '',
  'Each run copies `package.json`, `src/` and `test/` to a temporary directory, and a mutation removes one line from the copy. The full vitest output of every suite follows.',
];
for (const { run, removed, suiteResults } of results) {
  md.push('', `## ${run.id}. ${run.title}`, '');
  if (removed) md.push(`Mutation in \`${run.file}\`:`, '', '```diff', `-${removed}`, '```', '');
  for (const r of suiteResults) {
    md.push(`### ${r.suite.heading} (\`${r.suite.file}\`)`, '', '```text', r.output, '```', '');
  }
}
md.push(`Generated by \`npm run mutate\` with vitest ${vitestVersion} on Node ${process.version}.`, '');
writeFileSync(join(root, 'MUTATION.md'), md.join('\n'));

if (results.every((r) => r.matches)) {
  console.log(`\n${styleText(['bold', 'green'], 'On both mutations the original tests pass and the new tests fail. Full output: MUTATION.md')}`);
} else {
  console.log(`\n${styleText(['bold', 'red'], 'Unexpected result, see MUTATION.md')}`);
  process.exitCode = 1;
}
