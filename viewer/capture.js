(async () => {
  const query = new URLSearchParams(window.location.search);
  const ASSET_PATH = query.get('asset');
  const CELL_WIDTH = 192;
  const CELL_HEIGHT = 208;
  const PADDING_X = 14;
  const PADDING_Y = 10;

  if (!ASSET_PATH) {
    throw new Error('Missing ?asset=/assets/current/model.skel');
  }

  const app = new PIXI.Application({
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    backgroundAlpha: 0,
    antialias: true,
    preserveDrawingBuffer: true,
    resolution: 1,
  });

  document.querySelector('#app').appendChild(app.view);
  app.stop();

  const resource = await PIXI.Assets.load(ASSET_PATH);
  const Spine = PIXI.spine38?.Spine ?? PIXI.spine.Spine;
  const spine = new Spine(resource.spineData);
  spine.autoUpdate = false;
  app.stage.addChild(spine);

  const animations = spine.spineData.animations.map((animation) => animation.name);
  const animationInfo = spine.spineData.animations.map((animation) => ({
    name: animation.name,
    duration: animation.duration,
    timelines: animation.timelines?.length ?? 0,
  }));

  function applyPose(animation, time) {
    spine.skeleton.setToSetupPose();
    spine.state.clearTracks();
    spine.state.setAnimation(0, animation, true);
    spine.update(time);
  }

  function measureFit(animation, duration) {
    spine.scale.set(1, 1);
    spine.position.set(0, 0);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < 16; index += 1) {
      applyPose(animation, (duration * index) / 16);
      const bounds = spine.getLocalBounds();
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    const sourceWidth = Math.max(1, maxX - minX);
    const sourceHeight = Math.max(1, maxY - minY);
    const scale = Math.min(
      (CELL_WIDTH - PADDING_X * 2) / sourceWidth,
      (CELL_HEIGHT - PADDING_Y * 2) / sourceHeight,
    );

    return {
      scale,
      visualCenterX: minX + sourceWidth / 2,
      visualBottomY: maxY,
    };
  }

  function applyFit(fit, mirror) {
    spine.scale.set(mirror ? -fit.scale : fit.scale, fit.scale);
    spine.position.set(
      CELL_WIDTH / 2 - fit.visualCenterX * spine.scale.x,
      CELL_HEIGHT - PADDING_Y - fit.visualBottomY * fit.scale,
    );
  }

  function fitForAnimation(animation, duration, mirror) {
    applyFit(measureFit(animation, duration), mirror);
  }

  async function capture(options) {
    const animationData = spine.spineData.findAnimation(options.animation);
    if (!animationData) {
      throw new Error(`Unknown animation: ${options.animation}`);
    }

    const duration = Math.max(animationData.duration, 0.001);
    if (options.fit) {
      applyFit(options.fit, Boolean(options.mirror));
    } else {
      fitForAnimation(options.animation, duration, Boolean(options.mirror));
    }

    const frames = [];
    spine.skeleton.setToSetupPose();
    spine.state.clearTracks();
    spine.state.setAnimation(0, options.animation, true);
    spine.update(0);

    let previousTime = 0;
    for (let index = 0; index < options.frames; index += 1) {
      const time = (duration * index) / options.frames;
      spine.update(time - previousTime);
      previousTime = time;
      app.renderer.clear();
      app.renderer.render(app.stage);
      frames.push(app.view.toDataURL('image/png'));
    }
    return frames;
  }

  window.arkpetsCapture = {
    animations,
    animationInfo,
    capture,
    measureFit,
    runtime: Spine === PIXI.spine38?.Spine ? 'PIXI.spine38.Spine' : 'PIXI.spine.Spine',
    globals: Object.keys(PIXI).filter((key) => key.startsWith('spine')).sort(),
  };
})();
