// Scratch 遊戲播放器 + JavaScript Bridge。
//
// 這個頁面以 TurboWarp scaffolding 自行載入 .sb3，所以拿得到 Scratch VM 本體，
// 可以在「不修改原專案」的前提下觀察遊戲狀態，再用 postMessage 回報給外層的 React。
// （scratch.mit.edu 的官方嵌入 iframe 是跨來源的，外層頁面讀不到任何遊戲內部資料。）
import { isTouchDevice, setupTouchControls } from './touch.js';
import { createTracker } from './tracker.js';

const SOURCE = 'nihongo-quest-game';
const PROTOCOL_VERSION = 1;

const params = new URLSearchParams(location.search);
const slug = params.get('game') || '';
// 只把訊息送給指定的外層來源；預設是同源部署
const hostOrigin = document.documentElement.dataset.hostOrigin || location.origin;

const overlay = document.getElementById('overlay');
const statusText = document.getElementById('status');
const startButton = document.getElementById('start');

function post(type, payload = {}) {
  if (window.parent === window) return; // 沒有外層頁面（單獨開啟播放器）
  window.parent.postMessage({ source: SOURCE, version: PROTOCOL_VERSION, game: slug, type, payload }, hostOrigin);
}

function fail(message) {
  statusText.textContent = `載入失敗：${message}`;
  overlay.hidden = false;
  startButton.hidden = true;
  post('GAME_ERROR', { message });
}

async function fetchOk(url, what) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${what}（HTTP ${response.status}）`);
  return response;
}

/** 邊下載邊更新進度（遊戲檔有十幾 MB）。伺服器沒給大小或瀏覽器不支援串流時，就照一般方式整個讀完。 */
async function download(response) {
  const total = Number(response.headers.get('Content-Length'));
  if (!response.body || !total) return response.arrayBuffer();
  const reader = response.body.getReader();
  const data = new Uint8Array(total);
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length > total) return new Blob([data.subarray(0, received), value]).arrayBuffer(); // 大小和標頭不符
    data.set(value, received);
    received += value.length;
    statusText.textContent = `下載遊戲資料中… ${Math.round((received / total) * 100)}%`;
  }
  return data.buffer;
}

/** 在 VM 上掛鉤，把背景切換與廣播交給 tracker。 */
function observe(vm, adapter) {
  const runtime = vm.runtime;
  const stage = () => runtime.getTargetForStage();
  let lastClicked = null;

  const read = {
    questionNumber() {
      const list = stage().lookupVariableByNameAndType(adapter.questionList, 'list');
      const n = list ? Number(list.value[0]) : NaN;
      return Number.isInteger(n) ? n : null;
    },
    // 發出廣播的角色＝玩家點的選項；取不到執行緒時退回「最後被點擊的角色」
    sender() {
      const thread = runtime.sequencer && runtime.sequencer.activeThread;
      const target = thread && thread.target;
      const name = target && !target.isStage ? target.getName() : null;
      return name || lastClicked;
    },
    variable(name) {
      const variable = stage().lookupVariableByNameAndType(name, '');
      const n = variable ? Number(variable.value) : NaN;
      return Number.isFinite(n) ? Math.round(n) : null;
    },
  };
  const tracker = createTracker(adapter, post, read);

  // Scratch VM 沒有「收到廣播」的公開事件；所有帽子積木都由 runtime.startHats 啟動，
  // 因此包住它來得知廣播。只讀取、不改變原本的行為。
  const startHats = runtime.startHats.bind(runtime);
  runtime.startHats = (opcode, fields, target) => {
    try {
      if (opcode === 'event_whenbroadcastreceived' && fields) {
        tracker.onBroadcast(String(fields.BROADCAST_OPTION));
      } else if (opcode === 'event_whenthisspriteclicked' && target && !target.isStage) {
        lastClicked = target.getName();
      }
    } catch (error) {
      post('GAME_ERROR', { message: `bridge: ${error.message}` });
    }
    return startHats(opcode, fields, target);
  };

  // 背景切換以每個影格輪詢舞台目前的造型名稱來偵測，不依賴內部實作
  runtime.on('AFTER_EXECUTE', () => {
    const target = stage();
    if (target) tracker.onBackdrop(target.getCostumes()[target.currentCostume].name);
  });
}

async function main() {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('缺少或不合法的 game 參數');
  if (!window.Scaffolding) throw new Error('找不到 Scratch 執行環境');

  const base = `/games/${slug}`;
  const adapter = await (await fetchOk(`${base}/adapter.json`, '讀不到遊戲設定')).json();

  const scaffolding = new window.Scaffolding.Scaffolding();
  scaffolding.width = adapter.stage.width;
  scaffolding.height = adapter.stage.height;
  scaffolding.resizeMode = 'preserve-ratio';
  scaffolding.setup();
  scaffolding.appendTo(document.getElementById('project'));

  statusText.textContent = '下載遊戲資料中…';
  const project = await download(await fetchOk(`${base}/project.sb3`, '讀不到遊戲檔'));
  statusText.textContent = '載入素材中…';
  await scaffolding.loadProject(project);

  observe(scaffolding.vm, adapter);
  if (params.has('debug')) window.__scaffolding = scaffolding; // 開發除錯用：?debug=1
  statusText.textContent = '';
  startButton.hidden = false;
  post('PLAYER_READY', {});

  // 瀏覽器要求先有使用者操作才能播放聲音，所以由按鈕啟動綠旗
  startButton.addEventListener('click', () => {
    overlay.hidden = true;
    if (isTouchDevice()) setupTouchControls(scaffolding, document.getElementById('touch'));
    scaffolding.start();
    window.focus();
  });
}

window.addEventListener('error', (event) => post('GAME_ERROR', { message: String(event.message) }));
main().catch((error) => fail(error.message));
