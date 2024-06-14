let activeEffect
const bucket = new WeakMap()
const data = { text: '响应式数据测试' }
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

  const effectToRun = new Set(effects)
  effectToRun.forEach(effectFn => effectFn())
  // 如果在枚举（遍历）集合的过程中,除了通过迭代器自身的 remove 方法之外,有其他元素被添加到集合或从集合中删除,则枚举的行为是未定义的。
  // 下面代码会造成无限循环执行，
  // effects && effects.forEach(fn => fn())
}

function effect(fn) {
  const effectFn = () => {
    // 当effectFn执行时，将其设置为当前激活的副作用函数
    cleanup(effectFn)
    activeEffect = effectFn
    fn()
  }
  // activeEffect.deps用来存储所有与该副作用函数相关联的依赖合集
  effectFn.deps = []
  // 执行副作用函数
  effectFn()
}

function cleanup(effectFn) {
  console.log(effectFn)
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖合集
    const deps = effectFn.deps[i]
    // 将effectFn 从依赖集合中移除
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

effect(() => {
  console.log(2)
  document.body.innerText = obj.text
})

setTimeout(() => {
  obj.text = "hahaha"
}, 2000)