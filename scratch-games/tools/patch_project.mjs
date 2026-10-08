// 修改《元智騎士》的 project.json，產生 v1.4。原始 .sb3 不會被動到。
//
//   node patch_project.mjs <解壓縮後的 .sb3 資料夾>
//
// 會改寫資料夾裡的 project.json，並寫入新增的素材檔。改動內容：
//   A. 題目：泡泡一直顯示到答對、同一局不重複出題。
//   B. 戰鬥：每一關的怪物種類、數量、血量、行動方式都不同（原本每關都是同樣三隻）；
//      怪物改成分身，可以同時出現多隻；過關回一點血；修掉第二章可能卡關的問題。
//   C. 第三章：新增 3-1～3-5 與最終魔王 3-X（場景由第二章的地圖換色而成）。
//   D. 演出：怪物出場／受擊／死亡特效、主角腳步揚塵與受傷閃紅、每關開頭的標題。
//   E. 移除開發用的作弊鍵 8、9。
// 沿用的名稱（adapter.json 與題庫依賴它們）：廣播「回答正確／回答錯誤／答題成功／擊倒魔王」、
// 清單「題目」、變數「戰鬥評價」、背景名稱＝關卡代號。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const dir = process.argv[2];
const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
const stage = project.targets.find((t) => t.isStage);
const sprite = (name) => {
  const target = project.targets.find((t) => t.name === name);
  if (!target) throw new Error(`找不到角色 ${name}`);
  return target;
};
const report = {};
const count = (key, n = 1) => (report[key] = (report[key] ?? 0) + n);

// =====================================================================================
// 積木產生器：用巢狀的 JS 物件描述程式，再轉成 Scratch 的積木 JSON
// =====================================================================================
let counter = 0;
const newId = () => `nq_${(counter += 1).toString(36).padStart(5, '0')}`;
const BOOLEAN = new Set([
  'operator_lt', 'operator_gt', 'operator_equals', 'operator_and', 'operator_or', 'operator_not',
  'sensing_touchingobject', 'sensing_keypressed', 'sensing_mousedown', 'data_listcontainsitem',
]);

const lookup = (table, name) => Object.entries(table).find(([, value]) => (Array.isArray(value) ? value[0] : value) === name)?.[0];
function ref(target, kind, name) {
  const id = lookup(target[kind], name) ?? lookup(stage[kind], name);
  if (!id) throw new Error(`${target.name}：找不到 ${kind}「${name}」`);
  return [name, id];
}
const gvar = (name, value = 0) => (stage.variables[newId()] = [name, value]);
const glist = (name, values = []) => (stage.lists[newId()] = [name, values]);
const lvar = (target, name, value = 0) => (target.variables[newId()] = [name, value]);
const gbroadcast = (name) => (stage.broadcasts[newId()] = name);

function encode(target, value, parent) {
  if (typeof value === 'number') return [1, [4, String(value)]];
  if (typeof value === 'string') return [1, [10, value]];
  if (value.var) return [3, [12, ...ref(target, 'variables', value.var)], [10, '']];
  if (value.bc) return [1, [11, ...ref(target, 'broadcasts', value.bc)]];
  if (value.menu) return [1, make(target, { opcode: value.menu, fields: { [value.field]: value.value }, shadow: true }, parent)];
  const id = make(target, value, parent);
  return BOOLEAN.has(value.opcode) ? [2, id] : [3, id, [10, '']];
}

function make(target, node, parent) {
  const id = newId();
  const block = { opcode: node.opcode, next: null, parent, inputs: {}, fields: {}, shadow: Boolean(node.shadow), topLevel: false };
  target.blocks[id] = block;
  for (const [key, value] of Object.entries(node.inputs ?? {})) block.inputs[key] = encode(target, value, id);
  for (const [key, value] of Object.entries(node.fields ?? {})) {
    if (key === 'VARIABLE') block.fields[key] = ref(target, 'variables', value);
    else if (key === 'LIST') block.fields[key] = ref(target, 'lists', value);
    else if (key === 'BROADCAST_OPTION') block.fields[key] = ref(target, 'broadcasts', value);
    else block.fields[key] = [value, null];
  }
  for (const [key, body] of [['SUBSTACK', node.sub], ['SUBSTACK2', node.sub2]]) {
    const first = body && chain(target, body, id);
    if (first) block.inputs[key] = [2, first];
  }
  return id;
}

/** 把一串敘述接成一條；回傳 { first, last }。 */
function link(target, statements, parent) {
  const ids = statements.flat(Infinity).filter(Boolean).map((node) => make(target, node, null));
  ids.forEach((id, i) => {
    target.blocks[id].parent = i === 0 ? parent : ids[i - 1];
    target.blocks[id].next = ids[i + 1] ?? null;
  });
  return { first: ids[0] ?? null, last: ids[ids.length - 1] ?? null };
}
const chain = (target, statements, parent) => link(target, statements, parent).first;

function script(target, hat, statements) {
  const id = make(target, hat, null);
  Object.assign(target.blocks[id], { topLevel: true, x: 0, y: 5000 + Object.keys(target.blocks).length });
  target.blocks[id].next = chain(target, statements, id);
  return id;
}

