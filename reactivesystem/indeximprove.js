let activeEffect
const bucket = new Set()
const data = { text: '响应式数据测试' }
const obj = new Proxy(data, {
  get(target, key) {
    if (activeEffect) {
      bucket.add(activeEffect)
    }
    return target[key]
  },
  set(target, key, value) {
    target[key] = value
    bucket.forEach(fn => fn())
    return true
  }
})
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
  obj.iskel = "hahaha"
}, 1000)