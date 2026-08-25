import Phaser from 'phaser';
import { GAME, ITEMS, multiplierFor, type ItemConfig } from './config';
import { sfx, unlockAudio } from './sound';

export interface GameEndPayload {
  score: number;
  comboMax: number;
  durationSeconds: number;
  itemsCut: number;
  bombsHit: number;
  endedByBomb: boolean;
}

export interface GameCallbacks {
  onGameEnd: (data: GameEndPayload) => void;
  onScore?: (score: number) => void;
}

// Puente a nivel de módulo: React inyecta el callback antes de que Phaser cree
// la escena, evitando la gimnasia de pasar datos por el config de Phaser.
let callbacks: GameCallbacks | null = null;
export function setGameCallbacks(cb: GameCallbacks) {
  callbacks = cb;
}

const POSITIVE = ITEMS.filter((i) => i.positive);
const NEGATIVE = ITEMS.filter((i) => !i.positive);

function pickWeighted(pool: ItemConfig[]): ItemConfig {
  const total = pool.reduce((sum, i) => sum + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

interface ActiveItem {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Anillo pulsante: solo lo lleva la bomba. */
  halo?: Phaser.GameObjects.Image;
  config: ItemConfig;
  /** Radio real de este elemento (la bomba es más grande). */
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  sliced: boolean;
}

export class GameScene extends Phaser.Scene {
  private score = 0;
  private combo = 0;
  private comboMax = 0;
  private itemsCut = 0;
  private bombsHit = 0;
  private timeLeft = GAME.duration;
  private elapsedMs = 0;
  /** Reloj de pared del round: incluye pausas, para que coincida con el servidor. */
  private roundStartedAt = 0;
  private running = false;
  private started = false;
  private endedByBomb = false;

  private items: ActiveItem[] = [];
  private spritePool: Phaser.GameObjects.Image[] = [];
  private labelPool: Phaser.GameObjects.Text[] = [];

  private slash!: Phaser.GameObjects.Graphics;
  private trail: { x: number; y: number; life: number }[] = [];
  private pointerDown = false;
  private prevX = 0;
  private prevY = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;

  private spawnEvent: Phaser.Time.TimerEvent | null = null;
  private tickEvent: Phaser.Time.TimerEvent | null = null;
  private comboResetEvent: Phaser.Time.TimerEvent | null = null;
  private phaseIndex = 0;
  private lastTickSecond = -1;

  private W = 0;
  private H = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.resetState();

    this.buildBackground();
    this.buildTextures();
    this.buildHud();

    this.slash = this.add.graphics().setDepth(50);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      this.pointerDown = true;
      this.prevX = p.x;
      this.prevY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pointerDown && this.running) this.handleSlash(p.x, p.y);
    });
    this.input.on('pointerup', () => {
      this.pointerDown = false;
    });

    // Si el jugador cambia de app, congelamos todo para que no pierda por nada.
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseGame, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.resumeGame, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseGame, this);
      this.game.events.off(Phaser.Core.Events.FOCUS, this.resumeGame, this);
    });

    this.startCountdown();
  }

  private resetState() {
    this.score = 0;
    this.combo = 0;
    this.comboMax = 0;
    this.itemsCut = 0;
    this.bombsHit = 0;
    this.timeLeft = GAME.duration;
    this.elapsedMs = 0;
    this.running = false;
    this.started = false;
    this.endedByBomb = false;
    this.items = [];
    this.trail = [];
    this.phaseIndex = 0;
    this.lastTickSecond = -1;
  }

  // ── Construcción ──────────────────────────────────────────────────────────

  private buildBackground() {
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(GAME.colors.bg, GAME.colors.bg, GAME.colors.bgDeep, GAME.colors.bgDeep, 1);
    bg.fillRect(0, 0, this.W, this.H);

    // Estrellas dibujadas de una sola vez: un objeto, no 60.
    const stars = this.add.graphics().setDepth(-9);
    for (let i = 0; i < 70; i++) {
      stars.fillStyle(0xffffff, Math.random() * 0.5 + 0.1);
      stars.fillCircle(Math.random() * this.W, Math.random() * this.H * 0.75, Math.random() * 2 + 0.5);
    }
  }

  /**
   * Cada tipo de producto se dibuja UNA vez a textura. Después cada elemento en
   * pantalla es solo un Image reutilizado del pool: así el juego se mantiene a
   * 60 FPS incluso con muchos elementos volando.
   *
   * Lo que se corta y lo que no se distingue por FORMA, no solo por color:
   * los productos son discos limpios de color claro, y lo que resta puntos
   * lleva un anillo a rayas tipo cinta de peligro.
   */
  private buildTextures() {
    for (const item of ITEMS) {
      const key = `item-${item.type}`;
      if (this.textures.exists(key)) continue;

      const r = GAME.itemRadius * (item.scale ?? 1);
      const pad = 18;
      const size = (r + pad) * 2;
      const c = size / 2;

      const g = this.make.graphics({ x: 0, y: 0 }, false);

      // Halo: más intenso en lo peligroso, suave en los productos.
      g.fillStyle(item.glow, item.positive ? 0.22 : 0.32);
      g.fillCircle(c, c, r + pad * 0.85);

      // Cuerpo
      g.fillStyle(item.color, 1);
      g.fillCircle(c, c, r);

      // Brillo superior: le da volumen al disco
      g.fillStyle(0xffffff, item.positive ? 0.3 : 0.12);
      g.fillEllipse(c - r * 0.28, c - r * 0.33, r * 0.85, r * 0.5);

      if (item.positive) {
        g.lineStyle(3, 0xffffff, 0.75);
        g.strokeCircle(c, c, r);
      } else {
        // Anillo a rayas: alterna el color de peligro con blanco.
        const segments = 14;
        const stripe = item.endsGame ? 0xff2d2d : 0xffb020;
        for (let i = 0; i < segments; i++) {
          const a0 = (i / segments) * Math.PI * 2;
          const a1 = ((i + 0.55) / segments) * Math.PI * 2;
          g.lineStyle(7, i % 2 === 0 ? stripe : 0xffffff, 0.95);
          g.beginPath();
          g.arc(c, c, r - 3, a0, a1);
          g.strokePath();
        }
        g.lineStyle(2, 0x000000, 0.5);
        g.strokeCircle(c, c, r - 7);
      }

      g.generateTexture(key, size, size);
      g.destroy();
    }

    // Halo pulsante que solo usa la bomba: imposible confundirla.
    if (!this.textures.exists('bomb-halo')) {
      const r = GAME.itemRadius * 1.18;
      const size = (r + 26) * 2;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(6, 0xff2d2d, 0.9);
      g.strokeCircle(size / 2, size / 2, r + 12);
      g.generateTexture('bomb-halo', size, size);
      g.destroy();
    }
  }

  private buildHud() {
    this.add
      .graphics()
      .setDepth(40)
      .fillStyle(0xffffff, 0.15)
      .fillRoundedRect(16, 16, this.W - 32, 12, 6);

    this.timerBar = this.add.graphics().setDepth(41);

    this.scoreText = this.add
      .text(16, 36, '0', {
        fontFamily: 'Bangers, Impact, sans-serif',
        fontSize: '52px',
        color: '#F5C518',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setDepth(42);

    this.timerText = this.add
      .text(this.W / 2, 34, String(GAME.duration), {
        fontFamily: 'Bangers, Impact, sans-serif',
        fontSize: '52px',
        color: '#FFFFFF',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(42);

    this.comboText = this.add
      .text(this.W - 16, 36, '', {
        fontFamily: 'Bangers, Impact, sans-serif',
        fontSize: '34px',
        color: '#FF6B35',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(42);
  }

  /** 3 · 2 · 1 · ¡YA! antes de que caiga el primer producto. */
  private startCountdown() {
    const big = this.add
      .text(this.W / 2, this.H / 2, '3', {
        fontFamily: 'Bangers, Impact, sans-serif',
        fontSize: '120px',
        color: '#F5C518',
        stroke: '#000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(60);

    const steps = ['3', '2', '1', '¡YA!'];
    let i = 0;

    const advance = () => {
      big.setText(steps[i]);
      big.setScale(0.6);
      big.setAlpha(1);
      sfx.countdown(i === 3);
      this.tweens.add({ targets: big, scale: 1.15, alpha: i === 3 ? 0 : 0.9, duration: 420, ease: 'Back.easeOut' });
      i++;
      if (i < steps.length) {
        this.time.delayedCall(600, advance);
      } else {
        this.time.delayedCall(500, () => {
          big.destroy();
          this.beginRound();
        });
      }
    };

    advance();
  }

  private beginRound() {
    this.started = true;
    this.running = true;
    this.roundStartedAt = Date.now();
    this.applyPhase(0);

    this.tickEvent = this.time.addEvent({
      delay: 1000,
      repeat: GAME.duration - 1,
      callback: () => {
        if (!this.running) return;
        this.timeLeft = Math.max(0, this.timeLeft - 1);
        this.timerText.setText(String(this.timeLeft));

        if (this.timeLeft <= 10) this.timerText.setColor('#FF4444');
        if (this.timeLeft <= 5 && this.timeLeft > 0 && this.timeLeft !== this.lastTickSecond) {
          this.lastTickSecond = this.timeLeft;
          sfx.tick();
          this.tweens.add({ targets: this.timerText, scale: 1.25, duration: 120, yoyo: true });
        }
        if (this.timeLeft <= 0) this.endGame(false);
      },
    });
  }

  private applyPhase(index: number) {
    const phase = GAME.spawnPhases[index];
    if (!phase) return;
    this.phaseIndex = index;
    this.spawnEvent?.destroy();
    this.spawnEvent = this.time.addEvent({
      delay: phase.delay,
      loop: true,
      callback: () => {
        if (!this.running) return;
        const burst = 1 + Math.floor(Math.random() * phase.maxBurst);
        for (let i = 0; i < burst; i++) {
          this.time.delayedCall(i * 90, () => this.spawnItem());
        }
      },
    });
  }

  // ── Pool ──────────────────────────────────────────────────────────────────

  private takeSprite(key: string): Phaser.GameObjects.Image {
    const sprite = this.spritePool.pop();
    if (sprite) {
      sprite.setTexture(key).setActive(true).setVisible(true).setAlpha(1).setScale(1);
      return sprite;
    }
    return this.add.image(0, 0, key).setDepth(10);
  }

  private takeLabel(text: string): Phaser.GameObjects.Text {
    const label = this.labelPool.pop();
    if (label) {
      label.setText(text).setActive(true).setVisible(true).setAlpha(1).setScale(1);
      return label;
    }
    return this.add
      .text(0, 0, text, { fontSize: `${GAME.emojiSize}px` })
      .setOrigin(0.5)
      .setDepth(11);
  }

  private release(item: ActiveItem) {
    item.sprite.setActive(false).setVisible(false);
    item.label.setActive(false).setVisible(false);
    this.spritePool.push(item.sprite);
    this.labelPool.push(item.label);
    if (item.halo) {
      this.tweens.killTweensOf(item.halo);
      item.halo.destroy();
      item.halo = undefined;
    }
  }

  private spawnItem() {
    if (!this.running) return;

    const config = Math.random() < GAME.negativeChance ? pickWeighted(NEGATIVE) : pickWeighted(POSITIVE);
    const radius = GAME.itemRadius * (config.scale ?? 1);
    const x = Phaser.Math.Between(radius + 12, this.W - radius - 12);
    const y = this.H + 90;

    const sprite = this.takeSprite(`item-${config.type}`);
    sprite.setPosition(x, y).setRotation(0);

    const label = this.takeLabel(config.emoji);
    label.setPosition(x, y).setScale(config.scale ?? 1);

    // La bomba, además, late: es la única que puede acabar la partida.
    let halo: Phaser.GameObjects.Image | undefined;
    if (config.endsGame) {
      halo = this.add.image(x, y, 'bomb-halo').setDepth(9).setAlpha(0.9);
      this.tweens.add({
        targets: halo,
        scale: 1.22,
        alpha: 0.35,
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Altura del salto proporcional a la pantalla: en un celular alto no se
    // pierde arriba, y en uno pequeño sigue llegando a la mitad.
    const impulse = -Math.sqrt(2 * GAME.gravity * this.H * Phaser.Math.FloatBetween(0.55, 0.8));

    this.items.push({
      sprite,
      label,
      halo,
      config,
      radius,
      x,
      y,
      vx: Phaser.Math.Between(-90, 90),
      vy: impulse,
      rot: 0,
      rotSpeed: Phaser.Math.FloatBetween(-3.5, 3.5),
      sliced: false,
    });
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (!this.started) return;

    const dt = Math.min(delta, 50) / 1000;

    if (this.running) {
      this.elapsedMs += delta;

      // Cambio de tramo de dificultad
      const seconds = this.elapsedMs / 1000;
      const next = GAME.spawnPhases[this.phaseIndex + 1];
      if (next && seconds >= next.atSecond) this.applyPhase(this.phaseIndex + 1);

      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        if (item.sliced) {
          this.items.splice(i, 1);
          continue;
        }

        item.vy += GAME.gravity * dt;
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.rot += item.rotSpeed * dt;

        item.sprite.setPosition(item.x, item.y).setRotation(item.rot);
        item.label.setPosition(item.x, item.y);
        item.halo?.setPosition(item.x, item.y);

        if (item.y > this.H + 140) {
          this.release(item);
          this.items.splice(i, 1);
        }
      }
    }

    this.drawTimerBar();
    this.drawTrail(dt);
  }

  private drawTimerBar() {
    this.timerBar.clear();
    const progress = this.timeLeft / GAME.duration;
    const width = (this.W - 32) * progress;
    if (width <= 0) return;
    const color = progress > 0.5 ? GAME.colors.primary : progress > 0.25 ? 0xff8c42 : GAME.colors.danger;
    this.timerBar.fillStyle(color, 1);
    this.timerBar.fillRoundedRect(16, 16, width, 12, 6);
  }

  private drawTrail(dt: number) {
    this.slash.clear();
    if (this.trail.length > 1) {
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        const alpha = (i / this.trail.length) * 0.85 * b.life;
        this.slash.lineStyle(6 * alpha + 2, 0xffffff, alpha);
        this.slash.beginPath();
        this.slash.moveTo(a.x, a.y);
        this.slash.lineTo(b.x, b.y);
        this.slash.strokePath();
      }
    }
    for (const point of this.trail) point.life -= dt * 3.2;
    this.trail = this.trail.filter((p) => p.life > 0);
  }

  // ── Corte ─────────────────────────────────────────────────────────────────

  private handleSlash(px: number, py: number) {
    this.trail.push({ x: px, y: py, life: 1 });
    if (this.trail.length > 16) this.trail.shift();

    for (const item of this.items) {
      if (item.sliced) continue;
      if (lineHitsCircle(this.prevX, this.prevY, px, py, item.x, item.y, item.radius)) {
        this.sliceItem(item);
      }
    }

    this.prevX = px;
    this.prevY = py;
  }

  private sliceItem(item: ActiveItem) {
    item.sliced = true;
    const { config } = item;

    if (config.endsGame) {
      this.bombsHit++;
      this.endedByBomb = true;
      sfx.bomb();
      this.bombEffect(item.x, item.y);
      this.release(item);
      this.endGame(true);
      return;
    }

    const mult = multiplierFor(this.combo);
    const delta = Math.round(config.points * (config.positive ? mult : 1));
    this.score = Math.max(0, this.score + delta);
    this.scoreText.setText(String(this.score));
    callbacks?.onScore?.(this.score);

    this.particles(item.x, item.y, config.color, config.positive ? 12 : 8);
    this.popup(item.x, item.y, delta);

    if (config.positive) {
      sfx.slice(this.combo);
      this.itemsCut++;
      this.combo++;
      this.comboMax = Math.max(this.comboMax, this.combo);

      this.comboResetEvent?.destroy();
      this.comboResetEvent = this.time.addEvent({
        delay: GAME.combo.resetMs,
        callback: () => {
          this.combo = 0;
          this.comboText.setText('');
        },
      });

      if (this.combo >= 3) {
        const m = multiplierFor(this.combo);
        this.comboText.setText(`x${m.toFixed(1)} COMBO!`);
        this.tweens.add({ targets: this.comboText, scale: 1.25, duration: 90, yoyo: true });
        if (this.combo === 3 || this.combo === 5 || this.combo === 10) sfx.combo(this.combo);
      }
    } else {
      sfx.bad();
      this.combo = 0;
      this.comboText.setText('');
      this.cameras.main.shake(120, 0.006);
    }

    this.release(item);
  }

  private popup(x: number, y: number, delta: number) {
    const text = this.add
      .text(x, y - 10, delta > 0 ? `+${delta}` : String(delta), {
        fontFamily: 'Bangers, sans-serif',
        fontSize: '30px',
        color: delta > 0 ? '#F5C518' : '#FF4444',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(45);

    this.tweens.add({
      targets: text,
      y: y - 90,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private particles(x: number, y: number, color: number, count: number) {
    const key = `spark-${color}`;
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color, 1);
      g.fillCircle(8, 8, 7);
      g.generateTexture(key, 16, 16);
      g.destroy();
    }

    const emitter = this.add.particles(x, y, key, {
      speed: { min: 60, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 260,
      lifespan: { min: 300, max: 620 },
      quantity: count,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(count);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  private bombEffect(x: number, y: number) {
    const ring = this.add.graphics().setDepth(55);
    ring.lineStyle(6, 0xff0000, 1);
    ring.strokeCircle(x, y, GAME.itemRadius * 1.18);
    this.tweens.add({
      targets: ring,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });

    const flash = this.add.graphics().setDepth(54);
    flash.fillStyle(0xff0000, 0.45);
    flash.fillRect(0, 0, this.W, this.H);
    this.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });

    this.cameras.main.shake(300, 0.02);
    this.particles(x, y, 0xff3300, 20);
  }

  // ── Pausa y cierre ────────────────────────────────────────────────────────

  private pauseGame() {
    if (!this.running) return;
    this.running = false;
    this.time.paused = true;
    if (!this.scene.isPaused()) {
      this.add
        .text(this.W / 2, this.H / 2, 'PAUSA', {
          fontFamily: 'Bangers, Impact, sans-serif',
          fontSize: '64px',
          color: '#FFFFFF',
          stroke: '#000',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(70)
        .setName('pause-label');
    }
  }

  private resumeGame() {
    if (!this.started || this.timeLeft <= 0) return;
    this.children.getByName('pause-label')?.destroy();
    this.time.paused = false;
    this.running = true;
  }

  private endGame(byBomb: boolean) {
    if (!this.started || (!this.running && this.timeLeft > 0 && !byBomb)) return;
    this.running = false;

    this.spawnEvent?.destroy();
    this.tickEvent?.destroy();
    this.comboResetEvent?.destroy();
    this.spawnEvent = null;
    this.tickEvent = null;
    this.comboResetEvent = null;

    for (const item of this.items) this.release(item);
    this.items = [];

    if (!byBomb) sfx.gameOver();

    const overlay = this.add.graphics().setDepth(58);
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, this.W, this.H);
    overlay.setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 1, duration: 350 });

    const label = this.add
      .text(this.W / 2, this.H / 2, byBomb ? '¡BOMBA!' : '¡TIEMPO!', {
        fontFamily: 'Bangers, Impact, sans-serif',
        fontSize: '80px',
        color: byBomb ? '#FF4444' : '#F5C518',
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(59);

    this.tweens.add({ targets: label, alpha: 1, scale: 1.15, duration: 280, yoyo: true, hold: 500 });

    // Duración en reloj de pared (incluye pausas) y acotada a la duración
    // oficial: si el jugador se cambió de app, no queremos que el servidor lo
    // castigue por reportar menos segundos de los que dura la partida.
    const wallClock = (Date.now() - this.roundStartedAt) / 1000;
    const duration = byBomb
      ? Math.max(1, Math.min(GAME.duration, Math.round(wallClock)))
      : GAME.duration;

    this.time.delayedCall(950, () => {
      callbacks?.onGameEnd({
        score: this.score,
        comboMax: this.comboMax,
        durationSeconds: duration,
        itemsCut: this.itemsCut,
        bombsHit: this.bombsHit,
        endedByBomb: byBomb,
      });
    });
  }
}

/** ¿El segmento (x1,y1)-(x2,y2) toca el círculo de centro (cx,cy) y radio r? */
function lineHitsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return Math.hypot(fx, fy) <= r;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;

  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}