/** 在既有的積木前面插入幾個敘述。 */
function insertBefore(target, blockId, statements) {
  const block = target.blocks[blockId];
  const previous = target.blocks[block.parent];
  const { first, last } = link(target, statements, block.parent);
  if (previous.next === blockId) previous.next = first;
  else for (const input of Object.values(previous.inputs)) if (input[1] === blockId) input[1] = first;
  target.blocks[last].next = blockId;
  block.parent = last;
}

function removeBlockTree(target, id) {
  const block = target.blocks[id];
  if (!block || Array.isArray(block)) return;
  delete target.blocks[id];
  for (const value of Object.values(block.inputs ?? {})) {
    for (const part of value.slice(1)) if (typeof part === 'string') removeBlockTree(target, part);
  }
  if (block.next) removeBlockTree(target, block.next);
}
const topLevel = (target) => Object.entries(target.blocks).filter(([, b]) => !Array.isArray(b) && b.topLevel);
function removeScripts(target, predicate = () => true) {
  for (const [id, block] of topLevel(target)) if (predicate(block, id)) removeBlockTree(target, id);
}
/** 一段程式裡用到的所有積木。 */
function blocksOf(target, id, out = []) {
  const block = target.blocks[id];
  if (!block || Array.isArray(block)) return out;
  out.push([id, block]);
  for (const value of Object.values(block.inputs ?? {})) {
    for (const part of value.slice(1)) if (typeof part === 'string') blocksOf(target, part, out);
  }
  if (block.next) blocksOf(target, block.next, out);
  return out;
}

// ---- 敘述與運算式的簡寫 ----
const N = (opcode, inputs = {}, fields = {}, sub, sub2) => ({ opcode, inputs, fields, sub, sub2 });
const V = (name) => ({ var: name });
const menu = (opcode, field, value) => ({ menu: opcode, field, value });
const hatFlag = N('event_whenflagclicked');
const hatClone = N('control_start_as_clone');
const hatReceive = (name) => N('event_whenbroadcastreceived', {}, { BROADCAST_OPTION: name });
const hatBackdrop = (name) => N('event_whenbackdropswitchesto', {}, { BACKDROP: name });

const lt = (a, b) => N('operator_lt', { OPERAND1: a, OPERAND2: b });
const gt = (a, b) => N('operator_gt', { OPERAND1: a, OPERAND2: b });
const eq = (a, b) => N('operator_equals', { OPERAND1: a, OPERAND2: b });
const and = (a, b) => N('operator_and', { OPERAND1: a, OPERAND2: b });
const or = (...terms) => terms.reduce((a, b) => N('operator_or', { OPERAND1: a, OPERAND2: b }));
const not = (a) => N('operator_not', { OPERAND: a });
const add = (a, b) => N('operator_add', { NUM1: a, NUM2: b });
const sub = (a, b) => N('operator_subtract', { NUM1: a, NUM2: b });
const mul = (a, b) => N('operator_multiply', { NUM1: a, NUM2: b });
const div = (a, b) => N('operator_divide', { NUM1: a, NUM2: b });
const rnd = (a, b) => N('operator_random', { FROM: a, TO: b });
const joinText = (a, b) => N('operator_join', { STRING1: a, STRING2: b });
const item = (list, index) => N('data_itemoflist', { INDEX: index }, { LIST: list });
const lengthOf = (list) => N('data_lengthoflist', {}, { LIST: list });
const backdropNumber = N('looks_backdropnumbername', {}, { NUMBER_NAME: 'number' });
/** 依目前背景查設定表 */
const cfg = (list) => item(list, backdropNumber);
const touching = (name) => N('sensing_touchingobject', { TOUCHINGOBJECTMENU: menu('sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU', name) });
const keyDown = (key) => N('sensing_keypressed', { KEY_OPTION: menu('sensing_keyoptions', 'KEY_OPTION', key) });
const propertyOf = (property, object) => N('sensing_of', { OBJECT: menu('sensing_of_object_menu', 'OBJECT', object) }, { PROPERTY: property });
const xPos = N('motion_xposition');
const yPos = N('motion_yposition');

const set = (name, value) => N('data_setvariableto', { VALUE: value }, { VARIABLE: name });
const change = (name, value) => N('data_changevariableby', { VALUE: value }, { VARIABLE: name });
const push = (list, value) => N('data_addtolist', { ITEM: value }, { LIST: list });
const popFirst = (list) => N('data_deleteoflist', { INDEX: 1 }, { LIST: list });
const clearList = (list) => N('data_deletealloflist', {}, { LIST: list });
const wait = (seconds) => N('control_wait', { DURATION: seconds });
const waitUntil = (condition) => N('control_wait_until', { CONDITION: condition });
const repeat = (times, body) => N('control_repeat', { TIMES: times }, {}, body);
const forever = (body) => N('control_forever', {}, {}, body);
const until = (condition, body) => N('control_repeat_until', { CONDITION: condition }, {}, body);
const when = (condition, body, otherwise) =>
  otherwise ? N('control_if_else', { CONDITION: condition }, {}, body, otherwise) : N('control_if', { CONDITION: condition }, {}, body);
