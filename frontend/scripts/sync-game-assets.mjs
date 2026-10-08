// 把執行遊戲需要的靜態檔複製到 public/（這些複本不進版控）：
//   scratch-games/<bundleDir>/<bundle>           → public/games/<slug>/project.sb3（bundleDir 預設 original）
//   scratch-games/integrations/<slug>/adapter.json → public/games/<slug>/adapter.json
//   node_modules/@turbowarp/scaffolding/dist     → public/player/scaffolding/
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const games = join(frontend, '..', 'scratch-games');
const pub = join(frontend, 'public');

const scaffolding = join(frontend, 'node_modules', '@turbowarp', 'scaffolding', 'dist');
mkdirSync(join(pub, 'player', 'scaffolding'), { recursive: true });
cpSync(join(scaffolding, 'scaffolding-min.js'), join(pub, 'player', 'scaffolding', 'scaffolding-min.js'));

const integrations = join(games, 'integrations');
for (const slug of readdirSync(integrations)) {
  const adapterPath = join(integrations, slug, 'adapter.json');
  if (!statSync(join(integrations, slug)).isDirectory() || !existsSync(adapterPath)) continue;
  const adapter = JSON.parse(readFileSync(adapterPath, 'utf8'));
  const bundle = join(games, adapter.bundleDir ?? 'original', adapter.bundle);
  if (!existsSync(bundle)) throw new Error(`找不到 ${bundle}（adapter: ${slug}）`);
  const out = join(pub, 'games', slug);
  mkdirSync(out, { recursive: true });
  cpSync(adapterPath, join(out, 'adapter.json'));
  cpSync(bundle, join(out, 'project.sb3'));
  console.log(`synced game: ${slug}`);
}
