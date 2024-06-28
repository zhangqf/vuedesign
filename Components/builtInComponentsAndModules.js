// 当前激活的effect函数
let activeEffect
// 一个标记变量，代表是否进行追踪。默认值为true，允许追踪
let shouldTrack = true
// effect 栈
const effectStack = []

const bucket = new WeakMap()

function track(target, key) {
  // 没有activeEffect， 禁止追踪 直接返回 
  if (!activeEffect || !shouldTrack) {
    return
  }
  // 根据target 从收集中取出depsMap
  let depsMap = bucket.get(target)
  // 如果不存在， 新建一个Map与target关联
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  // 根据key从depsMap中取得deps，Set类型。里面存储着所有与当前key相关的副作用函数
  let deps = depsMap.get(key)
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }
  // 把当前激活的副作用函数添加到依赖合集deps中
  deps.add(activeEffect)
  // 将其添加到 activeEffect.deps 数组中
  activeEffect.deps.push(deps)
}

function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  // 取得与key相关联的副作用函数
  const effects = depsMap.get(key)
  const effectToRun = new Set()
  effects && effects.forEach(effectFn => {
    if (effectFn !== activeEffect) {
      effectToRun.add(effectFn)
    }
  })
  if (type === "ADD" || type === "DELETE") {
    const iterateEffects = depsMap.get(ITERATE_KEY)
    // 将与ITERATE_KEY相关联的副作用函数也添加到effectsToRun 
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn != activeEffect) {
        effectToRun.add(effectFn)
      }
    })
  }
  // 当操作类型为ADD并且目标对象是数组时，应该取出并执行那些与length属性相关的副作用函数 
  if (type === 'ADD' && Array.isArray(target)) {
    // 取出与length相关联的副作用函数 
    const lengthEffects = depsMap.get('length')
    lengthEffects && lengthEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectToRun.add(effectFn)
      }
    })
  }

  // 如果操作目标是数组，并且修改了数组的length属性  // [!code ++]
  if (Array.isArray(target) && key === 'length') { // [!code ++]
    // 对于索引大于或等于length值的元素，需要把所有相关联的副作用函数取出并添加到effectToRun中待执行 // [!code ++]
    depsMap.forEach((effects, key) => { // [!code ++]
      if (key >= newVal) { // [!code ++]
        effects.forEach(effectFn => { // [!code ++] 
          effectToRun.add(effectFn) // [!code ++]
        }) // [!code ++]
      } // [!code ++]
    }) // [!code ++]
  } // [!code ++]

  effectToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn)
    // 当effectFn执行时，将其设置为当前激活的副作用函数
    activeEffect = effectFn
    // 在调用副作用函数之前将当前副作用函数压入栈中
    effectStack.push(effectFn)
    const res = fn()
    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把activeEffect 还原为之前的值
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  // 将options挂载到effectFn上
  effectFn.options = options
  // activeEffect.deps用来存储所有与该副作用函数相关联的依赖合集
  effectFn.deps = []
  // 执行副作用函数
  if (!options.lazy) {
    effectFn()
  }
  return effectFn

}
function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始值，或者已经被读取过了，直接返回
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  // 将数据添加到seen中，代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value)
  for (const i in value) {
    traverse(value[i], seen)
  }
  return value
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖合集
    const deps = effectFn.deps[i]
    // 将effectFn 从依赖集合中移除
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

const obj = { foo: 1 }
const ITERATE_KEY = Symbol()
const p = new Proxy(obj, {
  ownKeys(target) {
    track(target, ITERATE_KEY)
    return Reflect.ownKeys(target)
  },
  set(target, key, newVal, receiver) {

    const oldVal = target[key]

    // 判读目标的这个key 是否是自身拥有的，若是，则为set，不是则为 add
    const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : "ADD"
    const res = Reflect.set(target, key, newVal, receiver)
    if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
      trigger(target, key, type)
    }
    return res
  },
  deleteProperty(target, key) {
    const hadkey = Object.prototype.hasOwnProperty.call(target, key)
    const res = Reflect.deleteProperty(target, key)
    if (res && hadkey) {
      trigger(target, key, 'DELETE')
    }
  }
})

const originMethod = Array.prototype.includes

