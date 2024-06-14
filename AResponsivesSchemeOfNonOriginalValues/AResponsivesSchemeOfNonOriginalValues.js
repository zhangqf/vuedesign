
const fn = (name) => {
  console.log(name)
}

const obj = { foo: 1 }
const p1 = new Proxy(obj, {
  get(target, key) {
    return target[key] * 2
  },
  set(target, key, value) {
    target[key] = value
  }
})
console.log(p1.foo) // 2
p1.foo++
console.log(p1.foo) // 6
const p = new Proxy(fn, {
  apply(target, thisArg, argArray) {
    target.call(thisArg, ...argArray)
  }
})

p('ywszrsqx') //  ywszrsqx


console.log(obj.foo) // 3
console.log(Reflect.get(obj, 'foo')) //3

const obj1 = { foo: 1 }
console.log(Reflect.get(obj1, 'foo', { foo: 10 })) // 1


const obj2 = { foo: 3 }
const p2 = new Proxy(obj2, {
  deleteProperty(target, key) {
    return Reflect.deleteProperty(target, key)
  },
  has(target, key) {
    return key in target
  }
})
console.log('foo' in p2)

console.log(obj2.hasOwnProperty('foo'))
console.log(p2.foo)
delete p2.foo
console.log(p2.foo)


