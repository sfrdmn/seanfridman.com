;((global) => {
  const {
    sum,
    compose,
    range,
    scanReduce,
    lru,
  } = global.util
  
  const raf = global.requestAnimationFrame || (fn => setTimeout(fn, 16))

  const sampler = ({
    context,
    buffer,
    volume = 1,
    contention = 1,
    polyphony = 1,
    clipLength = Math.floor(buffer.duration * 1000),
  } = {}) => {
    const requestQueue = lru({ n: contention })
    const voiceQueue = lru({ n: polyphony })

    const createSource = (destination) => {
      const source = context.createBufferSource()

      source.buffer = buffer
      source.connect(destination)

      return source
    }

    const play = ({ id, gain = 1, pan = 0  } = {}) => {
      const now = Date.now()
      const hasGain = gain > 0
      const hasOpenVoice = voiceQueue.size < polyphony
      const hasEndedVoice = hasOpenVoice || now - voiceQueue.tail.value > clipLength
      const isFullyContended = requestQueue.size === contention
      const hasTurn = !requestQueue.size || contention === 1 || !isFullyContended || requestQueue.tail.key === id

      if (!hasTurn && now - requestQueue.tail.value > clipLength) {
        requestQueue.remove(requestQueue.tail.key)
      } else if (hasGain && hasEndedVoice && hasTurn) {
        const gainNode = context.createGain()
        const stereoNode = context.createStereoPanner()
        
        gainNode.gain.value = volume * gain
        stereoNode.pan.value = pan
        gainNode.connect(stereoNode)
        stereoNode.connect(context.destination)

        const source = createSource(gainNode)

        voiceQueue.set(hasOpenVoice ? voiceQueue.size : voiceQueue.tail.key, now)
        requestQueue.set(id, now)

        source.start()
      }
    }
    
    return {
      play
    }
  }

  const musicControl = ({
    audioContext: context,
    assets,
  }) => {
    const tracks = []
    const gainNode = context.createGain()
    let muted = true
    let hasInteraction = false
    let index = 0
    let volume = 1

    // const fadeOut = Curve.Decay.exp
    // const fadeIn = Curve.Attack.exp
    // const fadeSamplesN = Math.ceil(fadeTime / 1000 * context.sampleRate)
    // const fadeOutCurve = range(fadeSamplesN).map((i) => fadeOut(i / fadeSamplesN * fadeTime, fadeTime))
    // const fadeInCurve = range(fadeSamplesN).map((i) => fadeIn(i / fadeSamplesN * fadeTime, fadeTime))

    gainNode.gain.setValueAtTime(0, context.currentTime)
    gainNode.connect(context.destination)
    
    const addTrack = (id) => {
      const buffer = assets.get(id)
      const source = context.createBufferSource()

      source.buffer = buffer
      source.connect(gainNode)
      
      tracks.push(source)
    }

    const toggleMute = (value) => {
      if (value === undefined || value !== Boolean(muted)) {
        muted = !muted

        if (!hasInteraction && !muted) {
          tracks[index].start()
          gainNode.gain.setTargetAtTime(volume, context.currentTime, 10)
          hasInteraction = true
        } else if (muted) {
          gainNode.gain.setTargetAtTime(0, context.currentTime, 0.1)
        } else {
          gainNode.gain.setTargetAtTime(volume, context.currentTime, 0.25)
        }
      }
    }

    const setVolume = (val) => {
      volume = val
      
      if (!muted) {
        gainNode.gain.setTargetAtTime(volume, context.currentTime, 0.25)
      }
    }
    
    return {
      addTrack,
      toggleMute,
      setVolume,
    }
  }

  const soundControl = ({ audioContext: context, assets }) => {
    const voices = {}
    let muted = true
    let volume = 1

    const addVoice = (id, options = {}) => {
      const buffer = assets.get(id)
      
      voices[id] = sampler({ ...options, buffer, context })
    }

    const requestPlay = (id, options = {}) => {
      if (!muted) {
        const { gain = 1 } = options
        
        voices[id].play({ ...options, gain: gain * volume })
      }
    }

    const toggleMute = (val) => {
      if (val === undefined || muted !== Boolean(val)) {
        muted = !muted
      }
    }

    const setVolume = (val) => {
      volume = Math.min(1, Math.max(0, val))
    }
    
    return {
      addVoice,
      requestPlay,
      toggleMute,
      setVolume,
    }
  }

  const entityGraph = () => {
    const entities = []
    const byType = {}
    const byId = {}
    
    return {
      add(entity) {
        if (entity.id === undefined || entity.type == undefined || byId[entity.id]) {
          return false
        }
        
        entities.push(entity)

        if (!byType[entity.type]) {
          byType[entity.type] = []
        }

        byId[entity.id] = entity
        byType[entity.type].push(entity)

        return true
      },
      remove(spec) {
        const id = typeof spec === 'string' ? spec : spec.id
        const entity = byId[id]

        if (!entity) {
          return false
        }

        const entitiesOfType = byType[entity.type]

        entities.splice(entities.indexOf(entity), 1)
        entitiesOfType.splice(entitiesOfType.indexOf(entity), 1)

        return true
      },
      ofType(type) {
        return byType[type] || []
      },
      get(id) {
        return byId[id]
      },
      iter() {
        return entities
      },
      get size() {
        return entities.length
      }
    }
  }

  const loop = (fn, {
    hz = 60,
    ticker = raf
  } = {}) => {
    const msPerFrame = 1000 / hz
    let lastTick
    let pause = false
    let started = false
    let stop = false

    const tick = () => {
      const now = Date.now()

      if (pause || stop) {
        // NOOP
      } else if (!lastTick) {
        lastTick = now

        fn(now, 0)
      } else {
        const delta = now - lastTick

        if (delta > msPerFrame) {
          lastTick = now

          fn(now, delta)
        }
      }

      if (!stop) {
        ticker(tick)
      }
    }

    return {
      start: () => {
        if (!started && !stop) {
          started = true
          tick()
        }
      },
      pause: () => {
        pause = true
      },
      play: () => {
        pause = false
      },
      stop: () => stop = true
    }
  }

  const Curve = global.Curve = {
    Attack: {
      log(t, duration) {
        return t >= duration ? 1 : Math.log(1 + (t / duration) * (Math.E - 1))
      },
      exp(t, duration) {
        return t >= duration ? 1 : Math.pow(Math.E, t / duration * Math.log(2)) - 1
      },
    },
    Decay: {
      log(t, duration) {
        return t >= duration ? 0 : Math.log(-(t / duration * (Math.E - 1)) + Math.E)
      },
      exp(t, duration) {
        return t >= duration ? 0 : Math.pow(Math.E, -(t / duration * 5))
      },
    }
  }

  const composeCurves = global.composeCurves = (curvesSpec) => {
    const duration = sum(curvesSpec.map(([, t]) => t))
    const [finalCurve, finalThreshold] = curvesSpec[curvesSpec.length - 1]
    const finalValue = typeof finalCurve === 'number' ? finalCurve : finalCurve(finalThreshold, finalThreshold)
    
    return (t) => {
      if (t >= duration) {
        return finalValue
      } else {
        let thresholdSum = 0
        
        for (const [curve, threshold] of curvesSpec) {
          if (t < thresholdSum + threshold) {
            if (typeof curve === 'number') {
              return curve
            } else {
              return curve(t - thresholdSum, threshold)
            }
          }
          thresholdSum += threshold
        }
      }
    }
  }

  const transformCurve = (curve, {
    amp = 1,
    freq = 1,
    lower = 0,
    upper = 1
  } = {}) => {
    return (t, duration) => {
      return amp * (lower + (upper - lower) * curve(t, duration / freq))
    }
  }

  const inflections = (curve, duration) => {
    let points = []
    let last = curve(1, duration) - curve(0, duration)

    for (let i = 2; i < duration; i++) {
      const next = curve(i, duration) - curve(i - 1, duration)

      if ((next > 0 && last < 0) || (next < 0 && last > 0)) {
        points.push(i)
      }

      last = next
    }

    return points
  }

  const createSurface = ({ width = 0, height = 0, dpr = 1 } = {}) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style['width'] = `${width}px`
    canvas.style['height'] = `${height}px`

    ctx.imageSmoothingEnabled = false
    ctx.scale(dpr, dpr)

    return { canvas, ctx }
  }

  const getVelocity = (speed, direction) => {
    return [
      speed * Math.cos(direction),
      speed * Math.sin(direction)
    ]
  }

  const frameResolver = (frameSpec, { loop = true } = {}) => {
    const accumulatedSpec = scanReduce(frameSpec, (acc, x) => acc + x, 0)
    const lastFrameIdx = frameSpec.length - 1
    const totalDuration = accumulatedSpec[lastFrameIdx]

    return (start, time) => {
      const runTime = time - start
      const loopOffset = runTime % totalDuration

      if (!loop && runTime > totalDuration) {
        return lastFrameIdx
      }

      for (let i = 0; i < accumulatedSpec.length; i++) {
        if (loopOffset < accumulatedSpec[i]) {
          return i
        }
      }
    }
  }

  const spriteOffsetResolver = ({ width, height, cols, rows }) => {
    const spriteWidth = width / cols
    const spriteHeight = height / rows

    return (idx) => {
      const xIndex = idx % cols
      const yIndex = Math.floor(idx / cols)

      return {
        x: xIndex * spriteWidth,
        y: yIndex * spriteHeight,
        width: spriteWidth,
        height: spriteHeight
      }
    }
  }

  const animationResolver = (specCompiler) => {
    return (
      spec,
      {
        fallback
      } = {}
    ) => {
      const resolversByState = specCompiler(spec)

      return (chain, t) => {
        const resolver = resolversByState[chain.state]

        if (resolver !== undefined) {
          return resolver(chain.t, t)
        } else if (fallback !== undefined) {
          return fallback
        } else {
          throw new Error(`Unable to resolve animation for state '${chain.state}'`)
        }
      }
    }
  }

  const valueResolver = animationResolver((spec) => {
    return Object.entries(spec)
      .reduce((acc, [state, { frames: frameSpec, loop = true }]) => {
        const getFrame = frameResolver(frameSpec.map(([, t]) => t), { loop })

        acc[state] = (start, t) => {
          const frame = getFrame(start, t)
          
          if (!frameSpec[frame]) {
            console.error(`No frame '${frame}'`)
          }
            
          return frameSpec[frame][0]
        }

        return acc
      }, {})
  })

  const AssetType = {
    IMAGE: 'image',
    JSON: 'json',
    AUDIO: 'audio'
  }

  const getAssetLoaders = ({
    audioContext
  } = {}) => ({
    [AssetType.IMAGE]: (uri) => {
      return new Promise((resolve, reject) => {
        const image = new Image()

        image.src = uri
        image.onload = () => resolve(image)
        image.onerror = (err) => reject(err)
      })
    },
    [AssetType.JSON]: (uri) => {
      return fetch(uri).then(res => res.json())
    },
    [AssetType.AUDIO]: (uri) => {
      return fetch(uri)
        .then(res => res.arrayBuffer())
        .then(buffer => audioContext.decodeAudioData(buffer))
    },
  })

  const assetCache = ({
    assets,
    loaders
  } = {}) => {
    const cache = {}
    const loaded = {}

    const preload = (ids = Object.keys(assets)) => {
      return Promise.all(
        ids.map((id) => {
          const asset = assets[id]

          if (loaded[id]) {
            return Promise.resolve()
          }

          const loader = loaders[asset.type]

          return loader(asset.uri)
            .then((media) => {
              cache[id] = media
              loaded[id] = true
            })
            .catch((err) => {
              console.error('AssetCache', err)
            })
        })
      )
    }

    const get = (id) => cache[id]

    return { preload, get }
  }

  const getSpriteDim = (sprite) => {
    return {
      width: sprite.width / sprite.cols,
      height: sprite.height / sprite.rows
    }
  }

  const SceneObjects = {
    COMPOSITE: 'composite',
    CACHED: 'cached',
    SPRITE: 'sprite',
    CUSTOM: 'custom'
  }

    const withDebug = () => (render) => {
    return (ctx, origin, entity) => {
      const { debug = false, x, y, width, height, cachedTree = false } = entity

      render(ctx, origin, entity)

      if (debug && !cachedTree) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.lineWidth = 1
        ctx.strokeStyle = debug === true ? '#0000ff' : debug
        ctx.strokeRect(origin.x + x, origin.y + y, width, height)
        ctx.restore()
      }
    }
  }

  const withOpacity = () => (render) => {
    return (ctx, origin, entity) => {
      const { opacity, cachedTree } = entity

      if (!cachedTree && opacity !== undefined) {
        ctx.globalAlpha = opacity
      }

      render(ctx, origin, entity)
    }
  }

  const withTransform = () => (render) => {
    return (
      ctx,
      origin,
      entity
    ) => {
      const {
        x = 0,
        y = 0,
        cachedTree = false,
        center: {
          x: cx = 0,
          y: cy = 0
        } = {},
        skew: {
          x: skewX = 0,
          y: skewY = 0
        } = {},
        scale: {
          x: scaleX = 1,
          y: scaleY = 1
        } = {},
      } = entity

      if (scaleX === 0 || scaleY === 0) {
        return
      } else if (!cachedTree && (skewX !== 0 || skewY !== 0 || scaleX !== 1 || scaleY !== 1)) {
        const matrix = new DOMMatrix([scaleX, skewY, skewX, scaleY, 0, 0])
        const matrixInverted = DOMMatrix.fromMatrix(matrix)

        matrixInverted.invertSelf()

        // 2D can only be false here when the matrix cannot be inverted. This can only be the case
        // when the determinant is zero (invalid transform)
        if (!matrixInverted.is2D) {
          return
        }

        const { x: cxPrime, y: cyPrime } = new DOMPoint(cx, cy).matrixTransform(matrix)
        const offset = new DOMPoint(cxPrime - cx, cyPrime - cy).matrixTransform(matrixInverted)

        ctx.transform(scaleX, skewY, skewX, scaleY, x, y)
        
        render(ctx, {x: -offset.x, y: -offset.y}, {...entity, x: 0, y: 0})
      } else {
        render(ctx, origin, entity)
      }      
    }
  }

  const withTranslate = () => (render) => {
    return (
      ctx,
      origin,
      entity
    ) => {
      const {
        cachedTree = false,
        offset: {
          x: offsetX = 0,
          y: offsetY = 0
        } = {}
      } = entity

      if (!cachedTree && (offsetX !== 0 || offsetY !== 0)) {
        ctx.translate(offsetX, offsetY)
      }

      render(ctx, origin, entity)
    }
  }

  const withHidden = () => (render) => {
    return (ctx, origin, entity) => {
      const { hidden = false } = entity
      
      if (hidden) {
        return
      }

      render(ctx, origin, entity)
    }
  }

  const compositeRenderer = ({ renderers }) => {
    return (
      ctx,
      origin,
      {
        x = 0,
        y = 0,
        children = []
      }
    ) => {      
      if (children.length) {
        const childOrigin = {
          x: origin.x + x,
          y: origin.y + y
        }
        let byZIndex = {}
        
        for (const child of children) {
          const { zIndex = 0 } = child

          if (byZIndex[zIndex] === undefined) {
            byZIndex[zIndex] = []
          }

          byZIndex[zIndex].push(child)
        }        

        for (const zIndex of range(-10, 11)) {
          if (byZIndex[zIndex] !== undefined) {
            for (const child of byZIndex[zIndex]) {
              ctx.save()
              
              renderers[child.type](ctx, childOrigin, child)
              
              ctx.restore()
            }
          }
        }
      }
    }
  }

  const spriteRenderer = ({ assets }) => (
    ctx,
    origin,
    {
      x,
      y,
      sheet,
      sheetIdx
    }
  ) => {
    const image = assets.get(sheet.assetId)
    const { x: sx, y: sy, width, height } = spriteOffsetResolver(sheet)(sheetIdx)

    ctx.drawImage(
      image,
      sx,
      sy,
      width,
      height,
      origin.x + x,
      origin.y + y,
      width,
      height
    )
  }

  const cacheRenderer = ({ compositeCache }) => {
    return (ctx, origin, {id, x, y }) => {
      const canvas = compositeCache.get(id)
      
      if (canvas !== undefined) {
        ctx.drawImage(canvas, origin.x + x, origin.y + y, canvas.width, canvas.height)
      } else {
        console.error(`No cached render found for '${id}'`)
      }
    }
  }

  const customRenderer = (...deps) => {
    return (ctx, origin, renderable) => {
      renderable.renderer(...deps)(ctx, origin, renderable)
    }
  }

  const renderer = ({
    ctx,
    assets,
    compositeCache,
    getScene,
  }) => {
    const Renderers = [
      [SceneObjects.COMPOSITE, compositeRenderer],
      [SceneObjects.CACHED, cacheRenderer],
      [SceneObjects.CUSTOM, customRenderer],
      [SceneObjects.SPRITE, spriteRenderer],
    ].reduce((acc, [type, getRenderer]) => {
      const deps = {
        renderers: acc,
        compositeCache,
        assets,
      }
      
      acc[type] = compose(
        withTranslate(deps),
        withTransform(deps),
        withOpacity(deps),
        withDebug(deps),
        withHidden(deps),
      )(getRenderer(deps))
        
      return acc
    }, {})

    const render = (ctx, origin, entity) => {
      const { type } = entity
      
      ctx.save()

      Renderers[type](ctx, origin, entity)            

      ctx.restore()
    }

    const processForCache = (entity) => {
      const process = (entity) => {
        if (entity.children && entity.children.length) {          
          entity.children = entity.children.map((child) => process(child))
        }

        const {
          id,
          cache = false,
          width = 1,
          height = 1,
          dpr = 1
        } = entity

        if (cache) {
          if (!compositeCache.has(id)) {
            const surface = createSurface({
              width,
              height,
              dpr
            })

            render(surface.ctx, {x: 0, y: 0}, { ...entity, x: 0, y: 0, hidden: false })

            compositeCache.set(id, surface.canvas)
          }
          
          return {
            ...entity,
            type: SceneObjects.CACHED,
            cachedTree: true,
            children: []
          }
        } else {
          return entity
        }
      }

      return process({...entity})
    }

    return ({ width, height }, t, dt) => {
      ctx.clearRect(0, 0, width, height)

      render(ctx, {x: 0, y: 0}, processForCache(getScene(t, dt)))
    }
  }

  const oob = (world, entity, padding = 0) => {
    return (
      entity.x + entity.width < 0 - padding ||
      entity.x > world.width + padding ||
      entity.y + entity.height < 0 - padding ||
      entity.y > world.height + padding
    )
  }

  const intersects = (
    a,
    b,
    padding = 0
  ) => {
    return (
      a.x - padding < b.x + b.width + padding &&
      a.x + a.width + padding > b.x - padding &&
      a.y - padding < b.y + b.height + padding &&
      a.y + a.height + padding > b.y - padding
    )
  }

  global.engine = {
    AssetType,
    SceneObjects,
    Curve,

    createSurface,
    oob,
    intersects,
    getSpriteDim,
    getVelocity,
    valueResolver,
    getAssetLoaders,
    assetCache,
    entityGraph,
    loop,
    renderer,
    composeCurves,
    transformCurve,
    inflections,
    soundControl,
    musicControl,
  }
})(window)
