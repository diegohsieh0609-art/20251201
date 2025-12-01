// 全視窗畫布 + 支援 stop 與 walk sprite、左右鍵移動與翻轉
const sprites = {
  stop: { path: '1/stop/stop_1.png', frames: 8, img: null, frameW: 699 / 8, frameH: 190, delay: 6 },
  walk: { path: '1/walk/walk_1.png', frames: 8, img: null, frameW: 1019 / 8, frameH: 195, delay: 6 },
  jump: { path: '1/jump/jump_1.png', frames: 19, img: null, frameW: 3054 / 19, frameH: 214, delay: 2 }
};
// 新增 push 與 light sprite 設定（空白鍵發動與發射物）
sprites.push = { path: '1/push/push_1.png', frames: 10, img: null, frameW: 2215 / 10, frameH: 185, delay: 4 };
sprites.light = { path: '1/light/light_1.png', frames: 4, img: null, frameW: 591 / 4, frameH: 19, delay: 6 };

let currentSprite = 'stop';
let frameIndex = 0;
let frameDelay = 6; // 控制動畫速度（數字越小越快）

let posX, posY;
let speed = 3; // 移動速度（像素/幀）
let facing = 1; // 1: 向右 (預設), -1: 向左
// 跳躍相關
let jumping = false;
let jumpProgress = 0; // 畫面幀的進度（用於對應 jump sprite 的幀）
let basePosY = 0; // 跳躍開始時的地面 Y
let jumpHeight = 150; // 跳躍高度（像素），會在載入 sprite 後依大小調整
// 推擠（發動）相關
let pushing = false;
let pushProgress = 0;
// 射出物
let projectiles = []; // 每個項目 {x,y,dir,sprite,frameIndex,progress,sw,sh,dw,dh,speed}