const arrayInstrumentations = {
  includes: function (...args) {
    // this 是代理对象，先在代理对象中查找，将结果存储到res中
    let res = originMethod.apply(this, args)
    if (res === false) {
      // 没找到，则通过this.raw 拿到原始数组，再去其中查找并更新res值
      res = originMethod.apply(this.raw, args)
    }
    // 返回最终结果
    return res
  }
}
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    ownKeys(target) {
      // 如果操作目标targer是数组，则使用lenght属性作为key并建立响应联系
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },
    // 拦截读取操作
    get(target, key, receiver) {
      if (key === 'raw') {
        return target
      }
      // 如果操作的目标对象是数组，并且key存在与arrayInstrumentation上 // [!code ++]
      // 那么返回定义在arrayInstrumentation上的值 // [!code ++]
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) { // [!code ++]
        return Reflect.get(arrayInstrumentations, key, receiver) // [!code ++]
      } // [!code ++]
      if (!isReadonly && typeof key !== 'symbol') {
        track(target, key)
      }
      const res = Reflect.get(target, key, receiver)

      if (isShallow) {
        return res
      }
      if (typeof res === 'object' && res !== null) {
        return isReadonly ? readonly(res) : reactive(res)
      }
      return res
    },
    set(target, key, newVal, receiver) {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`)
        return true
      }
      const oldVal = target[key]
      // 如果属性不存在，则是添加属性，否则是设置已有属性 
      // 如果代理目标是数组，则检测被设置的索引值是否小于数组长度，如果是，则为SET，否则为ADD  
      const type = Array.isArray(target)
        ? Number(key) < target.length ? 'SET' : 'ADD'
        : Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
      const res = Reflect.set(target, key, newVal, receiver)

      if (target === receiver.raw) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type) // [!code --]
          //增加第四个参数，即触发响应的新值 
          trigger(target, key, type, newVal)
        }
      }
      return res
    },
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`)
        return true
      }
      const hadkey = Object.prototype.hasOwnProperty.call(target, key)
      const res = Reflect.deleteProperty(target, key)
      if (res && hadkey) {
        trigger(target, key, 'DELETE')
      }
      return res
    }
  })
}

const reactiveMap = new Map()

function reactive(obj) {
  const existionProxy = reactiveMap.get(obj)
  if (existionProxy) return existionProxy
  const proxy = createReactive(obj)
  reactiveMap.set(obj, proxy)
  return proxy
}

function shallowReactive(obj) {
  return createReactive(obj, true)
}

function readonly(obj) {
  return createReactive(obj, false, true)
}


function shallowReadonly(obj) {
  return createReactive(obj, true, true)
}

// 创建一个渲染器
const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag)
  },
  setElementText(el, text) {
    el.textContent = text
  },
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  patchProps(el, key, preValue, nextValue) {
    // 匹配以on开头的属性，视其为事件
    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {})
      // 获取为该元素伪造的事件处理函数 invoker
      let invoker = invokers[key]
      const name = key.slice(2).toLowerCase()
      if (nextValue) {
        if (!invoker) {
          // 如果没有invoker，则将一个伪造的invoker缓存到el._vei中
          // vei是vue event invoker的首字母缩写
          invoker = el._vei[key] = (e) => {
            if (e.timeStamp < invoker.attached) return
            // 当伪造的事件处理函数执行时，会执行真正的事件处理函数
            // 如果invoker.value 是数组，则遍历它并逐个调用事件处理函数
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e))
            } else {
              invoker.value(e)
            }
          }
          // 将真正的事件处理函数赋值给invoker.value
          invoker.value = nextValue
          invoker.attached = performance.now()
          // 绑定invoker作为事件处理函数
          el.addEventListener(name, invoker)
        } else {
          invoker.value = nextValue
        }
      } else if (invoker) {
        el.removeEventListener(name, invoker)
      }
    } else if (key === 'class') {
      el.className = nextValue || ''
    } else if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key]
      if (type === 'boolean' && nextValue === '') {
        el[key] = true
      } else {
        el[key] = nextValue
      }
    } else {
      el.setAttribute(key, nextValue)
    }
  },
  createText(text) {
    return document.createTextNode(text)
  },
  setText(el, text) {
    el.nodeValue = text
  },
  createComment(text) {
    return document.createComment(text)
  },
  setComment(el, comment) {
    el.nodeValue = comment
  }
})


