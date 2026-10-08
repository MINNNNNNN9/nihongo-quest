// 觸控裝置的虛擬按鍵：左下搖桿＝W A S D，右下按鈕＝空白鍵，點遊戲畫面＝滑鼠瞄準與射擊。
//
// 原遊戲只支援鍵盤與滑鼠，這裡把觸控轉成 Scratch VM 的鍵盤／滑鼠輸入，原專案不需修改。
// scaffolding 內建的觸控處理只看第一根手指，搖桿和瞄準同時按時會互相干擾，
// 所以啟用後由這裡接手所有觸控事件，分別追蹤每根手指。

const DEAD_ZONE = 14; // 搖桿中心不觸發移動的半徑（px）
const KEYS = { up: 'w', down: 's', left: 'a', right: 'd' };

export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/**
 * @param {{ vm: any, layersRect?: DOMRect }} scaffolding
 * @param {HTMLElement} root 放按鍵的容器（蓋在遊戲畫面上）
 */
export function setupTouchControls(scaffolding, root) {
  const vm = scaffolding.vm;
  root.hidden = false;
  root.innerHTML = `
    <div class="stick" data-pad aria-label="移動搖桿"><div class="knob"></div></div>
    <button class="action" data-pad type="button" aria-label="互動（空白鍵）">互動</button>`;
  const stick = root.querySelector('.stick');
  const knob = root.querySelector('.knob');
  const action = root.querySelector('.action');

  const pressed = new Set();
  const setKey = (key, isDown) => {
    if (pressed.has(key) === isDown) return;
    if (isDown) pressed.add(key);
    else pressed.delete(key);
    vm.postIOData('keyboard', { key, isDown });
  };

  const moveStick = (touch) => {
    const rect = stick.getBoundingClientRect();
    const dx = touch ? touch.clientX - (rect.left + rect.width / 2) : 0;
    const dy = touch ? touch.clientY - (rect.top + rect.height / 2) : 0;
    const limit = rect.width / 2 - 18;
    const scale = Math.min(1, limit / (Math.hypot(dx, dy) || 1));
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    setKey(KEYS.left, dx < -DEAD_ZONE);
    setKey(KEYS.right, dx > DEAD_ZONE);
    setKey(KEYS.up, dy < -DEAD_ZONE);
    setKey(KEYS.down, dy > DEAD_ZONE);
  };

  const postMouse = (touch, isDown) => {
    const rect = scaffolding.layersRect || document.getElementById('project').getBoundingClientRect();
    const data = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
    };
    if (isDown !== undefined) Object.assign(data, { isDown, button: 0 });
    vm.postIOData('mouse', data);
  };

  // 每根手指各司其職：touch.identifier → 'stick' | 'action' | 'aim'
  const roles = new Map();
  let lastAim = null;

  const onStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    for (const touch of event.changedTouches) {
      if (stick.contains(touch.target)) {
        roles.set(touch.identifier, 'stick');
        moveStick(touch);
      } else if (action.contains(touch.target)) {
        roles.set(touch.identifier, 'action');
        action.classList.add('down');
        setKey(' ', true);
      } else if (![...roles.values()].includes('aim')) {
        roles.set(touch.identifier, 'aim');
        lastAim = touch;
        postMouse(touch, true);
      }
    }
  };

  const onMove = (event) => {
    event.preventDefault();
    event.stopPropagation();
    for (const touch of event.changedTouches) {
      const role = roles.get(touch.identifier);
      if (role === 'stick') moveStick(touch);
      else if (role === 'aim') {
        lastAim = touch;
        postMouse(touch);
      }
    }
  };

  const onEnd = (event) => {
    event.stopPropagation();
    for (const touch of event.changedTouches) {
      const role = roles.get(touch.identifier);
      roles.delete(touch.identifier);
      if (role === 'stick') moveStick(null);
      else if (role === 'action') {
        action.classList.remove('down');
        setKey(' ', false);
      } else if (role === 'aim') postMouse(lastAim || touch, false);
    }
  };

  // capture 階段攔下，scaffolding 自己的觸控處理就不會再收到
  const options = { capture: true, passive: false };
  document.addEventListener('touchstart', onStart, options);
  document.addEventListener('touchmove', onMove, options);
  document.addEventListener('touchend', onEnd, options);
  document.addEventListener('touchcancel', onEnd, options);
}
