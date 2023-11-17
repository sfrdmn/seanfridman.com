;((global) => {
  const {
    util: {
      noop,
      identity,
      luid,
      changeListener,
      lru,
      debounce,
      flatMap,
    },
    engine: {
      Curve,
      AssetType,
      SceneObjects,

      createSurface,
      renderer,
      loop,
      getAssetLoaders,
      assetCache,
      entityGraph,
      intersects,
      oob,
      getSpriteDim,
      getVelocity,
      valueResolver,
      composeCurves,
      transformCurve,
      inflections,
      soundControl,
      musicControl,
    },
  } = global

  const DPR = global.devicePixelRatio || 1

  const oobPadding = 50
  const runCoeff = 15
  const jumpDuration = 250
  const shakeStrength = 10
  const shakeSpeed = 6
  const shakeAttack = 20
  const shakeDecay = 800
  const jumpHeight = 33
  const idleCadence = 750
  const walkingCadence = 250
  const runningCadence = 75
  const spiritDuration = 4500
  const corpseDuration = 7000
  const spiritPause = 1500
  const corpsePause = 5000
  const spiritDistance = 100
  const initialSpawnDuration = 200
  const spawnDuration = corpseDuration - corpsePause
  const spawnPause = 5000
  const waitLimit = 5000
  const fallDuration = 1000
  const fallStrength = 5
  const fallBounceSpeed = { lower: 750, upper: 200 }
  const fallPause = 500
  const panicRange = { lower: 2000, upper: 5000 }
  const panicWane = 2000
  const collisionPadding = 5
  const excerptOpenDuration = 800

  const Excerpts = [
      //////////
      `Water, water, every where,
And all the boards did shrink;
Water, water, every where,
Nor any drop to drink.

The very deep did rot: O Christ!
That ever this should be!
Yea, slimy things did crawl with legs
Upon the slimy sea.`,
      //////////
      `\tWas ist in Wahrheit das Ding, sofern es ein Ding ist? Wenn wir so fragen, wollen wir das Dingsein (die Dingheit) des Dinges kennenlernen.`,
      //////////
      `\tMind precedes its objects. They are mind-governed and mind-made. To speak or act with a defiled mind is to draw pain after oneself, like a wheel behind the feet of the animal drawing it.

\tMind precedes its objects. They are mind-governed and mind-made. To speak or act with a peaceful mind, is to draw happiness after oneself, like an inseparable shadow.`,
      //////////
      `\tI was now trying to get the better of the stupor that had come over me, and to collect my senses so as to see what was to be done, when I felt somebody grasp my arm. It was my elder brother, and my heart leaped for joy, for I had been sure that he was overboard — but the next moment all this joy was turned into horror — for he put his mouth close to my ear, and screamed out the word “Maelström!”`,
      //////////
      `Compared to what?`,
      //////////
      `Daisy,
Daisy,
Give me your answer true.
I’m half crazy,
All for the love of you.

It won’t be a stylish marriage,
I can’t afford a carriage,
But you’ll look sweet,
Upon the seat,
Of a bicycle built for two.`,
      //////////
  ]

  const randomGrabber = (list) => {
    let remaining = []

    return () => {
      if (remaining.length === 0) {
        remaining = Array.from(list)
      }

      const i = Math.floor(Math.random() * remaining.length)
      const item = remaining[i]

      remaining.splice(i, 1)

      return item
    }
  }

  const AssetId = {
    Meta: {
      ICON_DATA: 'meta.icon_data'
    },
    Sprite: {
      LEGS: 'sprite.legs',
      EXCERPT: 'sprite.excerpt',
    },
    Sound: {
      SMASH: 'sound.smash',
      STEP: 'sound.step',
      BOUNCE: 'sound.bounce',
      EXCERPT_OPEN: 'sound.excerpt_open',
      EXCERPT_CLOSE: 'sound.excerpt_close',
    },
    Music: {
      THA_KI_TA: 'music.tha_ki_ta',
    }
  }

  const Asset = {
    [AssetId.Meta.ICON_DATA]: {
      type: AssetType.JSON,
      uri: '/icons/meta.json'
    },
    [AssetId.Sprite.LEGS]: {
      type: AssetType.IMAGE,
      uri: '/img/legs2.png'
    },
    [AssetId.Sprite.EXCERPT]: {
      type: AssetType.IMAGE,
      uri: '/img/letter02.png'
    },
    [AssetId.Sound.STEP]: {
      type: AssetType.AUDIO,
      uri: '/sound/step_02.mp3'
    },
    [AssetId.Sound.SMASH]: {
      type: AssetType.AUDIO,
      uri: '/sound/smash.mp3'
    },
    [AssetId.Sound.BOUNCE]: {
      type: AssetType.AUDIO,
      uri: '/sound/bounce.mp3'
    },
    [AssetId.Sound.EXCERPT_OPEN]: {
      type: AssetType.AUDIO,
      uri: '/sound/letter_open.mp3'
    },
    [AssetId.Sound.EXCERPT_CLOSE]: {
      type: AssetType.AUDIO,
      uri: '/sound/letter_close.mp3'
    },
    [AssetId.Music.THA_KI_TA]: {
      type: AssetType.AUDIO,
      uri: '/sound/tha_ki_ta.mp3'
    }
  }

  const SpriteSheets = {
    LEGS: {
      assetId: AssetId.Sprite.LEGS,
      width: 64,
      height: 48,
      cols: 2,
      rows: 3
    },
    EXCERPT: {
      assetId: AssetId.Sprite.EXCERPT,
      width: 64,
      height: 38,
      cols: 2,
      rows: 1
    },
    Icons: {}
  }

  const EntityType = {
    MAN: 'man',
    EXCERPT: 'excerpt',
  }

  const ExcerptStates = {
    CLOSING: 'closing',
    CLOSED: 'closed',
    OPENING: 'opening',
    OPEN: 'open',
  }

  const ManStates = {
    IDLE: 'idle',
    WALKING: 'walking',
    RUNNING: 'running',
    SITTING: 'sitting',
    JUMPING: 'jumping',
    DEAD: 'dead',
    DESTROY: 'destroy',
    SPAWNING: 'spawning',
    DESPAWNING: 'despawning',
    WAITING: 'waiting',
    FALLING: 'falling',
  }

  const shadowRenderer = ({ compositeCache }) => {
    return (
      ctx,
      origin,
      {
        compositeId,
        x,
        y,
        color: colorSpec,
        skew = -20,
        squish = 1,
      }
    ) => {
      const shadowCompositeId = `${compositeId}-shadow`
      const composite = compositeCache.get(compositeId)
      // Coefficient to account for change of skew angle when squishing
      const squishCoeff = 45 / (Math.atan(1 / squish) / Math.PI * 180)
      const skewRad = squishCoeff * skew * Math.PI / 180
      const skewOffset = Math.abs(Math.tan(skewRad) * composite.height)
      const width = composite.width + skewOffset
      const height = composite.height * squish + 5

      if (!compositeCache.has(shadowCompositeId)) {
        const surface = createSurface({
          width,
          height
        })

        let color
        if (Array.isArray(colorSpec)) {
          const gradient = surface.ctx.createLinearGradient(
            composite.width / 2,
            0,
            composite.width / 2,
            height
          )

          colorSpec.forEach(([stop, value]) => {
            gradient.addColorStop(stop, value)
          })

          color = gradient
        } else {
          color = colorSpec
        }

        surface.ctx.transform(
          1,
          0,
          Math.tan(skewRad),
          -squish,
          -Math.tan(skewRad) * composite.height,
          composite.height * squish
        )
        surface.ctx.drawImage(composite, 0, 0)
        surface.ctx.fillStyle

        surface.ctx.resetTransform()
        surface.ctx.globalCompositeOperation = 'source-in'
        surface.ctx.fillStyle = color
        surface.ctx.fillRect(0, 0, width, height)

        compositeCache.set(shadowCompositeId, surface.canvas)
      }

      ctx.drawImage(compositeCache.get(shadowCompositeId), origin.x + x, origin.y + y + composite.height)
    }
  }

  const getChainNode = (state, t = Date.now()) => {
    return { state, t, threshold: Math.random() }
  }

  const ExcerptManagerId = `excerpt-manager-${luid()}`

  const createExcerptManager = ({
    onChange,
  }) => {
    let chain = getChainNode(ExcerptStates.CLOSED)
    const id = ExcerptManagerId
    const props = {
      activeId: undefined,
      nextActiveId: undefined,
      get chain() {
        return chain
      },
      get state() {
        return chain.state
      },
    }

    const setActiveId = (activeId) => {
      if (props.activeId !== activeId) {
        props.nextActiveId = activeId
      }
    }

    const update = (t) => {
      const dt = t - chain.t
      let nextChain = chain

      switch (chain.state) {
      case ExcerptStates.OPENING:
        if (props.activeId !== props.nextActiveId) {
          nextChain = getChainNode(ExcerptStates.CLOSING)
        } else if (dt > excerptOpenDuration) {
          nextChain = getChainNode(ExcerptStates.OPEN)
        }
        break
      case ExcerptStates.OPEN:
        if (props.activeId !== props.nextActiveId) {
          nextChain = getChainNode(ExcerptStates.CLOSING)
        }
        break
      case ExcerptStates.CLOSING:
        if (dt > excerptOpenDuration / 2) {
          nextChain = getChainNode(ExcerptStates.CLOSED)
        }
        break
      case ExcerptStates.CLOSED:
        if (props.activeId !== props.nextActiveId) {
          props.activeId = props.nextActiveId
          nextChain = getChainNode(ExcerptStates.CLOSED)
        } else if (props.activeId !== undefined && dt > 100) { // Ensure minimum close time
          nextChain = getChainNode(ExcerptStates.OPENING)
        }
        break
      }

      if (chain !== nextChain) {
        chain = nextChain

        onChange(props)
      }
    }

    return {
      id,
      type: 'excerptmanager',
      props,
      setActiveId,
      getRenderables: () => [],
      update,
      onClick: noop,
      isInteractable: () => false,
    }
  }

  const createExcerpt = ({
    x = 0,
    y = 0,
    text,
    manager,
    onClick,
  } = {}) => {
    const id = `excerpt-${luid()}`
    const { width, height } = getSpriteDim(SpriteSheets.EXCERPT)
    const spawnTime = Date.now()
    const spawnCurve = composeCurves([
      [Curve.Attack.exp, initialSpawnDuration]
    ])

    const props = {
      id,
      x,
      y,
      width,
      height,
      text,
      get state() {
        return manager.props.state
      },
    }

    const isInteractable = () => {
      return Date.now() - spawnTime > initialSpawnDuration
    }

    const getRenderables = (t) => {
      const { chain, activeId } = manager.props
      const isActive = id === activeId
      const state =  isActive ? chain.state : ExcerptStates.CLOSED
      const isOpen = state !== ExcerptStates.CLOSED
      const excerptFrame = isOpen ? 1 : 0
      const excerptId = `${id}-excerpt-${excerptFrame}`
      const opacity = spawnCurve(t - spawnTime)

      return [{
        id: excerptId,
        hidden: true,
        cache: true,
        type: SceneObjects.SPRITE,
        x: 0,
        y: 0,
        sheet: SpriteSheets.EXCERPT,
        sheetIdx: excerptFrame,
        ...getSpriteDim(SpriteSheets.EXCERPT)
      }, {
        id: excerptId,
        type: SceneObjects.CACHED,
        x,
        y,
        opacity,
      }, {
        id: `${excerptId}-shadow`,
        type: SceneObjects.CUSTOM,
        x,
        y,
        opacity: opacity * 0.1,
        zIndex: -1,
        renderer: shadowRenderer,
        compositeId: excerptId,
        squish: 0.25,
        skew: -45,
      }]
    }

    const handleClick = () => {
      onClick(props)
    }

    return {
      id,
      type: EntityType.EXCERPT,
      props,
      onClick: handleClick,
      isInteractable,
      update: noop,
      getRenderables,
    }
  }

  const createMan = ({
    x = 0,
    y = 0,
    speed = 10,
    isSpawn = false,
    panic = {},
    icon,
    isCollision,
    isOOB,
    onDestroy = noop,
    onStep = noop,
    onSmash = noop,
    onCollide = noop,
    onBounce = noop,
  } = {}) => {
    const id = luid()
    let panicStart = panic.start
    let panicThreshold = panic.threshold
    let didSpawnInitial = isSpawn
    let spawnCurve = composeCurves([
      [Curve.Attack.exp, didSpawnInitial ? spawnDuration : initialSpawnDuration]
    ])

    const isPanicDone = (t, node) => {
      const panicT = panicRange.lower + panicThreshold * (panicRange.upper - panicRange.lower)
      const panicDone = t > panicStart + panicT
      const waneDone = (t - (panicStart + panicT)) / panicWane > node.threshold

      return panicDone && waneDone
    }

    const getCollisionPadding = () => {
      switch (chain.state) {
      case ManStates.RUNNING:
      case ManStates.FALLING:
      case ManStates.WAITING:
        return 0
      default:
        return collisionPadding
      }
    }

    const getNextChainNode = (node, t) => {
      // Don't stop running until panic is done and is not colliding with anybody
      const canStopRunning = () => {
        return isPanicDone(t, node) && !isCollision({ id, props }, collisionPadding)
      }

      const getState = () => {
        if (!node) {
          return ManStates.SPAWNING
        } else {
          const dt = t - node.t
          const threshold = node.threshold

          switch (chain.state) {
          case ManStates.WALKING:
            if (dt > 5000 && dt * (1 / 10000) > threshold) {
              const n = Math.random()

              if (n < 0.1) {
                return ManStates.IDLE
              } else {
                return ManStates.WALKING
              }
            }
            break
          case ManStates.RUNNING:
            if (canStopRunning()) {
              return ManStates.WALKING
            } else if (dt > 2500 && dt * (1 / 5000) > threshold) {
              return ManStates.RUNNING
            }
            break
          case ManStates.IDLE:
            if (dt > 5000 && dt * (1 / 20000) > threshold) {
              const n = Math.random()

              if (n < 0.25) {
                return ManStates.SITTING
              } else {
                return ManStates.WALKING
              }
            }
            break
          case ManStates.SITTING:
            if (dt > 5000 && dt * (1 / 20000) > threshold) {
              return ManStates.WALKING
            }
            break
          case ManStates.JUMPING:
            if (dt > jumpDuration + 100) {
              return ManStates.RUNNING
            }
            break
          case ManStates.DEAD:
            if (dt > corpseDuration) {
              return ManStates.DESTROY
            }
            break
          case ManStates.SPAWNING:
            if (dt > (didSpawnInitial ? spawnDuration : initialSpawnDuration)) {
              // TODO Move out of getState
              didSpawnInitial = true
              spawnCurve = composeCurves([
                [Curve.Attack.exp, spawnDuration]
              ])
              return canStopRunning() ? ManStates.WALKING : ManStates.RUNNING
            }
            break
          case ManStates.WAITING:
            if (dt > waitLimit) {
              return ManStates.DESPAWNING
            }
            break
          case ManStates.DESPAWNING:
            if (dt > spawnDuration) {
              return ManStates.DESTROY
            }
            break
          case ManStates.FALLING:
            if (dt > fallDuration + fallPause) {
              return canStopRunning() ? ManStates.WALKING : ManStates.RUNNING
            }
            break
          }
        }
      }

      const state = getState()

      if (state) {
        return getChainNode(state, t)
      } else {
        return node
      }
    }

    let chain = getNextChainNode(undefined, Date.now())

    const legWidth = 32
    const legHeight = 16
    const legOffset = 5
    const shadowSkew = -45
    const deathSkew = 45
    const manWidth = Math.max(icon.width, legWidth)
    const manHeight = icon.height + legHeight - legOffset

    const props = {
      id,
      x,
      y,
      width: manWidth,
      height: manHeight,
      speed: 0,
      direction: Math.PI / 3,
      animation: {
        start: Date.now() - Math.floor(Math.random() * 100)
      },
      get state() {
        return chain.state
      }
    }

    const corpseCurve = composeCurves([
      [1, corpsePause],
      [Curve.Decay.log, corpseDuration - corpsePause]
    ])

    const spiritCurveWave = composeCurves([
      [0, spiritPause],
      [Curve.Attack.exp, (spiritDuration - spiritPause) / 2],
      [Curve.Decay.log, (spiritDuration - spiritPause) / 2]
    ])

    const spiritCurveSmooth = composeCurves([
      [0, spiritPause],
      [Curve.Attack.exp, spiritDuration - spiritPause]
    ])

    const fallDecay = composeCurves([
      [Curve.Decay.log, fallDuration]
    ])

    const fallBounce = (t) => {
      const decayCoeff = fallDecay(t)
      const bounceRange = fallBounceSpeed.lower - fallBounceSpeed.upper
      const bounce = fallBounceSpeed.upper + decayCoeff * bounceRange
      const freq = (t / bounce) * Math.PI * 2

      return decayCoeff * Math.abs(Math.cos(freq))
    }

    const getJumpOffset = transformCurve(
      composeCurves([
        [Curve.Attack.exp, jumpDuration * 0.33],
        [Curve.Decay.log, jumpDuration * 0.66],
      ]),
      { amp: jumpHeight }
    )

    const getLegsFrame = valueResolver({
      [ManStates.IDLE]: { frames: [[1, idleCadence], [0, idleCadence]] },
      [ManStates.WALKING]: { frames: [[2, walkingCadence], [3, walkingCadence]] },
      [ManStates.RUNNING]: { frames: [[2, runningCadence], [3, runningCadence]] },
      [ManStates.SITTING]: { frames: [[5, 1]], loop: false },
      [ManStates.FALLING]: { frames: [[5, 1]], loop: false },
    }, {
      fallback: 0
    })

    const getHeadYOffset = valueResolver({
      [ManStates.IDLE]: { frames: [[3, idleCadence], [0, idleCadence]] },
      [ManStates.SITTING]: { frames: [[6, 1]], loop: false },
      [ManStates.FALLING]: { frames: [[6, 1]], loop: false },
    }, {
      fallback: 0
    })

    const getMan = (t) => {
      const stateDt = t - chain.t
      const shadowSquish = 0.25
      // Use 0 offset for step animation for clean step sounds
      const legFrameOffset = chain.state === ManStates.WALKING || chain.state === ManStates.RUNNING ? 0 : chain.t
      const legsFrame = getLegsFrame({ ...chain, t: legFrameOffset }, t)
      const renderId = `${id}-${legsFrame}`
      const width = props.width = manWidth
      const height = props.height = manHeight
      const jumpDt = chain.state === ManStates.JUMPING ? t - chain.t : -1
      const jumpOffset = getJumpOffset(jumpDt)
      const spawnCoeff = chain.state === ManStates.SPAWNING ? spawnCurve(stateDt) : 1
      const despawnCoeff = chain.state === ManStates.DESPAWNING ? 1 - spawnCurve(stateDt) : 1
      const opacity = spawnCoeff * despawnCoeff
      const fallBounceCoeff = chain.state === ManStates.FALLING ? fallBounce(stateDt) : 0
      const fallOffset = fallStrength * fallBounceCoeff

      return [{
        id: `${renderId}-root`,
        type: SceneObjects.COMPOSITE,
        x: props.x,
        y: props.y - jumpOffset - fallOffset,
        hidden: chain.state === ManStates.DESTROY,
        opacity,
        children: [{
          id: renderId,
          type: SceneObjects.COMPOSITE,
          cache: true,
          x: 0,
          y: 0,
          width,
          height,
          offset: {
            x: Math.max(0, (legWidth - icon.width) / 2)
          },
          children: [{
            type: SceneObjects.SPRITE,
            sheet: SpriteSheets.LEGS,
            sheetIdx: legsFrame,
            x: icon.width / 2 - legWidth / 2,
            y: icon.height - legOffset
          }, {
            type: SceneObjects.SPRITE,
            sheet: SpriteSheets.Icons[icon.id],
            sheetIdx: 0,
            x: 0,
            y: getHeadYOffset(chain, t)
          }]
        }]
      }, {
        type: SceneObjects.CUSTOM,
        hidden: chain.state === ManStates.DESTROY,
        x: props.x,
        y: props.y + jumpOffset + fallOffset,
        opacity,
        zIndex: -1,
        renderer: shadowRenderer,
        compositeId: renderId,
        squish: shadowSquish,
        skew: shadowSkew,
        color: 'rgba(0, 0, 0, 0.2)',
      }]
    }

    const getDeadMan = (t) => {
      const renderId = `${id}-dead`
      const deathDt = t - chain.t
      const corpseCoeff = corpseCurve(deathDt)
      const spiritWaveCoeff = spiritCurveWave(deathDt)
      const spiritSmoothCoeff = spiritCurveSmooth(deathDt)
      const deathSquishY = 0.5 * corpseCoeff
      const deathSquishX = 1 + 0.5 * (1 - corpseCoeff)
      const deathSquishCoeff = 45 / (Math.atan(deathSquishX / deathSquishY) / Math.PI * 180)
      const deathSkewRad = (deathSquishCoeff * deathSkew * Math.PI / 180) % (Math.PI * 2)
      const width = manWidth + manHeight
      const height = manHeight
      const x = props.x
      const y = props.y

      return [{
        // Cached render
        id: renderId,
        hidden: true,
        cache: true,
        type: SceneObjects.COMPOSITE,
        x: 0,
        y: 0,
        width: manWidth,
        height: manHeight,
        children: [{
          type: SceneObjects.SPRITE,
          sheet: SpriteSheets.LEGS,
          sheetIdx: 0,
          x: icon.width / 2 - legWidth / 2,
          y: icon.height - legOffset
        }, {
          type: SceneObjects.SPRITE,
          sheet: SpriteSheets.Icons[icon.id],
          sheetIdx: 0,
          x: 0,
          y: 0
        }]
      }, {
        // Corpse
        id: renderId,
        type: SceneObjects.CACHED,
        x,
        y,
        width,
        height,
        opacity: corpseCoeff,
        center: {
          x: icon.width / 2,
          y: height / 2
        },
        scale: {
          x: deathSquishX,
          y: deathSquishY,
        },
        skew: {
          x: Math.tan(deathSkewRad)
        }
      }, {
        // Spirit
        id: renderId,
        type: SceneObjects.CACHED,
        zIndex: 1,
        x,
        y: -manHeight / 4 + y - spiritSmoothCoeff * spiritDistance,
        opacity: 0.5 * spiritWaveCoeff,
        width,
        height,
      }]
    }

    const getRenderables = (t, dt) => {
      if (chain.state === ManStates.DEAD) {
        return getDeadMan(t, dt)
      } else {
        return getMan(t, dt)
      }
    }

    const onClickHandler = () => {
      chain = getChainNode(ManStates.DEAD)

      onSmash(props)
    }

    const onSmashHandler = (options) => {
      if (isInteractable()) {
        chain = getChainNode(ManStates.JUMPING)
        panicStart = options.panicStart
        panicThreshold = options.panicThreshold
      }
    }

    const isInteractable = () => {
      return (
        chain.state === ManStates.WALKING ||
        chain.state === ManStates.IDLE ||
        chain.state === ManStates.SITTING
      )
    }

    const Directions = [
      0,
      Math.PI / 4,
      Math.PI / 2,
      3 * Math.PI / 4,
      Math.PI,
      5 * Math.PI / 4,
      3 * Math.PI / 2,
      7 * Math.PI / 4
    ]

    const getDirection = () => {
      return Directions[Math.floor(Math.random() * Directions.length)]
    }

    const getOppositeDirection = (direction) => {
      return (direction + Math.PI) % (Math.PI * 2)
    }

    const legReaction = changeListener((frame) => {
      onStep({ ...props, frame })
    })

    const bounceReaction = changeListener((strength) => {
      onBounce({ ...props, strength })
    })

    // Even inflections are low points
    const bounceInflections = inflections(fallBounce, fallDuration).filter((_, i) => i % 2 === 0)

    const getBounceValue = (dt) => {
      for (const inflection of bounceInflections) {
        if (dt <= inflection) {
          return fallDecay(inflection)
        }
      }
      return fallDecay(bounceInflections[bounceInflections.length -1])
    }

    const collideReaction = changeListener(() => {
      onCollide(props)
    })

    const update = (t, dt) => {
      const nextChain = getNextChainNode(chain, t)

      if (chain === undefined || !nextChain.handled) {
        if (nextChain.state === ManStates.IDLE) {
          props.speed = 0
        } else if (nextChain.state === ManStates.WALKING) {
          props.speed = speed
          props.direction = getDirection()
        } else if (nextChain.state === ManStates.RUNNING) {
          props.speed = speed * runCoeff
          props.direction = getDirection()
        } else if (nextChain.state === ManStates.JUMPING) {
          props.speed = 0
        } else if (nextChain.state === ManStates.SITTING) {
          props.speed = 0
        } else if (nextChain.state === ManStates.DEAD) {
          props.speed = 0
        } else if (nextChain.state === ManStates.DESTROY) {
          onDestroy(id)
        } else if (nextChain.state === ManStates.DESPAWNING) {
          props.speed = 0
        } else if (nextChain.state === ManStates.FALLING) {
          props.speed *= 0.75
        }

        if (chain.state === ManStates.JUMPING && nextChain.state !== ManStates.JUMPING) {
          onBounce({ ...props, stringth: 1 })
        }

        chain = nextChain
        chain.handled = true
        // props.animation.state = chain.state
        // props.animation.start = Date.now()
      }

      if (
        chain.state === ManStates.DEAD ||
        chain.state === ManStates.DESPAWNING ||
        chain.state === ManStates.DESTROY
      ) {
        return
      }

      if (chain.state === ManStates.FALLING) {
        props.speed = fallDecay(t - chain.t) * (speed * runCoeff)
      }

      if (chain.state === ManStates.WALKING || chain.state === ManStates.RUNNING) {
        legReaction(getLegsFrame({ ...chain, t: 0 }, t))
      } else if (chain.state === ManStates.FALLING) {
        bounceReaction(getBounceValue(t - chain.t))
      }

      let i = 0
      let next, dx, dy, ok
      do {
        [dx, dy] = getVelocity(props.speed, props.direction)
        next = {
          id,
          props: {
            x: props.x + dx * (dt / 1000),
            y: props.y + dy * (dt / 1000),
            width: manWidth,
            height: manHeight
          }
        }

        const hitOOB = isOOB(next)
        const hitEntity = isCollision(next, getCollisionPadding())
        const runningHit = hitEntity && chain.state === ManStates.RUNNING
        const fallingHit = hitEntity && chain.state === ManStates.FALLING

        collideReaction(runningHit || fallingHit)

        if (hitOOB || hitEntity) {
          props.direction = getOppositeDirection(props.direction)

          if (runningHit) {
            chain = getChainNode(ManStates.FALLING)
          }
        } else {
          ok = true
        }

        if (i++ >= Directions.length) {
          if (chain.state !== ManStates.WAITING) {
            chain = getChainNode(ManStates.WAITING)
          }

          return
        }
      } while (!ok)

      if (ok && chain.state === ManStates.WAITING) {
        chain = getChainNode(ManStates.RUNNING)
      }

      props.x = next.props.x
      props.y = next.props.y
    }

    return {
      id,
      type: EntityType.MAN,
      props,
      getRenderables,
      isInteractable,
      onClick: onClickHandler,
      onSmash: onSmashHandler,
      update,
    }
  }

  const addIconAssets = (assets) => {
    return Promise.all(
      assets.get(AssetId.Meta.ICON_DATA).map((meta) => {
        Asset[meta.id] = {
          type: AssetType.IMAGE,
          uri: `/icons/${meta.filename}`
        }
        SpriteSheets.Icons[meta.id] = {
          assetId: meta.id,
          width: meta.width,
          height: meta.height,
          cols: 1,
          rows: 1
        }
        return Promise.resolve()
      })
    )
  }

  const createGame = (el, {
    audioContext,
    interfaceEls = [],
    isBackgroundMode = true,
    onExcerptChange = noop,
    onShake = noop,
    onLoadSound = noop,
  } = {}) => {
    let width = el.clientWidth
    let height = el.clientHeight
    const surface = createSurface({
      width,
      height,
      dpr: DPR
    })

    let mousePos
    let panicStart = 0
    let panicThreshold = 0
    const assets = assetCache({
      assets: Asset,
      loaders: getAssetLoaders({ audioContext })
    })

    const getShakeFn = ({
      curve,
      amp = 5,
      freq = 500,
      attack = 15,
      decay = 500,
    } = {}) => {
      const duration = attack + decay
      const durationSecs = duration / 1000

      return (t) => {
        return curve(t) * amp * Math.cos(freq * durationSecs * (t / duration * Math.PI * 2))
      }
    }

    const getShakeTransform = ({
      bumpStrength = 1,
      strength = 10,
      speed = 5,
      attack = 120,
      decay = 700
    } = {}) => {
      const duration = attack + decay
      const curve = composeCurves([
        [Curve.Attack.exp, attack],
        [Curve.Decay.log, decay]
      ])
      const bump = transformCurve(
        composeCurves([
          [Curve.Attack.exp, 100],
          [Curve.Decay.log, 100]
        ]),
        { amp: bumpStrength }
      )
      const shake = getShakeFn({
        curve,
        attack,
        decay,
        amp: strength,
        freq: speed
      })
      const empty = { offset: { x: 0, y: 0 } }

      return (start, t) => {
        const dt = t - start

        if (dt > duration) {
          return empty
        }

        const bumpOffset = bump(dt)
        const shakeOffset = shake(dt)

        return {
          offset: {
            x: shakeOffset,
            y: shakeOffset + bumpOffset
          }
        }
      }
    }

    const createController = () => {
      const spawnSpacing = 50
      const iconMaxSize = 50
      const manSpawnMax = 20
      const manSpawnN = Math.min(
        Math.max(
          Math.floor(
            ((width + oobPadding) * (height + oobPadding)) /
            (4 * Math.pow(spawnSpacing, 2) + Math.pow(iconMaxSize, 2))
          ) - 1,
          2
        ),
        manSpawnMax
      )
      const getIcon = randomGrabber(assets.get(AssetId.Meta.ICON_DATA))
      const sfx = soundControl({ audioContext, assets })
      const music = musicControl({ audioContext, assets })
      const excerpts = Excerpts
      const excerptSpawnN = isBackgroundMode ? 0 : Math.min(excerpts.length, Math.floor(width * height / Math.pow(spawnSpacing, 2)))
      const entities = entityGraph()

      sfx.addVoice(AssetId.Sound.STEP, {
        polyphony: 1,
        clipLength: 120,
        volume: 0.05,
        contention: manSpawnN,
      })
      sfx.addVoice(AssetId.Sound.SMASH, { volume: 0.75 })
      sfx.addVoice(AssetId.Sound.EXCERPT_OPEN, { clipLength: 200 })
      sfx.addVoice(AssetId.Sound.EXCERPT_CLOSE, { clipLength: 200 })
      sfx.addVoice(AssetId.Sound.BOUNCE, { polyphony: 2, clipLength: 100  })

      music.addTrack(AssetId.Music.THA_KI_TA)

      const handleExcerptChange = ({ activeId }) => {
        if (!activeId) {
          return

        }
        const props = entities.get(activeId).props
        const playback = getPlayback({ x: props.x, y: props.y })

        if (activeId && props.state === ExcerptStates.OPENING) {
          sfx.requestPlay(AssetId.Sound.EXCERPT_OPEN, playback)
        } else if (activeId && props.state === ExcerptStates.CLOSING) {
          sfx.requestPlay(AssetId.Sound.EXCERPT_CLOSE, playback)
        }

        onExcerptChange({ ...props, transitionMs: excerptOpenDuration })
      }

      const excerptManager = createExcerptManager({
        onChange: handleExcerptChange
      })

      const getPlayback = ({
        gain: {
          lower: gainLower = 0.25,
          upper: gainUpper = 0.75,
        } = {},
        x = 0,
        y = 0,
      } = {}) => {
        gainLower = Math.max(0, Math.min(1, Math.min(gainLower, gainUpper)))
        gainUpper = Math.max(0, Math.min(1, Math.max(gainLower, gainUpper)))

        const cx = width / 2
        const cy = height / 2
        const dx = x - cx
        const dy = y - cy
        const r = Math.max(cx, cy)
        const gainCoeff = 1 - Math.min(1, Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)) / r)
        return {
          pan: Math.max(-1, Math.min(1, dx / cx * 0.75)),
          gain: gainLower + gainCoeff * (gainUpper - gainLower)
        }
      }

      const onSmash = ({ id, x, y }) => {
        shakeStart = panicStart = Date.now()
        panicThreshold = Math.random()

        sfx.requestPlay(AssetId.Sound.SMASH, {
          id,
          ...getPlayback({
            gain: {
              lower: 0.5,
              upper: 1
            },
            x,
            y,
          })
        })

        entities.ofType(EntityType.MAN).forEach((entity) => {
          entity.onSmash({ panicStart, panicThreshold })
        })
      }

      const onDestroy = (id) => {
        entities.remove(id)

        setTimeout(() => {
          const man = spawnMan()

          if (man) {
            entities.add(man)
          }
        }, spawnPause)
      }

      const handleExcerptClick = (targetEntity) => {
        excerptManager.setActiveId(targetEntity.id)
      }

      const collisionChecker = (bodies, getBBoxA = identity, getBBoxB) => {
        if (!getBBoxB) {
          getBBoxB = getBBoxA
        }

        return (b, padding = 0) => {
          return bodies.some((a) => a.id !== b.id && intersects(getBBoxA(a), getBBoxB(b), padding))
        }
      }

      const isEntityCollision = collisionChecker(entities.iter(), e => e.props)
      const isNoSpawnCollision = collisionChecker(interfaceEls, el => el.getBoundingClientRect(), e => e.props)
      const isSpawnCollision = (...args) => isEntityCollision(...args) || isNoSpawnCollision(...args)

      const getFreeCoord = (
        { id, width, height },
        {
          getRandomCoord = getSpawn,
          maxAttempts = 100,
          spacing = spawnSpacing,
          isCollision = isSpawnCollision
        } = {}
      ) => {
        let coord
        let i = 0
        do {
          coord = getRandomCoord()

          if (i++ > maxAttempts) {
            return false
          }
        } while (isCollision({
          id,
          props: {
            x: coord.x,
            y: coord.y,
            width,
            height,
          }
        }, spacing))

        return coord
      }

      const spawnExcerpt = (text) => {
        const coord = getFreeCoord({ id: text, ...getSpriteDim(SpriteSheets.EXCERPT)})

        if (!coord) {
          return
        }

        return createExcerpt({
          x: coord.x,
          y: coord.y,
          text,
          manager: excerptManager,
          onClick: handleExcerptClick,
        })
      }

      const spawnMan = ({ isInitial = false } = {}) => {
        const icon = getIcon()
        const coord = getFreeCoord({ ...icon, height: icon.height + 20 }, { isCollision: isEntityCollision })

        if (!coord) {
          return
        }

        return createMan({
          x: coord.x,
          y: coord.y,
          icon,
          isSpawn: !isInitial,
          panic: {
            start: panicStart,
            threshold: panicThreshold
          },
          onSmash,
          onDestroy,
          isCollision(a, padding = 5) {
            return isEntityCollision(a, padding)
          },
          onStep({ id, x, y }) {
            sfx.requestPlay(AssetId.Sound.STEP, {
              id,
              ...getPlayback({
                x,
                y,
              })
            })
          },
          onBounce({ x, y, strength }) {
            sfx.requestPlay(AssetId.Sound.BOUNCE, getPlayback({ gain: { upper: strength, lower: 0 }, x, y }))
          },
          onCollide({ x, y }) {
            sfx.requestPlay(AssetId.Sound.BOUNCE, getPlayback({ x, y }))
          },
          isOOB(a) {
            return oob(
              { width, height },
              a.props,
              oobPadding
            )
          }
        })
      }

      const getSpawn = () => {
        return {
          x: Math.floor(Math.random() * (width + oobPadding * 2)) - oobPadding,
          y: Math.floor(Math.random() * (height + oobPadding * 2)) - oobPadding
        }
      }

      entities.add(excerptManager)

      for (let i = 0; i < excerptSpawnN; i++) {
        const text = excerpts[i]
        const excerpt = spawnExcerpt(text)

        if (excerpt) {
          entities.add(excerpt)
        }
      }

      for (let i = 0; i < manSpawnN - excerpts.length; i++) {
        const man = spawnMan({ isInitial: true })

        if (man) {
          entities.add(man)
        }
      }

      let shakeStart = 0
      let shake = getShakeTransform({
        attack: shakeAttack,
        decay: shakeDecay,
        strength: shakeStrength,
        speed: shakeSpeed
      })

      const render = renderer({
        ctx: surface.ctx,
        assets,
        compositeCache: lru({ n: manSpawnMax * 12 }),
        entities: entities.iter(),
        getScene(t, dt) {
          return {
            id: 'root',
            type: SceneObjects.COMPOSITE,
            x: 0,
            y: 0,
            children: flatMap(entities.iter(), e => e.getRenderables(t, dt))
          }
        }
      })

      const shakeReaction = changeListener((offset) => {
        onShake(offset)
      })

      const update = (t, dt) => {
        entities.iter().forEach((entity) => entity.update(t, dt))

        const isHovering = mousePos && entities.iter().some(e => intersects(e.props, mousePos) && e.isInteractable())
        document.body.style.cursor = isHovering ? 'pointer' : 'auto'

        shakeReaction(shake(shakeStart, t).offset, {
          isEqual(a, b) {
            return Math.abs(a - b) < 1e-3
          }
        })
      }

      const onClickRoot = () => {
        const manager = entities.get(ExcerptManagerId)

        if (manager.props.activeId) {
            manager.setActiveId(undefined)
        }
      }

      const loops = [
        loop(update, { ticker: fn => setTimeout(fn, 16) }),
        loop((t, dt) => render({ width, height }, t, dt))
      ]

      surface.canvas.addEventListener('mousemove', debounce((e) => {
        if (isBackgroundMode) {
          return
        }

        mousePos = { x: e.offsetX, y: e.offsetY, width: 1, height: 1 }
      }, 17))

      surface.canvas.addEventListener('click', debounce((e) => {
        if (isBackgroundMode) {
          return
        }

        const point = { x: e.offsetX, y: e.offsetY, width: 1, height: 1 }

        const index = entities.iter().findIndex(e => intersects(e.props, point) && e.isInteractable())

        if (index !== -1) {
          entities.iter()[index].onClick(e)
        } else {
          onClickRoot(e)
        }
      }, 17))

      surface.canvas.setAttribute('role', 'img')
      surface.canvas.setAttribute(
        'aria-label',
        'Animated rendering of a bunch of square little guys with legs walking around.'
      )

      return {
        canvas: surface.canvas,
        start() { loops.forEach(loop => loop.start()) },
        pause() { loops.forEach(loop => loop.pause()) },
        play() { loops.forEach(loop => loop.play()) },
        stop() { loops.forEach(loop => loop.stop()) },
        toggleMute(val) {
          if (!isBackgroundMode) {
            music.toggleMute(val)
            sfx.toggleMute(val)
          }
        },
        closeExcerpt() {
          excerptManager.setActiveId(undefined)
        },
      }
    }

    const soundAssets = Object.values(AssetId.Sound).concat(Object.values(AssetId.Music))
    const preloadAssets = Object.values(AssetId.Meta).concat(Object.values(AssetId.Sprite))

    el.appendChild(surface.canvas)

    const soundAssetPromise = assets.preload(soundAssets)

    return assets
      .preload(preloadAssets)
      .then(() => addIconAssets(assets))
      .then(() => assets.preload())
      .then(createController)
      .then((game) => {
        soundAssetPromise.then(() => {
          onLoadSound(game)
        })

        return game
      })
  }

  global.createGame = createGame
})(window)
