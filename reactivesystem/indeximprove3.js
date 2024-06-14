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
  deps.add(activeEffect)
}

function trigger(target, key) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  const effects = depsMap.get(key)
  effects && effects.forEach(fn => fn())
}

function effect(fn) {
  // 注册副作用函数
  activeEffect = fn
  fn()
}
effect(() => {
  console.log(2)
  document.body.innerText = obj.text
})

setTimeout(() => {
  obj.text = "hahaha"
}, 2000)