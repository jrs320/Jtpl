/**
 * MVVM
 * @author jrs
 */

import $dom from './dom.js'
import Jtpl from './jtpl.js'
import { transformListItem } from './jtpl.js'
import { fieldData, clone, destroy } from './util.js'
class MVVM {
  constructor(data, jtpl) {
    this.jtpl = jtpl
    this.data = data
    this.lists = {}
    this.views = {}
    // 更新字段影响的view id
    this.fieldForVids = {}
    this.watches = {}
    this._observer(data, [])
  }
  _observer(data, prefix, keys) {
    if (!data) return
    keys = keys || Object.keys(data)
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i]
      let value = data[key]
      if (value instanceof Jtpl || !data.hasOwnProperty(key)) {
        continue
      }
      ;(initValue => {
        Object.defineProperty(data, [key], {
          configurable: true,
          enumerable: true,
          get: () => {
            return initValue
          },
          set: newValue => {
            if (initValue !== newValue) {
              let oldValue = initValue
              initValue = newValue
              this._setValue(key, newValue, oldValue, prefix)
            }
          }
        })
      })(value)
      ;if (typeof value === 'object') {
        this._observer(value, [...prefix, key])
        if (Array.isArray(value)) {
          this._observerList(value, [...prefix, key])
        }
      }
    }
  }
  _observerList(data, prefixKeys) {
    let self = this
    let methods = [
      'push',
      'pop',
      'shift',
      'unshift',
      'splice',
      'sort',
      'reverse'
    ]
    methods.forEach(method => {
      let fn = data[method]
      data[method] = function() {
        let args = [...arguments]
        if (['push', 'pop'].includes(method)) {
          let domLists = self.lists[prefixKeys.join()]
          if (domLists) {
            domLists.forEach(list => {
              list[method].apply(list, args)
            })
          }
          return fn.apply(this, args)
        }
        else {
          let result = fn.apply(this, args)
          fieldData(self.data, prefixKeys.join(), clone(this))
          return result
        }
      }
    })
  }
  _setValue(key, newValue, oldValue, prefix) {
    let { fieldForVids, views } = this
    let prefixKeys = [...prefix, key]
    if (typeof newValue === 'object') {
      this._observer(newValue, prefixKeys)
      if (Array.isArray(newValue)) {
        this._observerList(newValue, prefixKeys)
        let domLists = this.lists[[...prefix, key].join()]
        if (domLists) {
          domLists.forEach(list => {
            list.update(newValue)
          })
        }
      }
    }
    let updateViewIds = new Set()
    for (let field in fieldForVids) {
      if (new RegExp(`^${prefixKeys.join()}`).test(field)) {
        let viewIds = fieldForVids[field]
        viewIds.forEach(viewId => {
          let view = views[viewId]
          if (!view) {
            return
          }
          // if (view.isUpdateByArrayMethod(prefixKeys)) {
          //   viewIds.delete(viewId)
          // }
          // else {
          //   updateViewIds.add(viewId)
          // }
          updateViewIds.add(viewId)
        })
      }
    }
    updateViewIds.forEach(viewId => {
      views[viewId].update(prefixKeys.join())
    })

    // invoking callback function of watching field
    this._invokeWatchFn(key, newValue, oldValue, prefix)
  }
  addView(domV) {
    const { views, fieldForVids } = this
    const { vId, fields, type } = domV
    const viewId = vId + type
    let view = views[viewId] = new View(domV, this)
    // 方便快速找到当前更新字段影响的view
    fields.forEach(field => {
      let viewIds = fieldForVids[field]
      if (viewIds) {
        viewIds.add(viewId)
      }
      else {
        fieldForVids[field] = new Set([viewId])
      }
    })
    return view
  }
  addList(listV) {
    let field = listV.listItem.field
    let list = new List(listV, this)
    let fieldList = this.lists[field]
    if (fieldList) {
      fieldList.push(list)
    }
    else {
      this.lists[field] = [list]
    }
  }
  addWatch(config = {}) {
    const { watches } = this
    for (let field in config) {
      let cf = config[field], handler, deep = false
      if (typeof cf === 'function') {
        handler = cf
      }
      else if (typeof cf === 'object') {
        handler = cf.handler || Function
        deep = cf.deep
      }
      if (field in watches) {
        watches[field].push({ handler, deep })
      }
      else {
        watches[field] = [{ handler, deep }]
      }
    }
  }
  _getListItems(listItemVs) {
    /**
     * eg: prefix = "data,list,0,itemList,1"
     * 假如这个字段中的list，itemList都是数组并且都被j-for指令使用，
     * 那么需要得到两个listItem，domV.listItemVs记录了这两个listItem的信息
     */
    let listItems = []
    listItemVs = listItemVs || []
    listItemVs.forEach(listItemV => {
      const { field, vId, itemName, indexName } = listItemV
      let listV = this.lists[field].find(list => {
        return list.listViewIds.includes(vId)
      })
      if (listV) {
        let itemIndex = listV.listViewIds.indexOf(vId)
        let itemData = fieldData(this.data, `${field},${itemIndex}`)
        listItems.push({
          field,
          itemName, 
          indexName,
          item: itemData,
          index: itemIndex
        })
      }
    })
    return listItems
  }
  _invokeWatchFn(key, newValue, oldValue, prefix) {
    let { watches, data } = this
    let _prefix = [...prefix, key].join()
    let regPre = new RegExp(`^${_prefix},`)

    if (!Object.keys(watches).some(field => {
      return new RegExp(`^${_prefix}`).test(field.split('.').join())
    })) {
      return
    }

    Object.keys(watches).forEach(field => {
      let cfs = watches[field]
      field = field.split('.').join()
      // eg _prefix = a.b then a.b , a.b.c , a.b.c.d... all need update
      if (regPre.test(field + ',')) {
        let suffix = field.replace(regPre, '')
        let newData = field === _prefix ? newValue : fieldData(newValue, suffix)
        let oldData = field === _prefix ? oldValue : fieldData(oldValue, suffix)
        cfs.forEach(cf => {
          cf.handler.bind(data)(newData, oldData)
        })
      }
      let regDeep = new RegExp(`^${field},`)
      // eg _prefix = a.b.c and if a , a.b deep watch, a a.b need update
      if (regDeep.test(_prefix)) {
        let newData = fieldData(data, field)
        let oldData = clone(newData)
        fieldData(oldData, _prefix.replace(regDeep, ''), oldValue)
        cfs.forEach(cf => {
          if (cf.deep) {
            cf.handler.bind(data)(newData, oldData)
          }
        })
      }
    })
  }
  _destory() {
    this.data = null
    for(let key in this.views) {
      this.views[key]._destory()
      delete this.views[key]
    }
    for(let key in this.fieldForVids) {
      delete this.fieldForVids[key]
    }
    this.fieldForVids = null
    this.views = null
    destroy(this.watches)
    this.watches = null
  }
}

