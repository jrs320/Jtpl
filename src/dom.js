/**
 * dom操作相关
 * @author jrs
 */

const modelTagName = 'j'

class El {
  constructor(query) {
    this.el = this[0] = (query instanceof HTMLElement === true
      || query instanceof DocumentFragment === true)
      ? query
      : document.querySelector(query)
  }
  find(query) {
    if (!this.el) return
    return new El(this.el.querySelector(query))
  }
  on(eventName, eventBind) {
    if (!this.el) return
    this.el.addEventListener(eventName, eventBind)
    return this
  }
  off(eventName, eventBind) {
    if (!this.el) return
    this.el.removeEventListener(eventName, eventBind)
    return this
  }
  insertAfter(el) {
    if (!el) return
    el = el instanceof El ? el.el : el
    let parentNode = el.parentNode
    if (parentNode.lastChild === el) {
      parentNode.appendChild(this.el)
    }
    else {
      parentNode.insertBefore(this.el, el.nextSibling)
    }
  }
  insertBefore(el) {
    if (!el) return
    el = el instanceof El ? el.el : el
    let parentNode = el.parentNode
    parentNode.insertBefore(this.el, el)
  }
  attr(name, value) {
    if (!this.el) return
    if (arguments.length > 1) {
      this.el.setAttribute(name, value)
    }
    else {
      return this.el.getAttribute(name)
    }
    return this
  }
  html(value) {
    if (!this.el) return
    this.el.innerHTML = value
  }
  val(value) {
    if (!this.el) return
    this.el.innerText = value
  }
  remove() {
    if (!this.el) return
    this.el.parentNode.removeChild(this.el)
    this.el = null
    this[0] = null
  }
}

const $dom = (query) => {
  let $el = new El(query)
  return $el
}

const on = (el, eventName, eventBind) => {
  if (el instanceof El) {
    el.on(eventName, eventBind)
    return
  }
  el.addEventListener(eventName, eventBind)
}

const off = (el, eventName, eventBind) => {
  if (el instanceof El) {
    el.on(eventName, eventBind)
    return
  }
  el.removeEventListener(eventName, eventBind)
}

export default $dom
export {
  modelTagName,
  on,
  off
}