const cloneOf = (name) => N('control_create_clone_of', { CLONE_OPTION: menu('control_create_clone_of_menu', 'CLONE_OPTION', name) });
const deleteClone = N('control_delete_this_clone');
const broadcast = (name) => N('event_broadcast', { BROADCAST_INPUT: { bc: name } });
const show = N('looks_show');
const hide = N('looks_hide');
const goTo = (x, y) => N('motion_gotoxy', { X: x, Y: y });
const glide = (seconds, x, y) => N('motion_glidesecstoxy', { SECS: seconds, X: x, Y: y });
const move = (steps) => N('motion_movesteps', { STEPS: steps });
const turn = (degrees) => N('motion_turnright', { DEGREES: degrees });
const pointTo = (name) => N('motion_pointtowards', { TOWARDS: menu('motion_pointtowards_menu', 'TOWARDS', name) });
const pointAt = (direction) => N('motion_pointindirection', { DIRECTION: direction });
const rotationStyle = (style) => N('motion_setrotationstyle', {}, { STYLE: style });
const changeY = (dy) => N('motion_changeyby', { DY: dy });
const setSize = (size) => N('looks_setsizeto', { SIZE: size });
const changeSize = (delta) => N('looks_changesizeby', { CHANGE: delta });
const setEffect = (effect, value) => N('looks_seteffectto', { VALUE: value }, { EFFECT: effect });
const changeEffect = (effect, value) => N('looks_changeeffectby', { CHANGE: value }, { EFFECT: effect });
const nextCostume = N('looks_nextcostume');
const costume = (value) =>
  N('looks_switchcostumeto', { COSTUME: typeof value === 'string' ? menu('looks_costume', 'COSTUME', value) : value });
const toFront = N('looks_gotofrontback', {}, { FRONT_BACK: 'front' });
const play = (name) => N('sound_play', { SOUND_MENU: menu('sound_sounds_menu', 'SOUND_MENU', name) });
const say = (message) => N('looks_say', { MESSAGE: message });

