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
        } ``
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
      // 重新实现两组子节点的更新方式
      // 新旧children
      const oldChildren = n1.children
      const newChildren = n2.children

      // 用来存储寻找过程中遇到的最大索引值
      let lastIndex = 0

      // 遍历新的children
      for (let i = 0; i < newChildren.length; i++) {
        const newVnode = newChildren[i]

        let j = 0
        // 在第一层循环中定义变量find，代表是否在旧的一组子节点中找到可复用的节点
        // 初始值为 false， 代表没找到
        let find = false

        // 遍历旧的children
        for (j; j < oldChildren.length; j++) {
          const oldVnode = oldChildren[j]
          // 如果找到了具有相同key值的两个节点，说明可以复用，但仍然需要调用patch函数更新
          if (newVnode.key === oldVnode.key) {
            find = true
            patch(oldVnode, newVnode, container)
            if (j < lastIndex) {
              // 如果当前找到的节点在旧children中的索引小于最大索引值lastIndex
              // 说明该节点对应的真实DOM需要移动

              // 运行到这里，说明newVnode对应的真实DOM需要移动
              // 先获取newVnode的前一个vnode，即prevnode
              const preVNode = newChildren[i - 1]

              // 如果preVNode不存在，说明当前newVNode是第一个节点，它不需要移动
              if (preVNode) {
                // 由于我们要将newVnode对应的真实DOM移动到preVNode所对应真实DOM后面
                // 索引我们需要获取preVNode所对应真实DOM的下一个兄弟节点，并将其作为锚点
                const anchor = preVNode.el.nextSibling
                // 调用insert方法将newVNode对应的真实DOM插入到锚点元素前面
                // 也就是preVNode对应真实DOM后面
                insert(newVnode.el, container, anchor)
              }

            } else {
              // 如果当前找到的节点在旧children中的索引不小于最大索引值
              // 则更新lastIndex 的值
              lastIndex = j
            }
            break
          }
        }
        // 如果代码运行到这里，find仍然为false
        // 说明当前newVNode没有在旧的一组节点中找到可复用的节点
        // 也就是说，当前newVNode是新增节点，需要挂载
        if (!find) {
          // 为了将节点挂载到正确位置，我们需要先获取锚点元素
          // 首先获取当前newVNode的前一个vnode节点
          const preVNode = newChildren[i - 1]
          let anchor = null
          if (preVNode) {
            // 如果有前一个vnode节点，则使用它的下一个兄弟节点作为锚点元素
            anchor = preVNode.el.nextSibling
          } else {
            // 如果没有前一个vnode节点，说明即将挂载的新的节点是第一个子节点
            // 这是我们使用容器元素的firstChild作为锚点
            anchor = container.firstChild
          }
          patch(null, newVnode, container, anchor)
        }
      }

      // 遍历旧的一组子节点
      for (let i = 0; i < oldChildren.length; i++) {
        const oldVNode = oldChildren[i]
        // 拿旧的子节点oldVNode去新的一组子节点中寻找具有相同key值的节点
        const has = newChildren.find(vnode => vnode.key === oldVNode.key)
        if (!has) {
          // 如果没有找到具有相同key值的节点，则说明需要删除该节点
          // 调用unmount函数将其卸载
          unmount(oldVNode)
        }
      }

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