class View {
  constructor(domV, vm) {
    this.id = domV.vId + domV.type
    this.domV = domV
    this.$el = null
    this.vm = vm
  }
  update(prefix) {
    const { domV, vm } = this
    const { data } = vm
    this.$el = $dom(`${domV.tagName}[${domV.vId}]`)
    if (!this.$el.el) {
      this._destory()
      return
    }
    // listItems
    let listItems = vm._getListItems(domV.listItemVs)
    // expression 变量
    this.exprVars = []
    let dataKeys = new Set([...domV.fields].map(field => field.split(',')[0]))
    dataKeys.forEach(key => {
      this.exprVars.push(`var ${key} = data[0]["${key}"] \n`)
    })
    this.exprData = listItems.map(listItem => {
      const { itemName, indexName, item, index } = listItem
      return {
        [itemName]: item,
        [indexName]: index
      }
    })
    this.exprData.forEach((item, index) => {
      Object.keys(item).forEach(key => {
        this.exprVars.push(`var ${key} = data[${index + 1}]["${key}"] \n`)
      })
    })
    this.exprData.unshift(data)

    viewUpdate[domV.type].apply(this, [prefix])
  }
  isUpdateByArrayMethod(prefix) {
    prefix = prefix.join()
    const { domV, vm } = this
    let is = false
    if (domV.listItemVs) {
      for (let i = 0; i < domV.listItemVs.length; i++) {
        let listItemV = domV.listItemVs[i]
        const { field, vId, itemName, indexName } = listItemV
        let listV = vm.lists[field].find(list => {
          return list.listViewIds.includes(vId)
        })
        if (listV) {
          let reg = new RegExp(`^(${field},)(\d+)`)
          let m = prefix.match(reg)
          if (m) {
            let index = m[2]
            let newIndex = listV.listViewIds.indexOf(vId)
            if (newIndex !== index) {
              is = true
              domV.fields = new Set([...domv.fields].map(field => {
                let viewIds = vm.fieldForVids[field]
                if (viewIds) {
                  viewIds.add(viewId)
                }
                else {
                  vm.fieldForVids[field] = new Set([viewId])
                }
                return field.replace(reg, `$1${newIndex}`)
              }))
              domV.attributes.forEach(attr => {
                attr.fields = new Set([...attr.fields].map(field => {
                  return field.replace(reg, `$1${newIndex}`)
                }))
              })
              break
            }
          }
        }
      }
    }
    return is
  }
  _destory() {
    for (let key in this.domV) {
      delete this.domV[key]
    }
    delete this.vm.views[this.id]
    this.id = null
    this.domV = null
    this.vm = null
    if (this.$el){
      this.$el.remove()
    }
  }
}

