const bucket = new Set()

const data = { text: '响应式数据测试' }

const obj = new Proxy(data, {
  get(target, key) {
    bucket.add(effect)
    return target[key]
  },
  set(target, key, value) {
    target[key] = value
    bucket.forEach(fn => fn())
    return true
  }
})

function effect() {
  document.body.innerText = obj.text
}
effect()

setTimeout(() => {
  document.body.innerText = 'vue3'
}, 1000)