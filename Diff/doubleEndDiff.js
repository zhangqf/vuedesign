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

    let oldStartIdx = 0
    let odlEnIdx = oldChildren.length - 1
    let newStartIdx = 0
    let newEndIdx = newChildren.length - 1

    // 四个索引指向的vnode节点
    let oldStartVNode = oldChildren[oldStartIdx]
    let oldEndVNode = oldChildren[odlEnIdx]
    let newStartVNode = newChildren[newStartIdx]
    let newEndVNode = newChildren[newEndIdx]

    while (oldStartIdx <= odlEnIdx && newStartIdx <= newEndIdx) {
      // 增加两个判断分支，如果头尾部节点为undefined，则说明该节点已经被处理过了，直接跳到下一个位置
      if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx]
      } else if (!oldEndVNode) {
        oldEndVNode = newChildren[--oldEndIdx]
      } else if (oldStartVNode.key === newStartVNode.key) {
        // 第一步 oldStartVNode和newStartVNode比较
        // 调用patch函数在oldStartVNode与newStartVNode之间打补丁
        patch(oldStartVNode, newStartVNode, container)
        // 更新相关索引，指向下一个位置
        oldStartVNode = oldChildren[++oldStartIdx]
        newStartVNode = newChildren[++newStartIdx]
      } else if (oldEndVNode.key === newEndVNode.key) {
        // 第二步 oldEndVNode 和 newEndVNode比较
        // 由于两者对处于尾部，因此不需要对真实DOM进行移动操作，只需要打补丁即可
        patch(oldEndVNode, newEndVNode, container)
        // 更新索引和头尾部节点变量
        oldEndVNode = oldChildren[--oldEndIdx]
        newEndVNode = newChildren[--newEndVNode]
      } else if (oldStartVNode.key === newEndVNode.key) {
        // 第三步 oldStartVNode 和 newEndVnode 比较
        // 调用patch函数在oldstartVNode和newEndVNode之间打补丁
        patch(oldStartVNode, newEndVNode, container)
        // 将旧的一组子节点的头部节点对应的真实DOM节点oldStartVNode.el移动到旧的一组子节点的尾部节点对应的真实DOM节点后面
        insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling)
        // 更新相关索引到下一个位置
        oldStartVNode = oldChildren[++oldStartIdx]
        newEndVNode = newChildren[--newEndIdx]

      } else if (oldEndVNode.key === newStartVNode.key) {
        // 第四步 oldEndVNode 和 newStartVNode 比较
        // 仍然需要调用patch函数进行打补丁
        patch(oldEndVNode, newStartVNode, container)
        // 移动DOM操作
        // oldEndVNode.el 移动到 oldStartVNode.el 前面
        insert(oldEndVNode.el, container, oldStartVNode.el)

        // 移动DOM完成后，更新索引值，并指向下一个位置
        oldEndVNode = oldChildren[--odlEnIdx]
        newStartVNode = newChildren[++newStartIdx]

      } else {
        // 遍历旧的一组子节点，试图寻找与newstartVNode拥有相同key值的节点
        // idxInOld就是新的一组子节点的头部节点在旧的一组子节点中的索引
        const idxInOld = oldChildren.findIndex(
          node => node.key === newStartVNode.key
        )
        // 如果idxInOld 大于0， 说明找到了可复用的节点，并且需要将其对应的真实DOM
        // 移动到头部
        if (idxInOld > 0) {
          // idxInOld 位置对应的vnode就是需要移动的节点
          const vnodeToMove = oldChildren[idxInOld]
          // 移动之前需要先打补丁
          patch(vnodeToMove, newStartVNode, container)
          // 将vnodeToMove.el 移动到头部节点oldStartVNode.el之前，因此使用后者作为锚点
          insert(vnodeToMove.el, container, oldStartVNode.el)
          // 由于位置idxInOld处的节点所对应的真实DOM已经移动到了别处，因此将其设置为undefined
          oldChildren[idxInOld] = undefined
          // 最后更新newStartIdx 到下一个位置
          newStartVNode = newChildren[++newStartIdx]
        } else {
          // 将newStartVNode作为新节点挂载到头部，使用当前头部节点oldStartVNode.el作为锚点
          patch(null, newStartVNode, container, oldStartVNode.el)
        }
        newStartVNode = newChildren[++newStartIdx]
      }
    }

    // 循环结束后检查索引值的情况
    if (oldEndIdx < oldStartIdx && newStartIdx <= newEndIdx) {
      // 如果满足条件，则说明有新的节点遗留，需要挂载它们
      for (let i = newStartIdx; i < newEndIdx; i++) {
        patch(null, newChildren[i], container, oldStartVNode.el)
      }
    } else if (newEndIdx < newStartIdx && oldStartIdx <= oldEndIdx) {
      // 移除操作
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        unmount(oldChildren[i])
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
    { type: 'p', children: 'hello', key: 3 },
  ]
}

const newVnode = {
  type: 'div',
  children: [
    { type: 'p', children: '666', key: 3 },
    { type: 'p', children: '1', key: 1 },
    { type: 'p', children: '2', key: 2 },
  ]
}

renderer.render(oldVnode, document.querySelector('#app'))


setTimeout(() => {
  renderer.render(newVnode, document.querySelector('#app'))
}, 1000);