function preload() {
  // 同步載入兩個 sprite 檔案（若不存在，會在 console 顯示錯誤）
  for (const key in sprites) {
    const s = sprites[key];
    s.img = loadImage(s.path, () => {
      console.log('載入完成:', s.path);
      // 更新實際每幀寬高
      s.frameW = s.img.width / s.frames;
      s.frameH = s.img.height;
    }, (err) => {
      console.error('載入失敗:', s.path, err);
    });
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  imageMode(CENTER);
  frameRate(60);

  // 初始位置：畫布中央
  posX = width / 2;
  posY = height / 2;
  basePosY = posY;
}

function draw() {
  background(255);

  // 判斷鍵盤狀態：左右鍵持續按著則移動（跳躍時仍可左右移動）
  let moving = false;
  if (keyIsDown(RIGHT_ARROW)) {
    moving = true;
    // 只在非跳躍狀態更新 currentSprite，跳躍會覆蓋成 jump
    if (!jumping) currentSprite = 'walk';
    facing = 1;
    posX += speed;
  } else if (keyIsDown(LEFT_ARROW)) {
    moving = true;
    if (!jumping) currentSprite = 'walk';
    facing = -1;
    posX -= speed;
  } else {
    if (!jumping) currentSprite = 'stop';
  }

  // 選取要用的 sprite（優先順序：push > jump > currentSprite）
  const s = pushing ? sprites['push'] : (jumping ? sprites['jump'] : sprites[currentSprite]);
  // 若當前 sprite 尚未載入，顯示等待文字
  if (!s.img || !s.img.width) {
    push();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(`載入 sprite 中或找不到檔案：${s.path}`, width / 2, height / 2);
    pop();
    return;
  }

  // 控制動畫幀與跳躍進度
  const delay = s.delay || frameDelay;
  if (frameCount % delay === 0) {
    if (pushing) {
      // 推擠時逐幀前進
      pushProgress++;
      frameIndex = Math.min(pushProgress, s.frames - 1);
    } else if (jumping) {
      // 跳躍時我們希望逐幀推進直到完成
      jumpProgress++;
      frameIndex = Math.min(jumpProgress, s.frames - 1);
    } else {
      frameIndex = (frameIndex + 1) % s.frames;
    }
  }

  // 若正在跳躍，根據進度計算垂直位移（用拋物線：t*(1-t)）
  if (jumping) {
    const total = s.frames - 1;
    const t = constrain(jumpProgress / total, 0, 1);
    // 使用一個彈跳曲線，最高點在 t=0.5
    const yOffset = jumpHeight * 4 * t * (1 - t);
    posY = basePosY - yOffset;
    // 跳躍結束
    if (jumpProgress >= total) {
      jumping = false;
      jumpProgress = 0;
      frameIndex = 0;
      posY = basePosY;
      // 結束後回復到對應動作
      currentSprite = moving ? 'walk' : 'stop';
    }
  } else {
    // 非跳躍時保持在地面
    posY = basePosY;
  }

  // 若正在推擠（空白鍵觸發）並且推擠動畫結束，生成發射物
  if (pushing) {
    const ps = sprites['push'];
    const totalP = ps.frames - 1;
    if (pushProgress >= totalP) {
      // 生成 light 發射物
      const ls = sprites['light'];
      // 設定發射物的顯示寬高（根據 light sprite 與畫面縮放）
      const sw_l = ls.frameW;
      const sh_l = ls.frameH;
      const maxScaleL = Math.min((width * 0.2) / sw_l, (height * 0.2) / sh_l);
      const dw_l = maxScaleL < 1 ? sw_l * maxScaleL : sw_l;
      const dh_l = maxScaleL < 1 ? sh_l * maxScaleL : sh_l;
      const spawnX = posX + (facing * (dw_l / 2 + 20));
      const spawnY = posY;
      projectiles.push({ x: spawnX, y: spawnY, dir: facing, sprite: ls, frameIndex: 0, progress: 0, sw: sw_l, sh: sh_l, dw: dw_l, dh: dh_l, speed: 6 });

      // 重設推擠狀態
      pushing = false;
      pushProgress = 0;
      frameIndex = 0;
      // 結束後回到站或走路
      currentSprite = moving ? 'walk' : 'stop';
    }
  }

  // 更新並繪製所有發射物
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    // 動畫更新
    const ld = p.sprite.delay || 6;
    if (frameCount % ld === 0) {
      p.progress++;
      p.frameIndex = p.progress % p.sprite.frames;
    }
    // 移動
    p.x += p.speed * p.dir;
    // 繪製（支援翻轉）
    push();
    translate(p.x, p.y);
    scale(p.dir, 1);
    const sx_l = p.frameIndex * p.sw;
    image(p.sprite.img, 0, 0, p.dw, p.dh, sx_l, 0, p.sw, p.sh);
    pop();

    // 移除畫面外的發射物
    if (p.x < -p.dw || p.x > width + p.dw) {
      projectiles.splice(i, 1);
    }
  }

  // 計算來源子影像位置與尺寸
  const sw = s.frameW;
  const sh = s.frameH;
  const sx = frameIndex * sw;
  const sy = 0;

  // 計算要顯示的目標尺寸，若太大則縮放到畫布 90% 內
  let dw = sw;
  let dh = sh;
  const maxScale = Math.min((width * 0.9) / sw, (height * 0.9) / sh);
  if (maxScale < 1) {
    dw = sw * maxScale;
    dh = sh * maxScale;
  }

  // 若為 jump sprite，調整 jumpHeight 以貼合顯示高度
  if (s === sprites['jump']) {
    // 讓跳躍高度為顯示高度的 60%（但不超過畫面高度的一半）
    jumpHeight = Math.min(dh * 0.6, height * 0.5);
  }

  // 限制角色不要移出畫面（以顯示尺寸的一半為邊界）
  const halfW = dw / 2;
  posX = constrain(posX, halfW, width - halfW);

  // 畫出（支援翻轉）
  push();
  translate(posX, posY);
  scale(facing, 1); // 若 facing 為 -1 則水平翻轉
  // 因為已 translate 到中心，image 的位置用 0,0
  image(s.img, 0, 0, dw, dh, sx, sy, sw, sh);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // 可選：保持角色垂直中心
  posY = height / 2;
  basePosY = posY;
}

function keyPressed() {
  // 使用 keyPressed 來偵測上鍵的按下（避免重複觸發）
  if (keyCode === UP_ARROW) {
    // 若正處於跳躍中，不重複觸發
    if (!jumping) {
      // 只有在 jump sprite 載入後才啟動跳躍
      const js = sprites['jump'];
      if (js.img && js.img.width) {
        jumping = true;
        jumpProgress = 0;
        frameIndex = 0;
        basePosY = posY; // 記錄起始地面位置
      } else {
        console.warn('跳躍 sprite 尚未載入，無法跳躍');
      }
    }
  }
  // 空白鍵觸發 push 動作
  if (keyCode === 32) {
    if (!pushing) {
      const ps = sprites['push'];
      if (ps.img && ps.img.width) {
        pushing = true;
        pushProgress = 0;
        frameIndex = 0;
        // 推擠期間也可能仍會左右移動
      } else {
        console.warn('push sprite 尚未載入，無法推擠');
      }
    }
  }
}