function createRenderer(options) {
  const {
    createElement,
    insert,
    setElementText,
    patchProps,
    createText,
    setText,
    createComment,
    setComment
  } = options
  function patch(n1, n2, container, anchor) {
    // 如果n1存在，则对比n1和n2的类型
    if (n1 && n1.type !== n2.type) {
      // 如果新旧vnode的类型不同，则直接将旧的vnode卸载
      unmount(n1)
      n1 = null
    }
    const { type } = n2
    if (typeof type === 'string') {
      // 如果 n1 不存在，意味着挂载，则调用mountElement 函数完成挂载
      // n1 代表旧的vnode， n2 代表新的vnode，当n1不存在时，意味着没有旧的vnode，
      // 这时只需要挂载
      if (!n1) {
        mountElement(n2, container, anchor)
      } else {
        console.log(n1, n2)
        // n1 存在，意味着打补丁，
        patchElement(n1, n2)
      }
    } else if (type === Text) {
      // 如果新的vnode的类型是Text，则说明该vnode描述的是文本节点

      // 如果没有旧节点，则进行挂载
      if (!n1) {
        // 使用createTextNode 创建文本节点
        const el = n2.el = createText(n2.children)
        // 将文本节点插入到容器中
        insert(el, container)
      } else {
        // 如果旧vnode存在，只需要使用新文本节点的文本内容更新旧文本节点即可
        const el = n2.el = n1.el
        if (n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (type === Comment) {
      if (!n1) {
        const el = n2.el = createComment(n2.children)
        insert(el, container)
      } else {
        const el = n2.el = n1.el
        if (n2.children !== n1.children) {
          setComment(el, n2.children)
        }
      }
    } else if (type === Fragment) {
      if (!n1) {
        // 如果旧vnode不存在，则只需要将Fragment的children逐个挂载即可
        n2.children.forEach(c => patch(null, c, container))
      } else {
        // 如果旧vnode存在，则只需要更新Fragment的children即可
        patchChildren(n1, n2, container)
      }
    }
    else if (typeof type === 'object' || typeof type === 'function') {
      // 组件
      if (!n1) {
        if (n2.keptAlive) {
          n2.keepAliveInstance._activate(n2, container, anchor)
        } else {
          mountComponent(n2, container, anchor)
        }
      } else {
        patchComponent(n1, n2, anchor)
      }
    } else if (type === 'xxx') {
      // 其他类型的vnode
    }

  }
  // 任务缓存队列，用一个Set数据结构来表示，这样就可以自动对任务进行去重了
  const queue = new Set()
  // 一个标志，代表是否正在刷新任务队列
  let isFlushing = false
  // 创建一个立即resolve的Promis实例
  const p = Promise.resolve()
  // 调度器的主要函数，用来将一个任务添加到缓冲队列中，并开始刷新队列
  function queueJob(job) {
    // 将job 添加到任务队列queue中
    queue.add(job)
    // 如果还没有开始刷新队列，则刷新
    if (!isFlushing) {
      // 将标志设置为true， 以避免重复刷新
      isFlushing = true
      // 在微任务中刷新缓冲队列
      p.then(() => {
        try {
          // 执行任务队列中的任务
          queue.forEach(jon => job())
        } finally {
          // 重置状态
          isFlushing = false
          queue.length = 0
        }
      })
    }
  }
  function mountComponent(vnode, container, anchor) {

    const isFunctional = typeof vnode.type === 'function'

    const componentOptions = vnode.type

    if (isFunctional) {
      componentOptions = {
        render: vnode.type,
        props: vnode.type.props
      }
    }

    const { render, data, beforCreate, create, props: propOptions, beforeMount, mounted, beforeUpdate, updated } = componentOptions

    beforCreate && beforCreate()

    // 解析出最终的props数据 attrs数据
    const [props, attrs] = resolveProps(propOptions, vnode.props)

    const state = data ? reactive(data()) : null

    const instance = {
      state,
      //将解析出的props 数据包装为shalloReactive并定义到组件实例上
      props: shallowReactive(props),
      isMounted: false,
      subTree: null,
      // 将插槽添加到组件实例上
      slots,
      // 在组件实例中添加mounted数组，用来储存通过onMounted函数注册的生命周期钩子函数
      mounted: [],
      // 只有KeepAlive组件的实例下会有KeepAliveCtx属性
      keepAliveCtx: null
    }
    // 检查当前要挂载的组件是否是KeepAlive组件
    const isKeepAlive = vnode.type.__isKeepAlive
    if (isKeepAlive) {
      // 在KeepAlive组件实例上添加keepAliveCtx对象
      instance.keepAliveCtx = {
        // move 函数用来移动一段vnode
        move(vnode, container, anchor) {
          // 本质上是将组件渲染的内容移动到指定容器中，即隐藏容器中
          insert(vnode.component.subTree.el, container, anchor)
        },
        createElement
      }
    }
    // 定义emit函数，它接收两个参数
    // event：事件名称
    // payload： 传递给事件处理函数的参数

    function emit(event, ...payload) {
      // 根据约定对事件名称进行处理
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
      // 根据处理后的事件名称去props中寻找对应的事件处理函数
      const handler = instance.props[eventName]
      if (handler) {
        // 调用事件处理函数并传递参数
        handler(...payload)
      } else {
        console.log('事件不存在')
      }
    }

    // 直接使用编译好的vnode.children对象作为slots对象即可
    const slots = vnode.children || {}


    // setupContext
    const setupContext = { attrs, emit, slots }

    // 在调用setup函数之前，设置当前组件实例
    setCurrentInstance(instance)

    // 调用setup函数，将只读版本的props作为第一个参数传递，避免用户意外地修改props值
    // 将setupContext作为第二个参数传递
    const setupResult = setup(shollowReadonly(instance.props), setupContext)

    // 在setup函数执行完毕之后，重置当前组件实例
    setCurrentInstance(null)

    // setupState 用来储存由setup放回的数据
    let setupState = null
    // 如果setup函数的返回值是函数，则将其作为渲染函数
    if (typeof setupResult === "function") {
      if (render) console.log('setup 函数返回渲染函数，render 选项将被忽略')
      // 将setupResult 作为渲染函数
      render = setupResult
    } else {
      // 如果setup 的返回值不是函数，则作为数据状态赋值给setupState
      setupState = setupContext
    }

    vnode.component = instance

    /** 由于props数据与组件自身的状态数据都需要暴露到渲染函数中，
     * 并使得渲染函数能够通过this访问它们，因此需要分装一个渲染上下午对象
     * */
    const renderContext = new Proxy(instance, {
      get(t, k, r) {
        const { state, props } = t
        // 当k当值为$slots时，直接返回组件实例上的slots
        if (k === '$slots') return slots
        if (state && k in state) {
          return state[k]
        } else if (k in props) {
          return props[k]
        } else if (setupState && k in setupState) {
          // 渲染上下文需要增加对setupState的支持
          return setupState[k]
        } else {
          console.log('不存在')
        }
      },
      set(t, k, v, r) {
        const { state, props } = t
        if (state && k in state) {
          state[k] = v
        } else if (k in props) {
          props[k] = v
        } else if (setupState && k in setupState) {
          setupState[k] = v
        } else {
          console.log('不存在')
        }
      }
    })


    create && create.call(renderContext)
    effect(() => {
      const subTree = render.call(renderContext, renderContext)
      if (!instance.isMounted) {
        beforeMount && beforeMount.call(renderContext)
        patch(null, subTree, container, anchor)
        instance.isMounted = true
        // 遍历instance.mounted数组并逐个执行即可
        instance.mounted && instance.mounted.forEach(hook => hook.call(renderContext))
      } else {
        beforeUpdate && beforeUpdate.call(renderContext)
        patch(instance.subTree, subTree, container, anchor)

        // 在这里调用updated钩子
        updated && updated.call(renderContext)
      }
      instance.subTree = subTree
    }, { scheduler: queueJob })
  }
  function patchComponent(n1, n2, anchor) {
    // 获取组件实例，即n1.componet， 同时让新的组件虚拟节点n2.component也指向组件实例
    const instance = (n2.component = n1.component)
    // 获取当前的props数据
    const { props } = instance
    // 调用hasProps Changed检测为子组件传递的props是否发生变化，如果没有变化，则不需要更新
    if (hasPropsChanged(n1.props, n2.props)) {
      // 调用resolveProps函数重新获取props数据
      const [nextProps] = resolveProps(n2.type.props, n2.props)
      // 更新props
      for (const k in nextProps) {
        props[k] = nextProps[k]
      }
      // 删除不存在的props
      for (const k in props) {
        if (!(k in nextProps)) delete props[k]
      }
    }
  }
  function hasPropsChanged(prexProps, nextProps) {
    const nextKeys = Object.keys(nextProps)
    if (nextKeys.length !== Object.keys(prexProps).length) {
      return true
    }

    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i]
      if (nextProps[key] !== prexProps[key]) return true
    }

    return false
  }

  function resolveProps(options, propsData) {
    const props = {}
    const attrs = {}
    for (let key in propsData || key.startsWith('on')) {
      if (key in options) {
        // 如果为组件传递的 Props 数据在组件自身的props 选项中有定义，则将其视为合法的props
        props[key] = propsData[key]
      } else {
        // 否则将其作为attrs
        attrs[key] = propsData[key]
      }
    }
    return [props, attrs]
  }
  function unmount(vnode) {
    if (vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c))
      return
    } else if (typeof vnode.type === 'object') {
      if (vnode.shouldKeepAlive) {
        vnode.keepAliveInstance._deActivate(vnode)
      } else {
        unmount(vnode.component.subTree)
      }
      return
    }
    const parent = vnode.el.parentNode
    if (parent) {
      parent.removeChild(vnode.el)
    }
  }

  function render(vnode, container) {
    if (vnode) {
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        unmount(vnode)
        // 根据vnode获取要卸载的真实DOM元素
        const el = container._vnode.el
        // 获取el的父元素
        const parent = el.parentNode
        // 调用removeChild移除元素
        if (parent) {
          parent.removeChild(el)
        }
      }
    }
    container._vnode = vnode
  }

  function mountElement(vnode, container, anchor) {
    // 创建DOM元素
    const el = vnode.el = createElement(vnode.type)
    // 处理子节点，如果子节点是字符串，代表元素具有文本节点
    if (typeof vnode.children === 'string') {
      setElementText(el, vnode.children)
    } else if (Array.isArray(vnode.children)) {
      // 如果childern是数组，则遍历每一个子节点，并调用patch函数挂载它们
      vnode.children.forEach(child => {
        patch(null, child, el)
      })
    }

    if (vnode.props) {
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key])
      }
    }
    // 将元素添加到容器中
    insert(el, container, anchor)
  }

  function patchChildren(n1, n2, container) {
    // 判断新子节点的类型是否是文本节点
    if (typeof n2.children === 'string') {
      // 旧子节点的类型有三种可能：没有子节点、文本子节点以及一组子节点
      // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要做
      if (Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c))
      }
      // 最后将新的文本节点内容设置给容器元素
      setElementText(container, n2.children)
    } else if (Array.isArray(n2.children)) {
      // 封装patchKeyedChildren函数处理两组子节点
      patchKeyedChildren(n1, n2, container)

    } else {
      // 新子节点不存在
      // 旧子节点是一组子节点，只需逐个卸载即可
      if (Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c))
      } else if (typeof n1.children === 'string') {
        // 旧子节点是文本子节点，清空内容即可
        setElementText(container, '')
      }
      // 若没有旧子节点，什么都不需要做
    }
  }

  function defineAsyncComponent(options) {
    // options可以是配置项，也可以是加载器
    if (typeof options === 'function') {
      options = {
        loader: options
      }
    }
    const { loader } = options
    let InnerComp = null

    // 记录重试次数
    let retries = 0
    // 封装load函数用来加载异步组件
    function load() {
      return loader()
        // 捕获加载器的错误
        .catch((err) => {
          if (options.onError) {
            return new Promise((resolve, reject) => {
              const retry = () => {
                resolve(load())
                retries++
              }
              const fail = () => reject(err)

              options.onError(retry, fail, retries)
            })
          } else {
            throw error
          }
        })
    }



    return {
      name: 'AsyncComponentWrapper',
      setup() {
        // 异步组件是否加载成功
        const loaded = ref(false)
        // 定义error，当错误发生时，用来存储错误对象
        const error = shallowRef(null)

        // 是否正在加载 默认为false
        const loading = ref(false)
        const loadingTimer = null

        if (options.delay) {
          loadingTimer = setTimeout(() => {
            loading.value = true
          }, options.delay)
        } else {
          loading.value = true
        }

        // 执行加载器函数，返回一个Promise实例
        // 加载成功后，将加载成功的组件赋值给InnerComp，并将loaded标记为true，代表加载成功
        load().then(c => {
          InnerComp = c
          loaded.value = true
        }).catch((err) => error.value = err)
          .finally(() => {
            loading.value = false
            // 加载完成后，无论成功与否都要清楚延时定时器
            clearTimeout(loadingTimer)
          })
        let timer = null

        if (options.timeout) {
          timer = setTimeout(() => {
            const err = new Error('Async componet timed out after' + options.timeout + 'ms.')
            error.value = err
          }, options.timeout);
        }
        // 包装组件被卸载时清除定时器
        onUmounted(() => clearTimeout(timer))

        const placeholder = { type: Text, children: '' }
        return () => {
          if (loaded.value) {
            return { type: InnerComp }
          } else if (error.value && options.errorComponent) {
            return { type: options.errorComponent, props: { error: error.value } }
          } else if (loading.value && options.loadingComponent) {
            // 如果异步组件正在加载，并且用户指定了Loading组件，则渲染Loading组件
            return { type: options.loadingComponent }
          }
          return placeholder
        }
      }
    }
  }

  function patchKeyedChildren(n1, n2, container) {
    const oldChildren = n1.children
    const newChildren = n2.children

    // 处理相同的前置节点
    // 索引j指向新旧两组子节点的开头
    let j = 0;
    let oldVnode = oldChildren[j]
    let newVnode = newChildren[j]
    // while 循环向后遍历，直到遇到拥有不同key值的节点为止
    while (oldVnode.key === newVnode.key) {
      // 调用patch函数进行更新
      patch(oldVnode, newVnode, container)
      j++
      oldVnode = oldChildren[j]
      newVnode = newChildren[j]
    }

    // 更新相同的后置节点
    // 索引oldEnd指向旧的一组子节点的最后一个节点
    let oldEnd = oldChildren.length - 1
    // 索引newEnd指向新的一组子节点的最后一个节点
    let newEnd = newChildren.length - 1

    oldVnode = oldChildren[oldEnd]
    newVnode = newChildren[newEnd]

    // while 循环从后向前遍历，直到遇到拥有不同key值的节点为止
    while (oldVnode.key === newVnode.key) {
      patch(oldVnode, newVnode, container)

      oldEnd--
      newEnd--
      oldVnode = oldChildren[oldEnd]
      newVnode = newChildren[newEnd]
    }

    // oldEnd < j :在预处理过程中，所有的旧子节点都处理完毕了
    // newEnd >= j : 在预处理过后，在新的一组子节点中，仍然有未被处理的节点，而这些遗留的节点将被视作新增节点
    // 计算锚点的索引值，如果小于新的一组子节点的数量，则说明锚点元素在新的一组子节点中，
    // 所以直接使用newChildren[anchorIndex].el作为锚点元素
    // 否则说明索引newEnd对应的节点已经是尾部节点了，这是无须提供锚点元素。

    if (j > oldEnd && j <= newEnd) {
      const anchorIndex = newEnd + 1
      const anchor = anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null

      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor)
      }
    } else if (j > newEnd && j <= oldEnd) {
      // j 到 oldEnd 之间的节点应该被卸载
      while (j <= oldEnd) {
        unmount(oldChildren[j++])
      }
    } else {
      // 构造source数组
      // 新的一组子节点中剩余未处理节点的数量
      const count = newEnd - j + 1
      const source = new Array(count)
      source.fill(-1)

      // oldStart 和 newStart 分别为起始索引，即 j
      const oldStart = j
      const newStart = j

      // 新增两个变量，moved 和pos
      let moved = false
      let pos = 0

      const keyIndex = {}
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i
      }
      console.log(keyIndex)


      // 新增patched变量，代表更新过的节点数量
      let patched = 0
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVnode = oldChildren[i]
        // 如果更新过的节点数量小于等于需要更新的节点数量，则执行更新
        if (patched <= count) {
          const k = keyIndex[oldVnode.key]
          if (typeof k !== 'undefined') {
            newVnode = newChildren[k]
            patch(oldVnode, newVnode, container)
            // 没更新一个节点，都将patched变量 +1
            patched++
            source[k - newStart] = i
            // 判断节点是否需要移动
            if (k < pos) {
              moved = true
            } else {
              pos = k
            }
          } else {
            unmount(oldVnode)
          }
        } else {
          // 如果更新过的节点数量大于需要更新的节点数量，则卸载多余的节点
          unmount(oldVnode)
        }
      }

      if (moved) {
        const seq = lis(sources)
        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1
        // i 指向新的一组子节点的最后一个元素
        let i = count - 1
        // for 循环使得i递减，
        for (i; i >= 0; i--) {
          if (source[i] === -1) {
            const pos = i + newStart
            const newVnode = newChildren[pos]
            const nextPos = pos + 1
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null
            patch(null, newVnode, container, anchor)
          } else if (i !== seq[s]) {
            // 如果节点的索引i不等于seq[s]的值，说明该节点需要移动
            const pos = i + newStart
            const newVnode = newChildren[pos]
            const nextPos = pos + 1
            const anchor = nextPos < newChildren.length ? newChildren[nextPos] : null
            insert(newVnode.el, container, anchor)
          } else {
            // 当i===seq[s]时，说明该位置的节点不需要移动， 只需要让s指向下一个位置
            s--
          }
        }
      }
    }
  }

  function patchElement(n1, n2) {
    console.log(n1)
    const el = n2.el = n1.el
    const oldProps = n1.props
    const newProps = n2.props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key])
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null)
      }
    }

    patchChildren(n1, n2, el)
  }

  const KeepAlive = {
    // KeepAlive 组件独有的属性，用作标识
    __isKeepAlive: true,
    setup(props, { slots }) {
      // 创建一个缓存对象
      // key: vnode.type
      // value: vnode
      const cache = new Map()
      // 当前KeepAlive组件的实例
      const instance = setCurrentInstance
      // 对于KeepAlive组件来说，它的实例上存在特殊的keepAliveCtx对象，该对象
      // 由渲染器注入该对象会暴露渲染器的一些内部方法，其中move函数用来将一段DOM
      // 移动到另一个容器中
      const { move, createElement } = instance.keepAliveCtx

      // 创建隐藏容器
      const storageContainer = createElement('div')
      // KeepAlive 组件的实例上会被添加两个内部方法，分别是_deActivate 和 _activate
      // 这两个函数会在渲染器中被调用

      instance._deActivate = (vnode) => {
        move(vnode, storageContainer)
      }
      instance._activate = (vnode, container, anchor) => {
        move(vnode, container, anchor)
      }

      return () => {
        // KeepAlive 的默认插槽就是要被KeepAlive的组件
        let rawVNode = slots.default()
        // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被KeepAlive
        if (typeof rawVNode.type !== 'object') {
          return rawVNode
        }
        // 获取 “内部组件” 的name
        const name = rawVNode.type.name
        // 对name进行匹配 如果name无法被include匹配 或者被exclude匹配
        if (name && ((props.include && !props.include.test(name))) || (props.exclude && props.exclude.test(name))) {
          // 则直接渲染 “内部组件”， 不对其进行后续的缓存操作
          return rawVNode
        }

        // 在挂载时先获取缓存的组件vnode
        const cacheVNode = cache.get(rawVNode.type)

        if (cacheVNode) {
          // 如果有缓存的内容，则说明不应该执行挂载，而应该执行激活
          // 继承组件实例
          rawVNode.component = cacheVNode.component
          // 在vnode上添加keptAlive属性，标记为true，避免渲染器重新挂载它
          rawVNode.keptAlive = true
        } else {
          // 如果没有缓存，则将其添加到缓存中，这样下次激活组件时就不会执行新的挂载动作了
          cache.set(rawVNode.type.rawVNode)
        }
        // 在组件vnode上添加shouldKeepAlive属性，并标记为true，避免渲染器真的将组件卸载
        rawVNode.shouldKeepAlive = true
        // 将KeepAlive组件的实例也添加到vnode上，以便在渲染器中访问
        rawVNode.keepAliveInstance = instance
        // 渲染组件vnode
        return rawVNode
      }
    }
  }

  return {
    render
  }
}

function shouldSetAsProps(el, key, value) {
  if (key === "form" && el.tagName === 'INPUT') return false
  return key in el
}




const Fragment = Symbol()

