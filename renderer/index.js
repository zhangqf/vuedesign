const vnode = {
  type: 'h1',
  children: 'hello'
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
  }
})

// 调用render函数渲染该vnode

console.log(document.querySelector('#app'))

renderer.render(vnode, document.querySelector('#app'))

function createRenderer(options) {
  const {
    createElement,
    insert,
    setElementText
  } = options
  function patch(n1, n2, container) {
    // 如果 n1 不存在，意味着挂载，则调用mountElement 函数完成挂载
    // n1 代表旧的vnode， n2 代表新的vnode，当n1不存在时，意味着没有旧的vnode，
    // 这时只需要挂载
    if (!n1) {
      mountElement(n2, container)
    } else {
      // n1 存在，意味着打补丁，
    }
  }

  function render(vnode, container) {
    if (vnode) {
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        container.innerHTML = ''
      }
    }
    container._vnode = vnode
  }

  function mountElement(vnode, container) {
    // 创建DOM元素
    const el = createElement(vnode.type)
    // 处理子节点，如果子节点是字符串，代表元素具有文本节点
    if (typeof vnode.children === 'string') {
      setElementText(el, vnode.children)
    }
    // 将元素添加到容器中
    insert(el, container)
  }

  return {
    render
  }
}


const renderer1 = createRenderer({
  createElement(tag) {
    console.log(`创建元素${tag}`)
    return { tag }
  },
  setElementText(el, text) {
    console.log(`设置${JSON.stringify(el)}的文本内容：${text}`)
    el.text = text
  },
  insert(el, parent, anchor = null) {
    console.log(`将${JSON.stringify(el)}添加到${JSON.stringify(parent)}下`)
    parent.children = el
  }
})

const container = { type: 'root' }

renderer1.render(vnode, container)