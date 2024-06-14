// 当前激活的effect函数
let activeEffect
// effect 栈
const effectStack = []

const bucket = new WeakMap()

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

function trigger(target, key, type) {
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
  if (type === "ADD" || type === "DELETE") { // [!code ++]
    const iterateEffects = depsMap.get(ITERATE_KEY)
    // 将与ITERATE_KEY相关联的副作用函数也添加到effectsToRun 
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn != activeEffect) {
        effectToRun.add(effectFn)
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

// effect(() => {
//   for (const key in p) {
//     console.log(key)
//   }
// })

// p.foo = 8
// p.bar = 88
// p.ds = 99
// delete p.ds


// function reactive(obj) {
//   return new Proxy(obj, {
//     get(target, key, receiver) {
//       if (key === 'raw') {
//         return target
//       }
//       track(target, key)
//       const res = Reflect.get(target, key, receiver)
//       if (typeof res === 'object' && res != null) {
//         // 调用reactive将结果包装成响应式数据并返回
//         return reactive(res)
//       }
//       return res
//     },
//     ownKeys(target) {
//       track(target, ITERATE_KEY)
//       return Reflect.ownKeys(target)
//     },
//     set(target, key, newVal, receiver) {

//       const oldVal = target[key]

//       // 判读目标的这个key 是否是自身拥有的，若是，则为set，不是则为 add
//       const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : "ADD"
//       const res = Reflect.set(target, key, newVal, receiver)
//       if (target === receiver.raw) { // [!code ++]
//         if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
//           trigger(target, key, type)
//         }
//       } // [!code ++]
//       return res
//     },
//     deleteProperty(target, key) {
//       const hadkey = Object.prototype.hasOwnProperty.call(target, key)
//       const res = Reflect.deleteProperty(target, key)
//       if (res && hadkey) {
//         trigger(target, key, 'DELETE')
//       }
//     }
//   })
// }
const obj1 = {}
const proto = { bar: 1 }
const child = reactive(obj1)
const parent = reactive(proto)

console.log(child.raw === obj1)
console.log(parent.raw === proto)

Object.setPrototypeOf(child, parent)

effect(() => {
  console.log(child.bar)
})

child.bar = 2


function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get(target, key, receiver) {
      if (key === 'raw') {
        return target
      }
      if (!isReadonly) {
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
      const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
      const res = Reflect.set(target, key, newVal, receiver)

      if (target === receiver.raw) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type)
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

function reactive(obj) {
  return createReactive(obj)
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


const obj3 = readonly({ foo: { bar: 2 } })

obj3.foo.bar = 2
