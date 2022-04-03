;((global) => {
  const {
    document,
    unmuteIosAudio,
    util: {
      noop,
      timeout,
    }
  } = global
  const lkjasdfjasdfhasdfFunc = x => atob(x + '=')

  const EmptyState = {}

	const reaction = (onChange, initialState = {}) => {
    const stateBox = {
      prev: EmptyState,
      curr: initialState
    }

		const setState = (next) => {
      stateBox.prev = stateBox.curr
      stateBox.curr = next

			onChange()
		}

    setTimeout(onChange, 0)

		return [stateBox, setState]
	}

	const lense = ([stateBox, setState], key) => {
    const lenseBox = {
      get prev() {
        return stateBox.prev === EmptyState ? EmptyState : stateBox.prev[key]
      },
      get curr() {
        return stateBox.curr[key]
      }
    }

		const setLenseState = (state) => {
			setState({
				...stateBox.curr,
				[key]: {
					...stateBox.curr[key],
					...state
				}
			})
		}

		return [lenseBox, setLenseState]
	}

  const ExcerptStates = {
    OPEN: 'open',
    OPENING: 'opening',
    CLOSED: 'closed',
    CLOSING: 'closing',
  }

  const excerptModal = ({ state: [stateBox] }) => {
    const template = document.querySelector('#excerpt-template')
    const el = template.content.firstElementChild.cloneNode(true)
    const content = el.querySelector('.excerpt-modal__content')
    let clickHandler = noop

    el.addEventListener('click', (e) => clickHandler(e))

    return {
      el,
      update() {
        const { prev, curr } = stateBox

        if (prev.state !== curr.state) {
          if (prev.state !== undefined) {
            el.classList.remove(`excerpt-modal-container--${prev.state}`)
          }

          el.classList.add(`excerpt-modal-container--${curr.state}`)
        }

        if (prev.text !== curr.text) {
          content.innerHTML = curr.text
        }

        if (prev.onClick !== curr.onClick) {
          clickHandler = curr.onClick
        }
      }
    }
  }

  const soundToggle = ({ state: [stateBox, setState] }) => {
    const template = document.querySelector('#sound-toggle-template')
    const iconTemplate = document.querySelector('#speaker-icon-template')
    const el = template.content.firstElementChild.cloneNode(true)
    const svg = iconTemplate.content.firstElementChild.cloneNode(true)
    const button = el.querySelector('.sound-toggle')

    let clickHandler = noop

    button.appendChild(svg)

    button.addEventListener('click', () => {
      const { curr } = stateBox
      const { loaded, active } = curr

      if (loaded) {
        const nextActive = !active

        setState({
          ...curr,
          active: nextActive,
        })

        clickHandler(nextActive)
      }
    })

    return {
      el,
      update() {
        const { prev, curr } = stateBox

        if (prev.loaded !== curr.loaded) {
          el.classList.toggle('loading', !curr.loaded)
        }

        if (prev.active !== curr.active) {
          el.classList.toggle('active', curr.active)
        }

        if (prev.onClick !== curr.onClick) {
          clickHandler = curr.onClick
        }
      }
    }
  }

  const LkjasdfjasdfhasdfKey = `${Math.random()}`

  const emailLinkControl = (options) => {
    const {
      root,
      linkClass = 'email-link',
      statusText = 'Copied to clipboard',
      timeoutMs = 3000
    } = options
    const email = options[LkjasdfjasdfhasdfKey]
    const WaitingAttr = 'data-waiting'
    
    root.addEventListener('click', (e) => {
      const el = e.target
      
      if (el.matches(`.${linkClass}`)) {
        if (!el.hasAttribute(WaitingAttr)) {
          let originalText = el.innerHTML
          
          el.setAttribute(WaitingAttr, true)
          
          navigator.clipboard
            .writeText(email)
            .then(() => {
              el.innerHTML = statusText

              return timeout(timeoutMs)
            })
            .catch(() => {
              el.innerHTML = email

              return timeout(timeoutMs * 10)
            })
            .finally(() => {
              el.innerHTML = originalText
              e.target.removeAttribute(WaitingAttr)
            })
        }

        e.stopPropagation()
        e.preventDefault()
      }
    })
  }

  global.addEventListener('DOMContentLoaded', () => {
    const audioContext = typeof AudioContext !== 'undefined' ? new AudioContext() : new webkitAudioContext()

    // Helper to allow WebAudio to play even when iOS device muted
    unmuteIosAudio(audioContext)

    const containerEl = document.querySelector('.container')
    const gameEl = document.querySelector('#game-mount')
    const logoEl = document.querySelector('.logo')
    const navEl = document.querySelector('.nav')

    const views = {}

    const update = () => {
      for (const view of Object.values(views)) {
        view.update()
      }
    }

    const mainState = reaction(update, {
      soundToggle: {
        active: false,
      },
      excerptModal: {
        text: '',
        state: ExcerptStates.CLOSED,
        x: 0,
        y: 0,
      },
    })

    const excerptModalState = lense(mainState, 'excerptModal' )
    const soundToggleState = lense(mainState, 'soundToggle')

    const modalView = views.Modal =  excerptModal({ state: excerptModalState })
    const soundToggleView = views.SoundToggle = soundToggle({ state: soundToggleState })

    emailLinkControl({
      root: document.body,
      [LkjasdfjasdfhasdfKey]: lkjasdfjasdfhasdfFunc('bWFpbEBzZWFuZnJpZG1hbi5jb20'),
    })

    containerEl.appendChild(modalView.el)
    containerEl.appendChild(soundToggleView.el)

    const onShake = ({ x, y }) => {
      containerEl.style['transform'] = `translate(${x}px, ${y}px)`
    }

    const onExcerptChange = (props) => {
      const [stateBox, setState] = excerptModalState
      const { state, x = 0, y = 0, transitionMs } = props

      if (state === ExcerptStates.CLOSING) {
        modalView.el.style.setProperty('--transition-delay', '0ms')
      } else if (state === ExcerptStates.OPENING) {
        modalView.el.style.setProperty('--transition-delay', `${transitionMs / 2}ms`)
      }

      if (state === ExcerptStates.CLOSED) {
        modalView.el.style.setProperty('--transition-ms', '0ms')
      } else {
        modalView.el.style.setProperty('--transition-ms', `${transitionMs / 2}ms`)
      }

      if (stateBox.curr.x !== x || stateBox.curr.y !== y) {
        modalView.el.style.setProperty('--x', `${x}px`)
        modalView.el.style.setProperty('--y', `${y}px`)
      }

      setState({
        ...stateBox.curr,
        ...props,
      })
    }

    const onLoadSound = (game) => {
      const [soundToggleStateBox, setSoundToggleState] = soundToggleState

      setSoundToggleState({
        ...soundToggleStateBox.curr,
        loaded: true,
        onClick(active) {
          game.toggleMute(!active)
        }
      })
    }

    global.createGame(gameEl, {
      audioContext,
      interfaceEls: [logoEl, navEl, soundToggleView.el],
      isBackgroundMode: !document.body.matches('.page--index'),
      onLoadSound,
      onShake,
      onExcerptChange,
    }).then((game) => {
      const [excerptModalStateBox, setExcerptModalState] = excerptModalState

      setExcerptModalState({
        ...excerptModalStateBox.curr,
        onClick() {
          game.closeExcerpt()
        }
      })

      global.game = game

      game.start()
    })
  })
})(window)
