/**
 * A canvas-backed Liquid Glass material for the existing DOM controls.
 * Original WebGL2 implementation, informed by AndroidLiquidGlass's edge lens
 * and Liquid Glass Studio's SDF / two-pass blur rendering architecture.
 * See liquid-glass.md for source links and backdrop limitations.
 */
class LiquidGlass {
  constructor(canvasId, background) {
    this.canvas = document.getElementById(canvasId);
    this.background = background;
    this.scene = document.createElement('canvas');
    this.ctx = this.scene.getContext('2d', { alpha: false });
    this.mapSnapshot = document.createElement('canvas');
    this.mapCtx = this.mapSnapshot.getContext('2d');
    this.surfaces = [...document.querySelectorAll('.glass-card, .github-corner-link, .compass-btn, .btn-recommend, .btn-sub-action')];
    this.controls = new Map(this.surfaces.filter(surface => !surface.classList.contains('glass-card')).map(surface => [surface, {
      progress: 0, velocity: 0, target: 0, x: 0, y: 0, startX: 0, startY: 0
    }]));
    this.resources = [];
    this.events = new AbortController();
    this.pointer = { x: 0.35, y: 0.2 };
    this.light = { ...this.pointer };
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.lastCapture = -Infinity;
    this.lastDraw = -Infinity;
    this.transitionUntil = 0;
    this.onMapRender = () => {
      if (!this.enabled || document.hidden) return;
      try {
        this.mapCtx.clearRect(0, 0, this.mapSnapshot.width, this.mapSnapshot.height);
        this.mapCtx.drawImage(this.map.getCanvas(), 0, 0, this.mapSnapshot.width, this.mapSnapshot.height);
        this.capture();
      } catch (error) { this.fail(error); }
    };

    this.gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, powerPreference: 'low-power'
    });
    if (!this.gl || !this.ctx) return;

    try {
      const options = { signal: this.events.signal };
      window.addEventListener('resize', () => this.safeResize(), options);
      window.addEventListener('pointermove', (event) => {
        this.pointer.x = event.clientX / innerWidth;
        this.pointer.y = event.clientY / innerHeight;
        for (const [surface, state] of this.controls) {
          if (state.target) {
            const limit = surface.offsetHeight;
            state.x = limit * Math.tanh(0.05 * (event.clientX - state.startX) / limit);
            state.y = limit * Math.tanh(0.05 * (event.clientY - state.startY) / limit);
          }
        }
        this.requestDraw();
      }, { ...options, passive: true });
      document.addEventListener('pointerdown', (event) => {
        const surface = event.target.closest('button, a');
        const state = this.controls.get(surface);
        if (!state || surface.disabled) return;
        Object.assign(state, { target: 1, startX: event.clientX, startY: event.clientY, x: 0, y: 0 });
        this.requestDraw();
      }, options);
      const release = () => {
        for (const state of this.controls.values()) state.target = 0;
        this.requestDraw();
      };
      document.addEventListener('pointerup', release, options);
      document.addEventListener('pointercancel', release, options);
      window.addEventListener('blur', release, options);
      document.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        const state = this.controls.get(document.activeElement);
        if (state) { state.target = 1; this.requestDraw(); }
      }, options);
      document.addEventListener('keyup', release, options);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          cancelAnimationFrame(this.frame);
          this.frame = null;
        } else this.capture(true);
      }, options);
      document.addEventListener('transitionrun', (event) => {
        if (this.surfaces.includes(event.target) || event.target.id === 'map-container') {
          this.transitionUntil = performance.now() + 900;
          this.requestDraw();
        }
      }, options);
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.disable();
        // The browser invalidates every resource when the context is lost.
        this.resources = [];
      }, options);
      this.canvas.addEventListener('webglcontextrestored', () => {
        if (this.shaders) {
          try { this.initialize(); } catch (error) { this.fail(error); }
        }
      }, options);
      window.addEventListener('pagehide', (event) => {
        if (!event.persisted) this.destroy();
      }, options);
      // Keep CSS glass visible until every shader is loaded and a frame succeeds.
      this.ready = LiquidGlass.loadShaders().then(shaders => {
        if (this.destroyed) return;
        this.shaders = shaders;
        if (!this.gl.isContextLost()) this.initialize();
      }).catch(error => {
        if (!this.destroyed) this.fail(error);
      });
    } catch (error) { this.fail(error); }
  }

  static loadShaders() {
    if (!this.shaderPromise) {
      this.shaderPromise = Promise.all(['vertex', 'copy', 'blur', 'glass'].map(async name => {
        const response = await fetch(new URL(`${name}.glsl`, this.shaderRoot));
        if (!response.ok) throw new Error(`Failed to load ${name} shader (${response.status})`);
        return [name, await response.text()];
      })).then(Object.fromEntries).catch(error => {
        this.shaderPromise = null;
        throw error;
      });
    }
    return this.shaderPromise;
  }

  initialize() {
    const gl = this.gl;
    this.blur = this.program(this.shaders.blur);
    this.copy = this.program(this.shaders.copy);
    this.glass = this.program(this.shaders.glass);
    this.vao = gl.createVertexArray();
    this.resources.push(['VertexArray', this.vao]);
    gl.bindVertexArray(this.vao);
    this.original = this.texture();
    this.passes = [this.target(), this.target()];
    this.exported = this.target();
    this.controlPasses = [this.target(), this.target()];
    this.enabled = true;
    this.resize();
  }

  program(fragment) {
    const gl = this.gl;
    const program = gl.createProgram();
    this.resources.push(['Program', program]);
    for (const [type, source] of [[gl.VERTEX_SHADER, this.shaders.vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      const log = gl.getShaderInfoLog(shader);
      if (compiled) gl.attachShader(program, shader);
      gl.deleteShader(shader);
      if (!compiled) throw new Error(log);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let index = 0; index < count; index++) {
      const { name } = gl.getActiveUniform(program, index);
      uniforms[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  texture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    this.resources.push(['Texture', texture]);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  target() {
    const gl = this.gl;
    const texture = this.texture();
    const framebuffer = gl.createFramebuffer();
    this.resources.push(['Framebuffer', framebuffer]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer };
  }

  safeResize() {
    try { this.resize(); } catch (error) { this.fail(error); }
  }

  resize() {
    if (!this.enabled) return;
    this.width = innerWidth;
    this.height = innerHeight;
    const gl = this.gl;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.dpr = Math.min(devicePixelRatio || 1, LiquidGlass.maxDpr, limit / this.width, limit / this.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    // Bound the offscreen pixel budget on high-DPR phones. DOM content and the
    // map remain native-resolution; only the glass material is capped.
    this.scene.width = this.canvas.width;
    this.scene.height = this.canvas.height;
    this.mapSnapshot.width = this.scene.width;
    this.mapSnapshot.height = this.scene.height;
    this.baseColor = getComputedStyle(document.body).backgroundColor;
    this.kernels = new Map();
    this.dprQuery && (this.dprQuery.onchange = null);
    this.dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.dprQuery.onchange = () => this.safeResize();
    for (const { texture, framebuffer } of [...this.passes, this.exported, ...this.controlPasses]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.scene.width, this.scene.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        this.fail(new Error('Glass framebuffer is unavailable'));
        return;
      }
    }
    this.capture(true);
    this.map?.triggerRepaint();
  }

  setMap(map) {
    if (this.map) this.map.off('render', this.onMapRender);
    this.map = map;
    // Read the map in its render event, before WebGL discards its drawing buffer.
    // This avoids enabling preserveDrawingBuffer on the map's context.
    if (this.map) this.map.on('render', this.onMapRender);
    this.requestDraw();
  }

  setDestinationMarker(element) {
    this.markerObserver?.disconnect();
    this.markerResizeObserver?.disconnect();
    this.surfaces = this.surfaces.filter(surface => !surface.classList.contains('dest-bubble-card'));
    this.surfaces.unshift(element.querySelector('.dest-bubble-card'));
    this.markerObserver = new MutationObserver(() => this.capture(true));
    this.markerObserver.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    this.markerResizeObserver = new ResizeObserver(() => this.capture(true));
    this.markerResizeObserver.observe(element);
    this.capture(true);
  }

  capture(force = false) {
    if (!this.enabled || document.hidden) return;
    const now = performance.now();
    if (!force && now - this.lastCapture < LiquidGlass.captureInterval) return;
    this.lastCapture = now;
    try {
      const ctx = this.ctx;
      ctx.setTransform(this.scene.width / this.width, 0, 0, this.scene.height / this.height, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.baseColor;
      ctx.fillRect(0, 0, this.width, this.height);
      if (this.map) {
        ctx.globalAlpha = Number(getComputedStyle(document.getElementById('map-container')).opacity);
        ctx.drawImage(this.mapSnapshot, 0, 0, this.width, this.height);
      }
      ctx.globalAlpha = 1;
      if (!this.background.isPaused || this.background.opacity > 0) {
        ctx.drawImage(this.background.canvas, 0, 0, this.width, this.height);
      }
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.original);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
      this.blurScene(this.original, this.passes, LiquidGlass.material.cardBlur, true, this.surfaces, true);
      this.hasScene = true;
      this.requestDraw();
    } catch (error) { this.fail(error); }
  }

  copyBackdrop(input, framebuffer) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, this.scene.width, this.scene.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.copy.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.copy.uniforms.u_texture, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  blurScene(input, passes, sigma, vibrancy, surfaces, fillOutside = false) {
    const gl = this.gl;
    const u = this.blur.uniforms;
    if (fillOutside) {
      // Cards can move between the 30 Hz backdrop captures. Seed both targets
      // with this frame's colors so those positions never sample zeroed or
      // stale regions. The expensive Gaussian work still stays scissored.
      for (const pass of passes) this.copyBackdrop(input, pass.framebuffer);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.blur.program);
    gl.uniform1i(u.u_texture, 0);
    if (!this.kernels.has(sigma)) {
      const pixelSigma = sigma * this.dpr;
      const radius = Math.min(126, Math.ceil(pixelSigma * 3));
      const kernel = Array.from({ length: radius + 1 }, (_, i) => Math.exp(-0.5 * (i / pixelSigma) ** 2));
      const sum = kernel[0] + 2 * kernel.slice(1).reduce((total, weight) => total + weight, 0);
      const weights = new Float32Array(64);
      const offsets = new Float32Array(64);
      weights[0] = kernel[0] / sum;
      let count = 1;
      for (let i = 1; i <= radius; i += 2) {
        const a = kernel[i], b = kernel[i + 1] || 0;
        weights[count] = (a + b) / sum;
        offsets[count++] = i + b / (a + b);
      }
      this.kernels.set(sigma, { weights, offsets, count });
    }
    const kernel = this.kernels.get(sigma);
    gl.uniform1fv(u.u_weights, kernel.weights);
    gl.uniform1fv(u.u_offsets, kernel.offsets);
    gl.uniform1i(u.u_count, kernel.count);
    gl.viewport(0, 0, this.scene.width, this.scene.height);
    for (let index = 0; index < 2; index++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, passes[index].framebuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, index === 0 ? input : passes[0].texture);
      gl.uniform1f(u.u_vibrancy, index === 0 && vibrancy ? 1.5 : 1);
      gl.uniform2f(u.u_step, index === 0 ? 1 / this.scene.width : 0, index === 1 ? 1 / this.scene.height : 0);
      gl.enable(gl.SCISSOR_TEST);
      for (const surface of surfaces) {
        const rect = surface.getBoundingClientRect();
        if (rect.width && rect.height) {
          // Includes the lens displacement and Gaussian support beyond the rim.
          this.scissor(rect, 80);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  scissor(rect, padding = 2) {
    const left = Math.max(0, Math.floor((rect.left - padding) * this.dpr));
    const bottom = Math.max(0, Math.floor((this.height - rect.bottom - padding) * this.dpr));
    const right = Math.min(this.canvas.width, Math.ceil((rect.right + padding) * this.dpr));
    const top = Math.min(this.canvas.height, Math.ceil((this.height - rect.top + padding) * this.dpr));
    this.gl.scissor(left, bottom, Math.max(0, right - left), Math.max(0, top - bottom));
  }

  requestDraw() {
    if (!this.enabled || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = null;
      if (time - this.lastDraw < 1000 / 60 - 0.5) { this.requestDraw(); return; }
      this.lastDraw = time;
      try { this.draw(); } catch (error) { this.fail(error); }
      const unsettled = Math.abs(this.light.x - this.pointer.x) + Math.abs(this.light.y - this.pointer.y) > 0.002
        || [...this.controls.values()].some(state => Math.abs(state.target - state.progress) + Math.abs(state.velocity) > 0.002);
      if (time < this.transitionUntil) {
        if (this.map) this.map.triggerRepaint();
        else this.capture(true);
      }
      if (unsettled || time < this.transitionUntil) this.requestDraw();
    });
  }

  draw() {
    if (!this.enabled || !this.hasScene) return;
    const gl = this.gl;
    const spring = this.reducedMotion.matches ? 1 : 0.16;
    this.light.x += (this.pointer.x - this.light.x) * spring;
    this.light.y += (this.pointer.y - this.light.y) * spring;
    const now = performance.now();
    const dt = Math.min((now - (this.interactionTime || now - 16)) / 1000, 0.032);
    this.interactionTime = now;
    for (const [surface, state] of this.controls) {
      if (this.reducedMotion.matches) {
        state.progress = state.target;
        state.velocity = 0;
      } else {
        state.velocity += ((state.target - state.progress) * 300 - state.velocity * 20) * dt;
        state.progress += state.velocity * dt;
      }
      if (Math.abs(state.target - state.progress) + Math.abs(state.velocity) < 0.002) {
        state.progress = state.target;
        state.velocity = 0;
      }
      const progress = Math.max(0, state.progress);
      const scale = this.reducedMotion.matches ? 1 : 1 + 4 / Math.max(surface.offsetHeight, 1) * progress;
      surface.style.setProperty('--press-scale', scale);
      surface.style.setProperty('--press-x', `${state.x * progress}px`);
      surface.style.setProperty('--press-y', `${state.y * progress}px`);
    }

    const outer = this.surfaces.filter(surface => !surface.closest('.card-view-layer'));
    const inner = this.surfaces.filter(surface => surface.closest('.card-view-layer'));
    this.copyBackdrop(this.original, this.exported.framebuffer);
    // Export only the finished outer material, excluding its DOM content and
    // children. This is the docs' exportedBackdrop pattern, without feedback.
    this.drawSurfaces(outer, this.original, this.passes[1].texture);
    this.blurScene(this.exported.texture, this.controlPasses, LiquidGlass.material.controlBlur, false, inner);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawSurfaces(outer, this.original, this.passes[1].texture);
    this.drawSurfaces(inner, this.exported.texture, this.controlPasses[1].texture);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Glass render failed');
    // A dynamically created marker keeps its dense CSS fill until its own
    // surface has rendered, even if the rest of the UI already uses WebGL.
    for (const surface of outer) {
      if (surface.classList.contains('dest-bubble-card')) surface.classList.add('webgl-marker');
    }
    document.documentElement.classList.add('webgl-glass');
  }

  drawSurfaces(surfaces, original, blurred) {
    const gl = this.gl;
    const u = this.glass.uniforms;
    gl.useProgram(this.glass.program);
    gl.bindVertexArray(this.vao);
    for (const [unit, texture] of [[0, original], [1, blurred]]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    gl.uniform1i(u.u_scene, 0);
    gl.uniform1i(u.u_blurred, 1);
    gl.uniform2f(u.u_viewport, this.width, this.height);
    gl.uniform1f(u.u_dpr, this.dpr);
    gl.uniform2f(u.u_light, this.light.x, this.light.y);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    for (const surface of surfaces) {
      const style = getComputedStyle(surface);
      const opacity = Number(style.opacity);
      if (opacity < 0.01 || style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const scale = rect.width / surface.offsetWidth;
      const radius = Math.min((parseFloat(style.borderTopLeftRadius) || 0) * scale, rect.width / 2, rect.height / 2);
      const card = surface.classList.contains('glass-card');
      const marker = surface.classList.contains('dest-bubble-card');
      const state = this.controls.get(surface);
      const tinted = surface.classList.contains('btn-recommend');
      const action = surface.classList.contains('btn-sub-action');
      gl.uniform4f(u.u_rect, rect.left, rect.top, rect.width, rect.height);
      gl.uniform1f(u.u_radius, radius);
      gl.uniform1f(u.u_opacity, opacity);
      gl.uniform1f(u.u_roundness, card && CSS.supports('corner-shape', 'superellipse(1.5)') ? Math.SQRT2 * 2 : 2);
      gl.uniform3f(u.u_lens, Math.min(card ? 24 : 12, radius),
        card ? LiquidGlass.material.cardRefraction : LiquidGlass.material.controlRefraction, card ? 0.15 : 0);
      gl.uniform4f(u.u_tint, tinted ? 0 : 1, tinted ? 0.478 : 1, 1,
        tinted ? 0.82 : card ? (surface.classList.contains('card-popup') ? LiquidGlass.material.popupTint : LiquidGlass.material.cardTint)
          : marker ? LiquidGlass.material.markerTint : action ? LiquidGlass.material.actionTint : LiquidGlass.material.controlTint);
      gl.uniform1f(u.u_blurMix, card ? LiquidGlass.material.cardBlurMix : 1);
      gl.uniform1f(u.u_press, state ? Math.max(0, state.progress) : 0);
      gl.uniform1f(u.u_vibrancy, surface.closest('.card-view-layer') ? 1 : 1.5);
      // Match Kyant's clipped stroke: ceil(0.5dp in device pixels), with a
      // 0.25dp blur. No CSS inset stroke is composited on top of this material.
      gl.uniform1f(u.u_highlightWidth, card || marker ? 0 : Math.ceil(0.5 * this.dpr) / this.dpr);
      gl.uniform2f(u.u_pressPosition, state?.startX || rect.left + rect.width * 0.5, state?.startY || rect.top + rect.height * 0.5);
      this.scissor(rect);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  disable() {
    this.enabled = false;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    for (const [surface, state] of this.controls) {
      for (const property of ['--press-scale', '--press-x', '--press-y']) surface.style.removeProperty(property);
      Object.assign(state, { progress: 0, velocity: 0, target: 0 });
    }
    document.documentElement.classList.remove('webgl-glass');
  }

  fail(error) {
    this.disable();
    console.warn('Liquid Glass: using the CSS fallback.', error);
    this.release();
  }

  release() {
    for (const [type, resource] of this.resources) this.gl[`delete${type}`](resource);
    this.resources = [];
  }

  destroy() {
    this.markerObserver?.disconnect();
    this.markerResizeObserver?.disconnect();
    this.destroyed = true;
    this.disable();
    this.events.abort();
    if (this.dprQuery) this.dprQuery.onchange = null;
    if (this.map) this.map.off('render', this.onMapRender);
    this.release();
  }
}

// Resolve from this script, so static hosting under a subdirectory also works.
LiquidGlass.shaderRoot = new URL('shaders/', document.currentScript.src);
LiquidGlass.maxDpr = 1.5;
LiquidGlass.captureInterval = 1000 / 30;
// Balance text readability and transparency with a gentler reference edge lens.
LiquidGlass.material = Object.freeze({
  cardBlur: 3, cardBlurMix: 0.775, cardTint: 0.11, popupTint: 0.32,
  controlBlur: 2, controlTint: 0.19, actionTint: 0.56, markerTint: 0.50,
  cardRefraction: 36, controlRefraction: 18
});

window.LiquidGlass = LiquidGlass;
