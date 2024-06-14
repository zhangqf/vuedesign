// 当前激活的effect函数
let activeEffect
// effect 栈
const effectStack = []

const bucket = new WeakMap()
const data = { foo: 1, bar: 2 }
const obj = new Proxy(data, {
  get(target, key) {
    track(target, key)
    return target[key]
  },
  //拦截设置操作
  set(target, key, value) {
    target[key] = value
    trigger(target, key)
  }
})

function track(target, key) {
  // 没有activeEffect， 直接返回
  if (!activeEffect) {
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

function trigger(target, key) {
  const depsMap = bucket.get(target)
  console.log(bucket)
  if (!depsMap) return
  const effects = depsMap.get(key)

  const effectToRun = new Set()
  effects && effects.forEach(effectFn => {
    if (effectFn !== activeEffect) {
      effectToRun.add(effectFn)
    }
  })

  effectToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })

  // 如果在枚举（遍历）集合的过程中,除了通过迭代器自身的 remove 方法之外,有其他元素被添加到集合或从集合中删除,则枚举的行为是未定义的。
  // 下面代码会造成无限循环执行，
  // effects && effects.forEach(fn => fn())
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

function computed(getter) {
  // value 用来缓存上一次计算的值 
  let value
  // dirty标志，用来标识是否需要重新计算值，为 true 则意味着 脏，需要计算 
  let dirty = true

  const effectFn = effect(getter, {
    lazy: true,
    // 添加调度器，在调度器中将dirty重置为true 
    scheduler() {
      dirty = true
      // 当计算属性依赖的响应式数据变化时，手动调用trigger 函数触发响应 
      trigger(obj, 'value')
    }
  })
  const obj = {
    get value() {
      // 只有脏时才计算值，并将得到的值缓存到value中 
      if (dirty) {
        value = effectFn()
        dirty = false
      }
      // 当读取value时，手动调用track函数进行追踪 
      track(obj, 'value')
      return value

    }
  }
  return obj
}

// watch 函数接受两个参数，source是响应式数据，cb是回调函数
function watch(source, cb, options = {}) {
  let getter
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }
  let oldValue, newValue
  // cleanup 用来存储用户注册的过去回调 // [!code ++]
  let cleanup // [!code ++]
  function onInvalidate(fn) { // [!code ++]
    cleanup = fn // [!code ++]
  } // [!code ++]
  const job = () => {
    newValue = effectFn()
    if (cleanup) { // [!code ++]
      cleanup() // [!code ++]
    } // [!code ++]
    cb(newValue, oldValue, onInvalidate) // [!code ++]
    oldValue = newValue
  }
  const effectFn = effect(
    () => getter(),
    {
      lazy: true,
      scheduler: () => {
        // 在调度函数中判断flush是否为post，如果是，将其放到微任务队列中执行 
        if (options.flush === 'post') {
          const p = Promise.resolve()
          p.then(job)
        } else {
          job()
        }
      }
    }
  )
  if (options.immediate) {
    job()
  } else {
    oldValue = effectFn()
  }
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

const watchObj = new Proxy(data, {
  get(target, key) {
    track(target, key)
    return target[key]
  },
  //拦截设置操作
  set(target, key, value) {
    target[key] = value
    trigger(target, key)
  }
})

const watchData = { foo: 1 }
watch(watchObj, () => {
  console.log('changed')
}, {
  immediate: true
})
// watchObj.foo++


watch(() => watchObj.foo, () => { console.log('objdata changed!') })

watchObj.foo++

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖合集
    const deps = effectFn.deps[i]
    // 将effectFn 从依赖集合中移除
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

const sumRes = computed(() => obj.foo + obj.bar)

// console.log(sumRes.value)
// console.log(sumRes.value)
// effect(() => {
//   console.log(obj.foo)
// }, {
//   scheduler(fn) {
//     setTimeout(fn)
//   }
// })

// obj.foo++
// console.log('end')