// 视图更新
const viewUpdate = {
  // 更新属性
  'attr' (prefix) {
    const { exprVars, exprData } = this
    const { attributes, content } = this.domV
    const regExpression = /\{\{\s*(.*?)\s*\}\}/g
    attributes.forEach(item => {
      const { fields, attrName, attrContent } = item
      if ([...fields].some(field => new RegExp(`^${prefix}`).test(field))) {
        this.$el.attr(attrName, attrContent.replace(regExpression, ($0, $1) => {
          return execExpression($1, exprVars, exprData)
        }))
      }
    })
  },
  // 更新表达式内容
  'content' (prefix) {
    const { domV, exprVars, exprData, $el } = this
    const { content } = domV
    let result = execExpression(content, exprVars, exprData)
    $el.val(result)
  },
  // 执行指令
  'j-model' (prefix) {
    const { domV, exprVars, exprData, $el } = this
    const { tagName, content } = domV
    let result = execExpression(content, exprVars, exprData)
    switch(tagName) {
      case 'input':
        $el.el.value = result
        break
    }
  },
  // 执行指令
  'j-show' (prefix) {
    const { domV, exprVars, exprData, $el } = this
    const { content } = domV
    let result = execExpression(content, exprVars, exprData)
    if (result) {
      let style = $el.attr("style")
      if (style) {
        style = style.replace(/display\s*\:\s*none/g, '')
        $el.attr("style", style)
      }
    }
    else {
      $el.el.style.display = 'none'
    }
  }
}

