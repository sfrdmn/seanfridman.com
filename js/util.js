;((global) => {
  const noop = () => {}

  const identity = x => x

  const sum = items => items.reduce((acc, x) => acc + x, 0)

  const luid = (() => {
    let id = 0
    
    return () => {
      const next = id

      id = (id + 1) % Number.MAX_SAFE_INTEGER

      return next
    }
  })()

  const compose = (...fns) => (...args) => {
    let result = fns[fns.length - 1](...args)
    for (let i = fns.length - 2; i >= 0; i--) {
      result = fns[i](result)
    }
    return result
  }

  const range = (lower, upper) => {
    if (upper === undefined) {
      upper = lower
      lower = 0
    }

    let result = []
    for (let i = lower; i < upper; i++) {
      result.push(i)
    }
    return result
  }

  const scanReduce = (list, fn, initialValue) => {
    let result = []

    list.reduce((acc, item, i) => {
      let accResult = fn(acc, item, i)

      result.push(accResult)

      return accResult
    }, initialValue)

    return result
  }

  const flatMap = (arr, fn) => {
    let acc = []

    for (const [i, item] of arr.entries()) {
      const mapped = fn(item, i)
      
      if (Array.isArray(mapped)) {
        for (const result of mapped) {
          acc.push(result)
        }
      } else {
        acc.push(mapped)
      }
    }

    return acc
  }

  const ll = {
    create() {
      return { head: undefined, tail: undefined, length: 0 }     
    },
    append(list, value) {
      let node

      if (!list.length) {
        node = list.head = list.tail = { value, prev: undefined, next: undefined }
      } else {
        const tail = list.tail

        node = list.tail = tail.next = { value, prev: tail, next: undefined }
      }

      list.length++

      return node
    },
    prepend(list, value) {
      let node

      if (!list.length) {
        node = list.head = list.tail = { value, prev: undefined, next: undefined }
      } else {
        const head = list.head
        
        node = list.head = head.prev = { value, prev: undefined, next: head }
      }

      list.length++

      return node
    },
    pop(list) {
      if (!list.length) {
        return
      }
      
      const tail = list.tail

      if (list.length === 1) {
        list.head = list.tail = undefined
      } else {
        list.tail = tail.prev
        list.tail.next = undefined
      }      

      list.length--

      return tail
    },
    shift(list) {
      if (!list.length) {
        return
      }
      
      const head = list.head

      if (list.length === 1) {
        list.head = list.tail = undefined
      } else {
        list.head = head.next
        list.head.prev = undefined
      }

      list.length--

      return head
    },
    remove(list, node) {
      if (!list.length) {
        return false
      } else {
        if (list.length === 1) {
          list.head = undefined
          list.tail = undefined          
        } else if (list.head === node) {
          list.head = node.next
          node.next.prev = undefined
        } else if (list.tail === node) {
          list.tail = node.prev
          node.prev.next = undefined
        } else {
          node.prev.next = node.next
          node.next.prev = node.prev
        }
        
        list.length--
        
        return true
      }
    }
  }

  const lru = ({ n = 1 } = {}) => {
    let queue = ll.create()
    let hash = {}
    
    return {
      has(key) {
        return hash[key] !== undefined
      },
      get(key) {
        const node = hash[key]

        if (node === undefined) {
          return
        }

        ll.remove(queue, node)
        hash[key] = ll.prepend(queue, node.value)

        return node.value.value
      },
      set(key, value) {
        if (hash[key]) {
          ll.remove(queue, hash[key])
        }

        if (queue.length >= n) {
          const {
            value: {
              key: keyStale
            }
          } = ll.pop(queue)

          delete hash[keyStale]
        }

        hash[key] = ll.prepend(queue, { key, value })
      },
      remove(key) {
        const node = hash[key]

        if (node) {
          ll.remove(queue, node)
          delete hash[key]

          return true
        }
        
        return false
      },
      get size() {
        return queue.length
      },
      get head() {
        return queue.length ? queue.head.value : undefined
      },
      get tail() {
        return queue.length ? queue.tail.value : undefined
      }
    }
  }

  const throttle = (fn, ms) => {
    let lastCall = 0

    return (...args) => {
      const now = Date.now()
      
      if (now - lastCall >= ms) {
        fn(...args)
        lastCall = now
      }
    }
  }

  const debounce = (fn, ms) => {
    let lastCall
    let lastArgs
    let timeoutId
    
    return (...args) => {
      const now = Date.now()
      const dt = now - lastCall
      
      if (lastCall === undefined || (timeoutId === undefined && dt >= ms)) {
        lastCall = now
        fn(...args)
      } else {
        
        lastArgs = args

        if (timeoutId === undefined) {
          timeoutId = setTimeout(() => {
            lastCall = Date.now()
            
            fn(...lastArgs)

            lastArgs = undefined
            timeoutId = undefined
          }, ms - dt)
        }
      }
    }
  }

    const splitWrapped = (text, { lineWidth, charWidth }) => {
    const lines = []
    let processed = 0
    let guard = 0
    let line = ''
    let nextBreak = -1

    while (processed < text.length && guard < text.length * 2) {
      if (processed > nextBreak) {
        const remaining = text.slice(processed)
        const i = remaining.search(/[\s\n\r\t—,;\-.:]/)

        nextBreak = i === -1 ? text.length : processed + i
      }
      
      if ((line.length + (nextBreak - processed)) * charWidth < lineWidth) {
        const ch = text[processed]
        
        if (/[\n\r]/.test(ch)) {
          lines.push(line)
          line = ''
        } else {
          line += ch
        }
        
        processed++
      } else {
        lines.push(line)
        line = ''

        // Eat trailing white space
        while (processed < text.length && /[\s\t]/.test(text[processed])) {
          processed++
        }
      }

      guard++
    }

    if (line) {
      lines.push(line)
    }

    return lines
    }

  const changeListener = (onChange, {
    isEqual = (a, b) => a === b,
    triggerInitial = false,
  } = {}) => {
    let last = undefined
    
    return (val) => {
      if ((triggerInitial && last === undefined) || !isEqual(last, val)) {
        onChange(val)
        last = val
      }
    }
  }

  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  global.util = {
    noop,
    identity,
    sum,
    luid,
    compose,
    range,
    scanReduce,
    flatMap,
    ll,
    lru,
    throttle,
    debounce,
    splitWrapped,
    changeListener,
    timeout,
  }
})(window)
