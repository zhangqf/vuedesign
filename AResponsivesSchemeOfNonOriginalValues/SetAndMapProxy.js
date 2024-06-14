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

  // 如果操作目标是数组，并且修改了数组的length属性  
  if (Array.isArray(target) && key === 'length') {
    // 对于索引大于或等于length值的元素，需要把所有相关联的副作用函数取出并添加到effectToRun中待执行 
    depsMap.forEach((effects, key) => {
      if (key >= newVal) {
        effects.forEach(effectFn => {
          effectToRun.add(effectFn)
        })
      }
    })
  }

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

const ITERATE_KEY = Symbol()

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
      if (key === "size") {
        return Reflect.get(target, key, target)
      }
      // 如果操作的目标对象是数组，并且key存在与arrayInstrumentation上 
      // 那么返回定义在arrayInstrumentation上的值 
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }
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



const arr1 = [1, 2, 3, 4]
arr1[Symbol.iterator] = function () {
  const target = this
  const len = target.length
  let index = 0
  return {
    next() {
      return {
        value: index < len ? target[index] : undefined,
        done: index++ >= len
      }
    }
  }
}




  ;['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
    const originMethod = Array.prototype[method]
    arrayInstrumentations[method] = function (...args) {
      shouldTrack = false
      let res = originMethod.apply(this, args)
      shouldTrack = true
      return res
    }
  });


// 普通对象的读取和设置操作
const obj = { foo: 1 }
console.log(obj.foo)
obj.foo = 2

// 用get/set方法操作Map数据
const map = new Map()
map.set('key', 1)
console.log(map.get('key'))


// const proxy = reactive(new Map([['key', 1]]))


// effect(() => {
//   console.log(proxy.get('key'))
// })

// proxy.set('key', 2)

const s = new Set([1, 2, 3])
const p = new Proxy(s, {
  get(target, key, receiver) {
    if (key === 'size') {
      return Reflect.get(target, key, target)
    }
    return target[key].bind(target)
  }
})