class List {
  constructor(listV, vm) {
    this.dom = listV.dom
    this.emptyVid = listV.emptyVid
    this.listItem = listV.listItem
    this.listViewIds = listV.listViewIds
    this.vm = vm
  }
  update(value) {
    let { vm, listItem, emptyVid } = this
    for (let field in vm.lists) {
      if (new RegExp(`^${listItem.field},`).test(field)) {
        vm.lists[field].forEach(list => {
          list._destory()
        })
        vm.lists[field] = []
      }
    }
    let { listViewIds, fragNode } = this._newItemViews(value)
    let startNode = $dom(`*[${emptyVid}`).el
    $dom(fragNode).insertAfter(startNode)
    this.listViewIds.forEach(vId => {
      $dom(`*[${vId}]`).remove()
    })
    this.listViewIds = listViewIds
    vm.jtpl.renderDone()
  }
  push() {
    let { vm, listItem, emptyVid } = this
    let newData = [...arguments]
    let listLen = this.listViewIds.length
    let { listViewIds, fragNode } = this._newItemViews(newData, listLen)
    if (listViewIds.length < 1) {
      return
    }

    let listData = fieldData(vm.data, listItem.field)
    vm._observer(listData, listItem.field.split(','), 
      Object.keys(newData).map(index => parseInt(index) + listLen))

    let startVid = listLen === 0 ? emptyVid : this.listViewIds[listLen - 1]
    let startNode = $dom(`*[${startVid}]`).el
    $dom(fragNode).insertAfter(startNode)
    this.listViewIds.push(...listViewIds)
    vm.jtpl.renderDone()
  }
  pop() {
    let vId = this.listViewIds.pop()
    $dom(`*[${vId}]`).remove()
  }
  shift() {
    let vId = this.listViewIds.shift()
    $dom(`*[${vId}]`).remove()
  }
  unshift() {
    let { vm, listItem, emptyVid } = this
    let newData = [...arguments]
    let listLen = this.listViewIds.length
    let { listViewIds, fragNode } = this._newItemViews(newData)
    if (listViewIds.length < 1) {
      return
    }

    let listData = fieldData(vm.data, listItem.field)
    vm._observer(listData, listItem.field.split(','), Object.keys(newData))

    let startNode = $dom(`*[${emptyVid}]`).el
    $dom(fragNode).insertAfter(startNode)
    this.listViewIds.unshift(...listViewIds)
    vm.jtpl.renderDone()
  }
  splice() {
    let { vm, listItem, listViewIds } = this
    let [index, sum, ...newData] = [...arguments]
    let listLen = this.listViewIds.length
    index = index < 0 ? 0 : (index > listLen - 1 ? listLen - 1 : index)
    if (newData.length > 0) {
      let delSuccess = Object.keys(this.listViewIds).splice(index, sum).length > 0
      let { listViewIds, fragNode } = this._newItemViews(newData, index + (+delSuccess))

      let startVid = listLen === 0 ? emptyVid : this.listViewIds[index]
      let startNode = $dom(`*[${startVid}]`).el
      $dom(fragNode).insertAfter(startNode)
      let delVids = this.listViewIds.splice(index, sum, ...listViewIds)

      let listData = fieldData(vm.data, listItem.field)
      vm._observer(listData, listItem.field.split(','), 
        Object.keys(newData).map(_index => {
          return parseInt(_index) + index + (+delSuccess)
        }))

      delVids.forEach(vId => {
        $dom(`*[${vId}]`).remove()
      })
    }
    else {
      let delVids = this.listViewIds.splice(index, sum)
      delVids.forEach(vId => {
        $dom(`*[${vId}]`).remove()
      })
    }

  }
  sort(args) {
    this.listViewIds.sort(args)
    // todo
  }
  reverse(args) {
    this.listViewIds.reverse(args)
    // todo
  }
  _newItemViews(dataItems = [], startIndex = 0) {
    let { dom, listItem, vm } = this
    let listViewIds = []
    let parsedHtmls = []
    dataItems.forEach((item, index) => {
      let newListItem = Object.assign({ 
        item, 
        index: index + startIndex
      }, listItem)
      vm.jtpl.temp.listItems = []
      let { vId, parsedHtml } = transformListItem(vm.jtpl, newListItem, dom)
      listViewIds.push(vId)
      parsedHtmls.push(parsedHtml)
    })
    let fragNode = document.createDocumentFragment()
    parsedHtmls.forEach(html => {
      let proxyEl = document.createElement('div')
      proxyEl.innerHTML = html
      fragNode.appendChild(proxyEl.children[0])
    })
    return {
      listViewIds,
      fragNode
    }
  }
  _destory() {
    this.listViewIds.forEach(vId => {
      $dom(`*[${vId}]`).remove()
    })
    this.dom = null
    this.listItem = null
    this.listViewIds = null
    this.vm = null
  }
}

/**
 * 运行表达式
 * @param {*} data 
 * @param {*} fields 
 * @param {*} expression 
 */
const execExpression = (expression, exprVars, exprData) => {
  expression = '' === expression ? `''` : expression
  let fnText = `return ${expression}`
  let result
  try {
    let fn = new Function('data', exprVars.join('') + fnText)
    result = fn(exprData)
  } catch(e) {
    result = expression
    console.error(`expression '${expression}' parse error,${e}`)
  }
  return result
}

export default MVVM
export {
  execExpression
}