// =====================================================================================
// 素材：SVG 造型、PNG 換色
// =====================================================================================
function addAsset(content, ext) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const md5 = createHash('md5').update(data).digest('hex');
  writeFileSync(join(dir, `${md5}.${ext}`), data);
  return { assetId: md5, md5ext: `${md5}.${ext}`, dataFormat: ext };
}
const svgCostume = (name, width, height, body) => ({
  name,
  bitmapResolution: 1,
  rotationCenterX: width / 2,
  rotationCenterY: height / 2,
  ...addAsset(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`, 'svg'),
});
function addSprite(name, costumes) {
  const target = {
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
    costumes, sounds: [], volume: 100, layerOrder: Math.max(...project.targets.map((t) => t.layerOrder)) + 1,
    visible: false, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around',
  };
  project.targets.push(target);
  return target;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => (buffer.reduce((c, byte) => CRC[(c ^ byte) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;

/** 逐像素改寫一張 8-bit RGBA、非交錯的 PNG。 */
function mapPng(png, mapPixel) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw new Error('只支援 8-bit RGBA、非交錯的 PNG');
  const idat = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = left + up - upLeft;
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upLeft) ? left : Math.abs(p - up) <= Math.abs(p - upLeft) ? up : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 0xff;
    }
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = mapPixel(pixels[i], pixels[i + 1], pixels[i + 2]);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 1; // Sub
    for (let x = 0; x < stride; x += 1) {
      filtered[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - (x >= 4 ? pixels[y * stride + x - 4] : 0)) & 0xff;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', png.subarray(16, 29)), chunk('IDAT', deflateSync(filtered, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// =====================================================================================
// C. 第三章的背景與每關各自的程式（要先做，後面的改寫才會一併套用到第三章）
// =====================================================================================
// 主角用「碰到顏色」判斷牆壁，所以這三個顏色的像素必須原樣保留，其餘才換色
const WALL_COLORS = [[0x3d, 0x88, 0x44], [0x5b, 0x65, 0x6c], [0x51, 0x50, 0x4e]];
const isWall = (r, g, b) => WALL_COLORS.some(([R, G, B]) => (r & 0xf8) === (R & 0xf8) && (g & 0xf8) === (G & 0xf8) && (b & 0xf0) === (B & 0xf0));
function crimson(r, g, b) {
  if (isWall(r, g, b)) return [r, g, b];
  // 轉色相：藍綠色的石磚變成暗紅，其餘偏暖
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const chroma = max - min;
  let hue = 0;
  if (chroma) {
    if (max === r) hue = ((g - b) / chroma) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
  }
  hue = (((hue * 60 - 165) % 360) + 360) % 360;
  const c = Math.min(255, chroma * 1.35);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6];
  const m = light - c / 2;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  let out = [clamp(r1 + m + light * 0.16), clamp(g1 + m - light * 0.04), clamp(b1 + m - light * 0.08)];
  if (isWall(...out)) out = [clamp(out[0] + 10), out[1], out[2]]; // 不要意外變成牆壁色
  return out;
}

const backdropIndex = (name) => stage.costumes.findIndex((c) => c.name === name);
const chapter2 = stage.costumes[backdropIndex('2-1')];
const chapter2Svg = readFileSync(join(dir, chapter2.md5ext), 'utf8');
const embedded = /(xlink:href="data:image\/png;base64,)([^"]+)(")/;
const chapter3Svg = chapter2Svg.replace(embedded, (_, head, data, tail) => head + mapPng(Buffer.from(data, 'base64'), crimson).toString('base64') + tail);
const chapter3 = { ...chapter2, ...addAsset(chapter3Svg, 'svg') };

const answerBackdrop = stage.costumes[backdropIndex('ANS 2-2')];
const bossBackdrop = stage.costumes[backdropIndex('2-X')];
const newBackdrops = [
  { ...chapter3, name: 'C2-C3' },
  { ...chapter3, name: 'XXX2' },
  ...[1, 2, 3, 4, 5].flatMap((n) => [{ ...chapter3, name: `3-${n}` }, { ...answerBackdrop, name: `ANS 3-${n}` }]),
  { ...bossBackdrop, name: '3-X' },
];
stage.costumes.splice(backdropIndex('2-X') + 1, 0, ...newBackdrops);

// 原專案每一關都有一份「當背景換成 X」的程式；把第二章的複製一份給第三章
const RENAME = { 'C1-C2': 'C2-C3', '2-X': '3-X' };
for (const n of [1, 2, 3, 4, 5]) Object.assign(RENAME, { [`2-${n}`]: `3-${n}`, [`ANS 2-${n}`]: `ANS 3-${n}` });
for (const target of project.targets) {
  for (const [hatId, hat] of topLevel(target)) {
    const to = hat.opcode === 'event_whenbackdropswitchesto' && RENAME[hat.fields.BACKDROP[0]];
    if (!to) continue;
    const source = blocksOf(target, hatId);
    const ids = new Map(source.map(([id]) => [id, newId()]));
    for (const [id, block] of source) {
      const copy = JSON.parse(JSON.stringify(block));
      copy.next = ids.get(copy.next) ?? null;
      copy.parent = ids.get(copy.parent) ?? null;
      for (const input of Object.values(copy.inputs)) {
        for (let i = 1; i < input.length; i += 1) if (typeof input[i] === 'string') input[i] = ids.get(input[i]) ?? input[i];
      }
      // 最終魔王多兩題：抽題迴圈的「題目 的長度 = 5」改成 7
      const lengthBlock = copy.opcode === 'operator_equals' && source.find(([sid]) => sid === block.inputs.OPERAND1?.[1])?.[1];
      if (to === '3-X' && lengthBlock?.opcode === 'data_lengthoflist' && block.inputs.OPERAND2?.[1]?.[1] === '5') {
        copy.inputs.OPERAND2 = [1, [10, '7']];
        count('finalBossQuestions');
      }
      target.blocks[ids.get(id)] = copy;
    }
    const copyHat = target.blocks[ids.get(hatId)];
    copyHat.fields.BACKDROP = [to, null];
    copyHat.y = (hat.y ?? 0) + 6000;
    count('chapter3Scripts');
  }
}

// =====================================================================================
// A. 題目
// =====================================================================================
const QUESTION = /^第.+題$/;
for (const target of [sprite('Tree'), sprite('BOSS')]) {
  for (const [id, hat] of topLevel(target)) {
    if (hat.opcode !== 'event_whenbroadcastreceived' || !QUESTION.test(hat.fields.BROADCAST_OPTION[0])) continue;
    const lines = [];
    for (let next = hat.next; next; next = target.blocks[next].next) {
      const block = target.blocks[next];
      if (block.opcode !== 'looks_sayforsecs' || !Array.isArray(block.inputs.MESSAGE?.[1])) throw new Error(`${target.name}：題目程式的結構和預期不同`);
      lines.push(String(block.inputs.MESSAGE[1][1]));
    }
    removeBlockTree(target, hat.next);
    target.blocks[id] = hat;
    // 前導句與題幹合併成一則（全形空白隔開），一直顯示到答對為止；原本 10 秒後就消失
    hat.next = chain(target, [say(lines.join('　'))], id);
    count('questions');
  }
  const clear = [say('')];
  script(target, hatReceive('回答正確'), clear);
  for (const backdrop of ['GAME OVER', 'THE END', 'MAIN', 'LOBBY']) script(target, hatBackdrop(backdrop), clear);
}

// 同一局不重複出題
const USED = '出過的題';
glist(USED);
for (const target of project.targets) {
  for (const [loopId, loop] of Object.entries(target.blocks)) {
    // 原本的抽題迴圈：重複直到（題目 的長度 = N）{ a. = 隨機 1~75；把 a. 插入 題目 }
    const setId = loop.opcode === 'control_repeat_until' && loop.inputs.SUBSTACK?.[1];
    const pick = target.blocks[setId];
    const insert = target.blocks[pick?.next];
    if (pick?.opcode !== 'data_setvariableto' || insert?.opcode !== 'data_insertatlist' || insert.fields.LIST[0] !== '題目' || insert.next) continue;
    const insertId = pick.next;
    // 改成：如果（出過的題 不包含 a.）才插入並記下來；題庫快用完時清空紀錄，避免抽不到題目卡住
    const guard = make(target, when(not(N('data_listcontainsitem', { ITEM: V('a.') }, { LIST: USED })), []), setId);
    pick.next = guard;
    target.blocks[guard].inputs.SUBSTACK = [2, insertId];
    insert.parent = guard;
    insert.next = chain(target, [push(USED, V('a.')), when(gt(lengthOf(USED), 68), [clearList(USED)])], insertId);
    count('pickLoops');

    // 新的一局（按綠旗、回主畫面）才清空紀錄；魔王關開頭的「清空題目」不算
    const clearBlock = target.blocks[loop.parent];
    const hat = target.blocks[clearBlock?.parent];
    const startsRun = hat?.opcode === 'event_whenflagclicked' || hat?.fields?.BROADCAST_OPTION?.[0] === '回主畫面過場';
    if (clearBlock?.opcode === 'data_deletealloflist' && startsRun) {
      insertBefore(target, loopId, [clearList(USED)]);
      count('pickResets');
    }
  }
}

// =====================================================================================
// E. 作弊鍵
// =====================================================================================
for (const target of project.targets) {
  removeScripts(target, (block) => {
    const cheat = block.opcode === 'event_whenkeypressed' && ['8', '9'].includes(block.fields.KEY_OPTION[0]);
    if (cheat) count('cheats');
    return cheat;
  });
}

// =====================================================================================
// B. 戰鬥
// =====================================================================================
// 各關的怪物配置。每種怪：數量、血量、移動一次的秒數、射擊間隔（0 = 不射擊）、一次幾發、
// 是否衝向主角、色調（Scratch 的顏色特效）、尺寸倍率（%）。子彈一發約扣 10～20。
const MONSTERS = {
  J: { name: '水母怪', projectile: '火球', size: 25, pixelate: 0, frame: 0.1 }, // 會射火球
  S: { name: '爛泥怪', projectile: '黑洞球', size: 8, pixelate: 80, frame: 0.2 }, // 血厚、慢、射慢速大球
  B: { name: '蝙蝠', projectile: '雷電球', size: 22, pixelate: 30, frame: 0.2 }, // 飛得快，碰到就受傷
  E: { name: '大眼仔', projectile: '火球', size: 20, pixelate: 0, frame: 0.1 }, // 射得快
};
const PROJECTILES = { 火球: 3.5, 黑洞球: 2, 雷電球: 4.5 };
const m = (n, hp, moveSecs, fireEvery = 0, volley = 1, chase = 0, tint = 0, size = 100) => ({ n, hp, moveSecs, fireEvery, volley, chase, tint, size });
const LEVELS = {
  '1-1': { title: 'はじまりの間', J: m(2, 40, 3, 3.5) },
  '1-2': { title: 'コウモリの巣', B: m(3, 30, 1.2) },
  '1-3': { title: '泥の沼', S: m(2, 80, 5, 4) },
  '1-4': { title: '挟み撃ち', J: m(2, 50, 3, 3), B: m(2, 30, 1) },
  '1-5': { title: '三つ巴', J: m(1, 60, 3, 2.5), S: m(1, 80, 5, 4.5), B: m(2, 40, 1) },
  '1-X': { title: '魔王の門' },
  '2-1': { title: '見つめる目', E: m(2, 50, 3, 2.5), B: m(1, 40, 1) },
  '2-2': { title: '突撃！', B: m(4, 30, 1.6, 0, 1, 1) },
  '2-3': { title: '鉄壁', S: m(2, 110, 4, 3.5, 1, 0, 0, 125), E: m(1, 50, 3, 2.5) },
  '2-4': { title: '弾幕', J: m(2, 50, 3, 3.4, 3), B: m(1, 40, 1.2) },
  '2-5': { title: '総力戦', J: m(1, 60, 3, 3, 3), S: m(1, 110, 4, 4, 1, 0, 0, 125), B: m(2, 40, 1.6, 0, 1, 1), E: m(1, 50, 3, 2.5) },
  '2-X': { title: '魔王ふたたび' },
  '3-1': { title: '雷鳴', B: m(3, 40, 1.2, 2.8, 1, 0, 60) },
  '3-2': { title: '狙撃手', E: m(2, 60, 3, 3, 3, 0, 50), S: m(1, 120, 4, 3.5, 1, 0, 50, 125) },
  '3-3': { title: '火の雨', J: m(2, 60, 3, 3.6, 4, 0, 150), B: m(2, 40, 1.6, 0, 1, 1, 60) },
  '3-4': { title: '巨人の行進', S: m(3, 130, 3.5, 3.2, 1, 0, 50, 140), E: m(1, 60, 3, 2.4, 1, 0, 50) },
  '3-5': { title: '最後の試練', J: m(1, 70, 3, 3.4, 3, 0, 150), S: m(1, 130, 3.5, 3.5, 1, 0, 50, 140), B: m(2, 40, 1.6, 3.2, 1, 1, 60), E: m(1, 70, 3, 3, 3, 0, 50) },
  '3-X': { title: '紅蓮の魔王' },
};
const table = (pick, fallback = 0) => stage.costumes.map((c) => pick(LEVELS[c.name]) ?? fallback);
for (const [key, monster] of Object.entries(MONSTERS)) {
  for (const field of ['n', 'hp', 'moveSecs', 'fireEvery', 'volley', 'chase', 'tint', 'size']) {
    glist(`設定:${monster.name}:${field}`, table((level) => level?.[key]?.[field]));
  }
}
glist('設定:敵人總數', table((level) => level && Object.keys(MONSTERS).reduce((sum, key) => sum + (level[key]?.n ?? 0), 0)));
glist('設定:彈速', stage.costumes.map((c) => ({ 1: 100, 2: 110, 3: 125 })[c.name[0]] ?? 100));
const ALIVE = '敵人數';
const FIGHTING = '戰鬥中';
gvar(ALIVE);
gvar(FIGHTING);
const SHOTS = '彈幕佇列'; // 怪物開火時放入 x、y、角度偏移；彈幕的分身出生時取走
const FX = '特效佇列'; // x、y、種類
glist(SHOTS);
glist(FX);
const effect = (x, y, kind) => [push(FX, x), push(FX, y), push(FX, kind), cloneOf('特效')];

// 「三隻怪都死了」的判斷改成看敵人數。原本的寫法漏掉第四種怪（大眼仔），
// 在第二章如果牠最後才死，會出現畫面切到答題、題目卻不出現的卡關。
const MONSTER_VARS = new Set(Object.values(MONSTERS).map((monster) => monster.name));
const isAllDead = (target, id) => {
  const block = target.blocks[id];
  if (block?.opcode === 'operator_and') return isAllDead(target, block.inputs.OPERAND1?.[1]) && isAllDead(target, block.inputs.OPERAND2?.[1]);
  return block?.opcode === 'operator_lt' && MONSTER_VARS.has(block.inputs.OPERAND1?.[1]?.[1]) && block.inputs.OPERAND2?.[1]?.[1] === '1';
};
for (const target of project.targets) {
  if (MONSTER_VARS.has(target.name) || target.name in PROJECTILES) continue; // 這些角色下面會整個重寫
  for (const [id, block] of Object.entries(target.blocks)) {
    if (Array.isArray(block) || !target.blocks[id]) continue;
    for (const input of Object.values(block.inputs)) {
      if (input[0] !== 2 || !isAllDead(target, input[1])) continue;
      removeBlockTree(target, input[1]);
      input[1] = make(target, lt(V(ALIVE), 1), id);
      count('allDeadChecks');
    }
  }
}

// 開打前先設定好敵人數（在廣播 WM 的同一段程式裡設定，就不會有先後順序的問題）
for (const target of project.targets) {
  for (const [id, block] of Object.entries(target.blocks)) {
    if (block.opcode !== 'event_broadcast' || block.inputs.BROADCAST_INPUT[1][1] !== 'WM') continue;
    insertBefore(target, id, [set(ALIVE, cfg('設定:敵人總數')), set(FIGHTING, 1)]);
    count('fightStarts');
  }
}
// 怪物清光 → 出題（原本寫在水母怪身上）
script(stage, hatReceive('WM'), [waitUntil(lt(V(ALIVE), 1)), set(FIGHTING, 0), wait(1), broadcast('怪物死亡'), set('控制叫怪', 0)]);
script(stage, hatBackdrop('GAME OVER'), [set(FIGHTING, 0)]);

for (const monster of Object.values(MONSTERS)) {
  const target = sprite(monster.name);
  const c = (field) => cfg(`設定:${monster.name}:${field}`);
  removeScripts(target);
  lvar(target, '我的HP');
  lvar(target, '第幾發');
  // 本尊只負責生出分身；留在場地中央，主角卡牆時原專案會朝「水母怪」的位置推回來
  script(target, hatFlag, [N('sound_seteffectto', { VALUE: 100 }, { EFFECT: 'PITCH' }), N('looks_cleargraphiceffects'), goTo(0, -20), hide]);
  script(target, hatReceive('WM'), [wait(1), repeat(c('n'), [cloneOf('_myself_'), wait(0.15)])]);
  for (const backdrop of ['GAME OVER', 'MAIN', 'LOBBY']) script(target, hatBackdrop(backdrop), [deleteClone]);

  // 出場 → 挨打 → 倒下
  script(target, hatClone, [
    set('我的HP', c('hp')),
    setSize(div(mul(monster.size, c('size')), 100)),
    setEffect('PIXELATE', monster.pixelate),
    setEffect('COLOR', c('tint')),
    rotationStyle('left-right'),
    goTo(rnd(-50, 140), rnd(-120, 110)),
    setEffect('GHOST', 100),
    show,
    effect(xPos, yPos, 'ring'),
    repeat(10, [changeEffect('GHOST', -10)]),
    until(or(lt(V('我的HP'), 1), lt(V('HP'), 1)), [
      when(touching('子彈'), [
        change('我的HP', -10),
        play('HIT'),
        setEffect('BRIGHTNESS', 100),
        effect(xPos, yPos, 'spark'),
      ], [setEffect('BRIGHTNESS', 0)]),
    ]),
    setEffect('BRIGHTNESS', 0),
    when(lt(V('我的HP'), 1), [
      change(ALIVE, -1),
      repeat(5, effect(xPos, yPos, 'puff')),
      repeat(6, [changeSize(div(mul(monster.size, c('size')), 1200)), changeEffect('GHOST', 16)]),
    ], [repeat(10, [changeEffect('GHOST', 10)])]),
    deleteClone,
  ]);
  // 移動：平常在場內亂飄，「衝向主角」的版本會直接撲過去
  script(target, hatClone, [
    wait(0.6),
    forever([
      pointTo('主角'),
      when(eq(c('chase'), 1),
        [glide(c('moveSecs'), propertyOf('x position', '主角'), propertyOf('y position', '主角'))],
        [glide(c('moveSecs'), rnd(-109, 99), rnd(-135, 79))]),
    ]),
  ]);
  script(target, hatClone, [forever([nextCostume, wait(monster.frame)])]);
  // 射擊：一次可以多發，扇形散開
  script(target, hatClone, [
    when(gt(c('fireEvery'), 0), [
      wait(rnd(0.8, add(c('fireEvery'), 0.5))),
      forever([
        set('第幾發', 0),
        repeat(c('volley'), [
          push(SHOTS, xPos),
          push(SHOTS, yPos),
          push(SHOTS, mul(sub(V('第幾發'), div(sub(c('volley'), 1), 2)), 16)),
          cloneOf(monster.projectile),
          change('第幾發', 1),
        ]),
        wait(c('fireEvery')),
      ]),
    ]),
  ]);
}

for (const [name, speed] of Object.entries(PROJECTILES)) {
  const target = sprite(name);
  removeScripts(target, (block) => block.opcode === 'control_start_as_clone');
  lvar(target, '偏移');
  script(target, hatClone, [
    goTo(item(SHOTS, 1), item(SHOTS, 2)),
    set('偏移', item(SHOTS, 3)),
    popFirst(SHOTS), popFirst(SHOTS), popFirst(SHOTS),
    rotationStyle('all around'),
    pointTo('主角'),
    turn(add(V('偏移'), rnd(-6, 6))),
    show,
    forever([
      move(div(mul(speed, cfg('設定:彈速')), 100)),
      nextCostume,
      when(or(touching('主角'), touching('_edge_'), lt(V(ALIVE), 1)), [wait(0), deleteClone]),
    ]),
  ]);
}

// 主角的子彈：原本不會被大眼仔擋下
{
  const target = sprite('子彈');
  removeScripts(target, (block) => block.opcode === 'control_start_as_clone');
  script(target, hatClone, [
    N('motion_goto', { TO: menu('motion_goto_menu', 'TO', 'weapon') }),
    pointTo('_mouse_'),
    show,
    turn(rnd(sub(0, V('bullet angle')), V('bullet angle'))),
    forever([
      move(15),
      when(or(...Object.values(MONSTERS).map((monster) => touching(monster.name)), touching('_edge_')), [wait(0), deleteClone]),
    ]),
  ]);
}

// 主角受傷：加入雷電球；受傷後閃爍 0.8 秒無敵（怪變多了，避免一瞬間被連續扣血）
{
  const target = sprite('主角');
  removeScripts(target, (block, id) => blocksOf(target, id).some(([, b]) => b.opcode === 'data_changevariableby' && b.fields.VARIABLE[0] === 'HP'));
  script(target, hatReceive('WM'), [
    wait(0.5),
    until(or(lt(V('HP'), 1), lt(V(ALIVE), 1)), [
      when(or(touching('火球'), touching('黑洞球'), touching('雷電球'), touching('蝙蝠')), [
        broadcast('-HP'),
        play('主角扣血'),
        change('HP', -25),
        change('戰鬥評價', -10),
        repeat(4, [setEffect('GHOST', 60), wait(0.1), setEffect('GHOST', 0), wait(0.1)]),
      ]),
    ]),
    setEffect('GHOST', 0),
  ]);
  // 跑動時的揚塵
  script(target, hatBackdrop('LOBBY'), [
    forever([
      when(and(eq(V(FIGHTING), 1), or(keyDown('w'), keyDown('a'), keyDown('s'), keyDown('d'))), [effect(xPos, sub(yPos, 16), 'dust')]),
      wait(0.14),
    ]),
  ]);
}

// 過關回 25 HP（上限 200）
script(sprite('血條'), hatReceive('答題成功'), [
  when(lt(V('HP'), 200), [change('HP', 25), costume(joinText('HP', V('HP')))]),
]);

// =====================================================================================
// D. 演出
// =====================================================================================
{
  const star = 'M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z';
  const fx = addSprite('特效', [
    svgCostume('spark', 24, 24, `<path d="${star}" fill="#fff6c8"/><path d="${star}" fill="#ffd34d" transform="translate(12 12) scale(0.6) translate(-12 -12)"/>`),
    svgCostume('puff', 24, 24, '<defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.7" stop-color="#d9d4e6" stop-opacity="0.8"/><stop offset="1" stop-color="#d9d4e6" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="12" fill="url(#g)"/>'),
    svgCostume('dust', 16, 16, '<circle cx="8" cy="8" r="7" fill="#cbbfa6" fill-opacity="0.7"/>'),
    svgCostume('ring', 48, 48, '<circle cx="24" cy="24" r="21" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3"/><circle cx="24" cy="24" r="14" fill="#ffffff" fill-opacity="0.18"/>'),
  ]);
  lvar(fx, '種類');
  script(fx, hatFlag, [hide]);
  script(fx, hatClone, [
    goTo(item(FX, 1), item(FX, 2)),
    set('種類', item(FX, 3)),
    popFirst(FX), popFirst(FX), popFirst(FX),
    costume(V('種類')),
    pointAt(rnd(1, 360)),
    when(eq(V('種類'), 'spark'), [setSize(70), show, repeat(6, [move(4), changeSize(-9), changeEffect('GHOST', 14)])]),
    when(eq(V('種類'), 'puff'), [setSize(rnd(60, 110)), show, repeat(10, [move(3.5), changeSize(7), changeEffect('GHOST', 10)])]),
    when(eq(V('種類'), 'dust'), [setSize(45), setEffect('GHOST', 35), show, repeat(8, [changeY(1), changeSize(5), changeEffect('GHOST', 8)])]),
    when(eq(V('種類'), 'ring'), [setSize(20), show, repeat(8, [changeSize(16), changeEffect('GHOST', 12)])]),
    deleteClone,
  ]);

  // 受傷時畫面邊緣閃紅
  const hurt = addSprite('受傷閃光', [
    svgCostume('flash', 480, 360, '<defs><radialGradient id="g" r="0.75"><stop offset="0.55" stop-color="#e2202c" stop-opacity="0"/><stop offset="1" stop-color="#e2202c" stop-opacity="0.85"/></radialGradient></defs><rect width="480" height="360" fill="url(#g)"/>'),
  ]);
  script(hurt, hatFlag, [goTo(0, 0), hide]);
  script(hurt, hatReceive('-HP'), [toFront, setEffect('GHOST', 20), show, repeat(10, [changeEffect('GHOST', 8)]), hide]);

  // 每關開頭的標題
  const escape = (text) => text.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const banner = addSprite('關卡標題', Object.entries(LEVELS).map(([key, level]) => svgCostume(key, 480, 70, `
    <rect width="480" height="70" fill="#0b0a0a" fill-opacity="0.72"/>
    <rect width="480" height="2" fill="#c2412d"/><rect y="68" width="480" height="2" fill="#c2412d"/>
    <text x="240" y="25" text-anchor="middle" font-family="sans-serif" font-size="12" letter-spacing="4" fill="#e0b458">STAGE ${key}</text>
    <text x="240" y="54" text-anchor="middle" font-family="serif" font-size="24" font-weight="bold" letter-spacing="3" fill="#ffffff">${escape(level.title)}</text>`)));
  gvar('上一關', '');
  script(banner, hatFlag, [goTo(0, 60), hide]);
  for (const backdrop of ['LOBBY', 'MAIN', 'GAME OVER', 'THE END']) script(banner, hatBackdrop(backdrop), [set('上一關', ''), hide]);
  for (const key of Object.keys(LEVELS)) {
    // 答完題會切回同一個背景，所以只有換到新關卡時才顯示
    script(banner, hatBackdrop(key), [
      when(not(eq(V('上一關'), key)), [
        set('上一關', key),
        costume(key),
        toFront,
        setEffect('GHOST', 100),
        show,
        repeat(8, [changeEffect('GHOST', -12.5)]),
        wait(1.5),
        repeat(8, [changeEffect('GHOST', 12.5)]),
        hide,
      ]),
    ]);
  }

  // 最終魔王換個顏色
  const boss = sprite('BOSS');
  script(boss, hatBackdrop('3-X'), [setEffect('COLOR', 150)]);
  for (const backdrop of ['MAIN', 'LOBBY']) script(boss, hatBackdrop(backdrop), [setEffect('COLOR', 0)]);
}

// =====================================================================================
// 檢查與輸出
// =====================================================================================
for (const target of project.targets) {
  for (const [id, block] of Object.entries(target.blocks)) {
    if (Array.isArray(block)) continue;
    const refs = [block.next, block.parent, ...Object.values(block.inputs).flatMap((input) => input.slice(1).filter((part) => typeof part === 'string'))];
    for (const other of refs) if (other && !target.blocks[other]) throw new Error(`${target.name} 的積木 ${id}（${block.opcode}）指向不存在的 ${other}`);
  }
}
const expected = { questions: 150, pickLoops: 19, pickResets: 2, cheats: 2, finalBossQuestions: 1, fightStarts: 16, allDeadChecks: 14, chapter3Scripts: 26 };
for (const [key, value] of Object.entries(expected)) {
  if (report[key] !== value) throw new Error(`「${key}」修改了 ${report[key]} 處，預期 ${value} 處（專案版本不同？）：${JSON.stringify(report)}`);
}

writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
console.log(`完成：${JSON.stringify(report)}`);
