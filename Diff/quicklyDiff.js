const vnode = {
  type: 'div',
  children: [
    {
      type: 'p',
      children: 'hello'
    }
  ]
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

// 调用render函数渲染该vnode

console.log(document.querySelector('#app'))

renderer.render(vnode, document.querySelector('#app'))

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
    else if (typeof type === 'object') {
      // 组件
    } else if (type === 'xxx') {
      // 其他类型的vnode
    }

  }

  function unmount(vnode) {
    if (vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c))
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
          if (i !== seq[s]) {
            // 如果节点的索引i不等于seq[s]的值，说明该节点需要移动
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

  return {
    render
  }
}

function shouldSetAsProps(el, key, value) {
  if (key === "form" && el.tagName === 'INPUT') return false
  return key in el
}



const vnode1 = {
  type: 'div',
  props: {
    id: 'foo',
    onClick: () => {
      alert('clicked')
    },
    onContextmenu: () => {
      alert('contextmenu')
    }
  },
  children: [
    {
      type: 'p',
      children: 'hello'
    }
  ]
}


const Fragment = Symbol()

const vnode2 = {
  type: Fragment,
  children: [
    { type: 'li', children: 'text1' },
    { type: 'li', children: 'text2' },
    { type: 'li', children: 'text3' },
  ]
}
const vnodeF = {
  type: 'ul',
  children: [
    {
      type: Fragment,
      children: [
        { type: 'li', children: 'text1' },
        { type: 'li', children: 'text2' },
        { type: 'li', children: 'text3' },
      ]
    }
  ]
}


renderer.render(vnodeF, document.querySelector('#app'))


const oldVnode = {
  type: 'div',
  children: [
    { type: 'p', children: '1', key: 1 },
    { type: 'p', children: '2', key: 2 },
    { type: 'p', children: '3', key: 3 },
    { type: 'p', children: '4', key: 4 },
    { type: 'p', children: '5', key: 5 },

  ]
}

const newVnode = {
  type: 'div',
  children: [
    { type: 'p', children: '1', key: 1 },
    { type: 'p', children: '3', key: 3 },
    { type: 'p', children: '4', key: 4 },
    { type: 'p', children: '2', key: 2 },
    { type: 'p', children: '5', key: 5 },
  ]
}

renderer.render(oldVnode, document.querySelector('#app'))


setTimeout(() => {
  renderer.render(newVnode, document.querySelector('#app'))
}, 6000);