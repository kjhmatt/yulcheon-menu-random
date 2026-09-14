/**
 * 고성능 대형 음식 이모지 비 애니메이션 (오프스크린 스프라이트 캐싱 적용)
 */
class EmojiRain {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.emojis = ['🍕', '🍔', '🍜', '🍣', '🍱', '🍛', '🥟', '🍗', '🍟', '🥘', '🍢', '🥩', '🌮', '🥗', '🍲', '🍙', '🍦', '🍩'];
    this.particles = [];
    this.maxParticles = 24; // 시각적 풍성함과 60fps 부드러움을 동시에 만족하는 최적 수
    this.emojiSprites = new Map(); // 오프스크린 캔버스 캐시
    this.animationId = null;
    this.opacity = 1.0;
    this.isPaused = false;
    this.lastTime = 0;

    this.init();
  }

  init() {
    this.buildEmojiSprites();
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.createParticle(true));
    }

    this.animate(performance.now());
  }

  // 18종류의 이모지를 오프스크린 캔버스에 1회만 고화질로 캐싱
  buildEmojiSprites() {
    const size = 96; // 캐시 텍스처 크기
    this.emojis.forEach((emoji) => {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = size;
      offCanvas.height = size;
      const offCtx = offCanvas.getContext('2d');
      offCtx.font = `${Math.floor(size * 0.72)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      offCtx.textAlign = 'center';
      offCtx.textBaseline = 'middle';
      offCtx.fillText(emoji, size / 2, size / 2 + 2);
      this.emojiSprites.set(emoji, offCanvas);
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    // 과도한 4K 렌더링 부하 방지 (최대 1.5배수로 캡핑하여 극상의 부드러움 확보)
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  createParticle(randomY = false) {
    return {
      emoji: this.emojis[Math.floor(Math.random() * this.emojis.length)],
      x: Math.random() * this.width,
      y: randomY ? Math.random() * this.height : -80 - Math.random() * 60,
      size: Math.random() * 26 + 46, // 46px ~ 72px 대형 크기
      speedY: Math.random() * 1.6 + 1.8,
      speedX: (Math.random() - 0.5) * 0.9,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      opacity: Math.random() * 0.4 + 0.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.025 + 0.015
    };
  }

  animate(currentTime) {
    if (this.isPaused) return;

    // 델타 타임 보정 (60Hz / 120Hz 모니터 모두 부드러운 동일 속도 유지)
    const dt = this.lastTime ? Math.min((currentTime - this.lastTime) / 16.67, 2.0) : 1.0;
    this.lastTime = currentTime;

    this.ctx.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      p.y += p.speedY * dt;
      p.wobble += p.wobbleSpeed * dt;
      p.x += (Math.sin(p.wobble) * 1.2 + p.speedX) * dt;
      p.rotation += p.rotationSpeed * dt;

      if (p.y > this.height + 90) {
        this.particles[i] = this.createParticle(false);
        continue;
      }

      const sprite = this.emojiSprites.get(p.emoji);
      if (!sprite) continue;

      this.ctx.save();
      this.ctx.globalAlpha = p.opacity * this.opacity;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      // text 대신 캐싱된 이미지 비트맵을 블릿하여 초고속 렌더링
      this.ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    }

    this.animationId = requestAnimationFrame((t) => this.animate(t));
  }

  fadeOut(duration = 500) {
    const startTime = performance.now();
    const startOpacity = this.opacity;

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      this.opacity = startOpacity * (1 - progress);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this.isPaused = true;
        if (this.animationId) {
          cancelAnimationFrame(this.animationId);
          this.animationId = null;
        }
        this.canvas.style.display = 'none';
      }
    };

    requestAnimationFrame(step);
  }

  fadeIn(duration = 600) {
    this.canvas.style.display = 'block';
    this.isPaused = false;
    this.lastTime = performance.now();
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      this.opacity = progress;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this.opacity = 1.0;
      }
    };

    this.animate(performance.now());
    requestAnimationFrame(step);
  }
}

window.EmojiRain = EmojiRain;
