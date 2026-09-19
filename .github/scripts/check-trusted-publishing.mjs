// Refuses the release before `npx semantic-release` if this tree cannot authenticate.
//
// This repository holds no npm token: publishing is authorized by a short-lived
// OIDC token (see RELEASING.md). Two things have to be true for that to work, and
// BOTH of them live in package-lock.json rather than in any workflow file, so a
// routine lockfile regeneration can break either one without touching release.yml.
//
//   1. semantic-release resolves plugin names from its OWN directory first, so the
//      @semantic-release/npm that executes is whichever copy sits inside its
//      dependency tree — not one hoisted to the project root. Only v13+ establishes
//      the OIDC context. v12 goes straight to NPM_TOKEN, which this job does not
//      have, and fails at verifyConditions.
//   2. That plugin publishes by shelling out to `npm publish` through execa with
//      `preferLocal: true`, which prepends node_modules/.bin to PATH. So the binary
//      that authenticates is the lockfile's npm, not the runner's Node-bundled one,
//      and only npm >= 11.5.1 can publish over OIDC.
//
// Either failure would otherwise surface as an authentication error at the registry,
// pointing at credentials rather than at the dependency tree that caused it.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MIN_NPM = '11.5.1';
const PLUGINS_DIR = join(process.cwd(), 'node_modules/semantic-release/lib/plugins/');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

// npm and plugin versions are plain x.y.z. Anything else is not something to guess
// about: refuse rather than compare wrongly and report a pass.
function atLeast(actual, minimum) {
  const parse = (v) => {
    const parts = String(v).trim().split('.');
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    return parts.map(Number);
  };
  const a = parse(actual);
  const m = parse(minimum);
  if (!a || !m) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== m[i]) return a[i] > m[i];
  }
  return true;
}

// 1. The plugin semantic-release will actually load.
let pluginDir;
try {
  pluginDir = dirname(createRequire(PLUGINS_DIR).resolve('@semantic-release/npm'));
} catch (error) {
  fail(`could not resolve @semantic-release/npm the way semantic-release does, from ${PLUGINS_DIR} — ${error.message}`);
}

const pluginVersion = JSON.parse(
  execFileSync(process.execPath, ['-p', `JSON.stringify(require(${JSON.stringify(join(pluginDir, 'package.json'))}))`], {
    encoding: 'utf8',
  }),
).version;

const where = pluginDir.replace(`${process.cwd()}/`, '');

if (!existsSync(join(pluginDir, 'lib/trusted-publishing'))) {
  fail(
    `semantic-release loads @semantic-release/npm ${pluginVersion} from ${where}, which has no trusted-publishing support. ` +
      `This job holds no npm token, so the release would fail at verifyConditions with ENONPMTOKEN. ` +
      `Raise the semantic-release dependency until its own tree carries v13 or later — pinning @semantic-release/npm at the project root does NOT fix this, because that copy is not the one loaded.`,
  );
}
console.log(`@semantic-release/npm ${pluginVersion} from ${where} — trusted publishing supported.`);

// 2. The npm binary that plugin will shell out to.
const npmBin = join(process.cwd(), 'node_modules/.bin/npm');
if (!existsSync(npmBin)) {
  fail(`${npmBin} is missing, so the npm that publishes cannot be checked. It comes from package-lock.json; run npm ci first.`);
}

const npmVersion = execFileSync(npmBin, ['--version'], { encoding: 'utf8' }).trim();
const ok = atLeast(npmVersion, MIN_NPM);
if (ok === null) {
  fail(`could not read a version from node_modules/.bin/npm (got "${npmVersion}"), so trusted publishing support is unknown.`);
}
if (!ok) {
  fail(
    `node_modules/.bin/npm is ${npmVersion}, which predates trusted publishing; npm >= ${MIN_NPM} is required. ` +
      `This is the npm that publishes, because the plugin shells out with execa preferLocal — the runner's own npm is shadowed, so raising node-version will not change it. It comes from package-lock.json.`,
  );
}
console.log(`node_modules/.bin/npm ${npmVersion} — publishes over OIDC (>= ${MIN_NPM}).`);
