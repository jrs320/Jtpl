/**
 * 前端框架，类似vuejs2.x单文件模版框架
 * 需要同步使用jtpl-loader和jtpl-css-loader
 * @author jrs
 */

import MVVM from './mvvm.js'
import $dom from './dom.js'
import { modelTagName, on, off } from './dom.js'
import { fieldData, clone, destroy } from './util.js'
class Jtpl {
  /**
   * @param {object} data 模版create传入的模版数据
   * @param {object} config 模版配置项
   * @param {object} exData 该数据不会被双向绑定
   */
  constructor(data = {}, config, exData = {}) {
    config = Object.assign({
      components: {},
      data() { return {} },
      computed: {},
      created() {},
      mounted() { },
      methods: {},
      watch: {}
    }, config)
    this.mId = exData.mId || createModuleId()
    this.superJtpl = exData.superJtpl
    this.definedEvents = exData.definedEvents
    this.name = config.name
    this.scope = config.scope
    this.tpl = config.tpl
    this.rootTagName = config.rootTagName    
    this.components = config.components
    this.c_mounted = config.mounted
    this.c_created = config.created

    let props = data.props
    delete data.props
    this.data = Object.assign({}, config.data(), data)
    let propsConfig = config.props
    if (Array.isArray(propsConfig)) {
      for (let key in props) {
        if (!propsConfig.includes(key)) {
          delete props[key]
        }
      }
      Object.assign(this.data, props)
    }

    this.mvvm = new MVVM(this.data, this)
    this.slots = {}
    this.refs = {}
    this.childJtpls = {}
    this.events = []
    this.temp = {}
    this.transformResult = {
      needInitViews: [],
      childJtpls: {},
      refs: {},
      events: []
    }

    this._wrappData(config)
    this.parsedHtml = parseTpl(this)
    try {
      this.c_created.bind(this.data)()
    }
    catch(e) {
      console.error(e)
    }
  }
  mounted() {
    this.$el = $dom(`*[${this.mId}]`)
    this.renderDone()
    this.data.$el = this.$el
    delete this.parsedHtml
    try {
      this.c_mounted()
    }
    catch(e) {
      console.error(e)
    }
  }  
  renderDone() {
    const {
      needInitViews,
      childJtpls,
      refs,
      events
    } = this.transformResult

    for (let key in childJtpls) {
      childJtpls[key].mounted()
    }
    this.childJtpls = Object.assign(this.childJtpls, childJtpls)

    for (let key in refs) {
      let ref = refs[key]
      if (ref instanceof Jtpl) {
        this.refs[key] = ref
      }
      else {
        this.refs[key] = this.$el.find(`*[${ref}]`).el
      }
    }

    this._bind(events)
    this.events = this.events.concat(events)

    needInitViews.forEach(item => {
      let { view, prefix } = item
      view.update(prefix)
    })

    this.transformResult = {
      needInitViews: [],
      childJtpls: {},
      refs: {},
      events: []
    }
  }
  render(el) {
    let $renderEl = $dom(el)
    $renderEl.html(this.parsedHtml)
    this.mounted()
    return this
  }
  append(el) {
    let $renderEl = $dom(el)
    const proxyEl = document.createElement('div')
    proxyEl.innerHTML = this.parsedHtml
    $renderEl.el.appendChild(proxyEl.children[0])
    proxyEl.removeChild()
    this.mounted()
    return this
  }
  $emit(eventName, ...params) {
    let eventFn = this.definedEvents[eventName]
    if (eventFn) {
      eventFn = this.superJtpl[eventFn]
      if (eventFn) {
        eventFn.apply(this.superJtpl, params)
      }
    }
    else {
      console.error(`event "${eventName}" is not defined`)
    }
  }
  remove() {
    this._destory()
  }
  _wrappData(config) {
    const { data, mvvm } = this
    const { methods, computed, watch } = config

    // 把 refs, mounted, methods 上下文设置为data
    data.refs = this.refs
    this.c_mounted = this.c_mounted.bind(data)
    for (let key in methods) {
      this[key] = methods[key].bind(data)
      data[key] = this[key]
    }
    data.$emit = this.$emit.bind(this)
    // 监听watch字段
    mvvm.addWatch(watch)
    // 计算属性computed
    mvvm.addComputed(computed)
  }
  _bind(events) {
    events = events || this.events
    events.forEach(eventObj => {
      let { targetId, tagName, eventName, eventFn } = eventObj
      let $target = $dom(`${tagName}[${targetId}]`)
      let bindFn = eventFn
      if (typeof bindFn !== 'function') {
        bindFn = this[eventFn.name]
        if (typeof bindFn === 'function') {
          if (eventFn.params) {
            eventFn.bindFn = event => {
              bindFn(...eventFn.params, event)
            }
          }
          else {
            eventFn.bindFn = bindFn
          }
          $target.on(eventName, eventFn.bindFn)
        }
      }
      else {
        $target.on(eventName, bindFn)
      }
    })
  }
  _unBind(events) {
    events = events || this.events
    events.forEach(eventObj => {
      let { targetId, tagName, eventName, eventFn } = eventObj
      let $target = $dom(`${tagName}[${targetId}]`)
      let bindFn = eventFn
      if (typeof bindFn !== 'function') {
        bindFn =  eventFn.bindFn
      }
      $target.off(eventName, bindFn)
    })
  }
  _destory() {
    for (let key in this.childJtpls) {
      this.childJtpls[key]._destory()
    }
    this._unbind()
    this.mId = null
    this.tpl = null
    destroy(this.data)
    this.data = null
    destroy(this.components)
    this.components = null
    this.c_mounted = null
    destroy(this.refs)
    this.refs = null
    destroy(this.childJtpls)
    this.childJtpls = null
    destroy(this.events)
    this.events = null
    destroy(this.temp)
    this.temp = null
    this.$el.remove()
    this.mvvm._destory()
  }
}

/**
 * 解析前，去掉注释，加上scope,模板id
 * @param {object} jtpl 
 */
const parseTpl = (jtpl) => {
  let temp = jtpl.temp = {
    execFields: new Set(),
    domHtmls: {},
    expression: {},
    data: jtpl.data,
    wrappData: {},
    dataVars: null,
    isTraning: false,
    // 'j-for'指令带入的数据 
    listItems: []
  }

  temp.wrappData = wrapperData.call(temp, clone(jtpl.data), [])
  let { tpl } = jtpl
  // 去掉注释
  tpl = tpl.replace(/<!--\s+[\s\S]*?-->/g, '')
  // 匹配{{data}}表达式
  let regExpression = /\{\{\s*(.*?)\s*\}\}/g
  // 先把表达式匹配缓存起来，当表达式里面有<和>运算符的时候无法正确匹配一个标签
  tpl = tpl.replace(regExpression, ($0, $1) => {
    let expreId = createExpressionId()
    temp.expression[expreId] = $1
    return expreId
  })
  let result = parseDom(jtpl, tpl)

  // 内存释放
  for (let id in temp.domHtmls) {
    let dom = temp.domHtmls[id]
    if (dom.shouldDel) {
      for (let key in dom) {
        delete dom[key]
      }
      delete temp.domHtmls[id]
    }
  }

  return result
}

/**
 * 倒序解析
 * @param {*} jtpl 
 * @param {*} tpl
 */
const parseDom = (jtpl, tpl) => {
  const { components: comps, temp } = jtpl
  let { domHtmls } = temp

  // 匹配有结束标签的dom元素
  // let reg1 = /<([A-Z|a-z|\-|\d]+)([^>]*?)>([^<]*)<\/\1>/
  // 匹配有结没有束标签的dom元素
  // let reg2 = /<([A-Z|a-z|\-|\d]+)([^>]*?)\/>/

  // 匹配所有没有子节点的dom元素
  let reg = /<([A-Z|a-z|\-|\d]+)([^>]*?)(?:(?:\/>)|(?:>([^<]*)<\/\1>))/g

  let isTagInTpl = false
  tpl = tpl.replace(reg, ($0, $1, $2, $3) => {
    isTagInTpl = true
    let vId = createViewId()
    // 匹配结果用占位id替换
    let cacheDomId = createCacheDomId(vId)
    let dom = {
      vId,
      tagName: $1,
      attr: $2 || '',
      content: $3 || ''
    }
    // '-'连接符 转成 驼峰格式
    let tagName = dom.tagName.replace(/-([a-z])/g, ($0, $1) => {
      return $1.toUpperCase()
    })
    let component = comps[tagName] || comps[dom.tagName]
    // 子组件
    if (component) {
      dom.mId = createModuleId()
      dom.component = component
      domHtmls[cacheDomId] = dom
    }
    // 普通标签
    else {
      domHtmls[cacheDomId] = dom
    }
    return cacheDomId
  })

  if (isTagInTpl) {
    return parseDom(jtpl, tpl)
  }
  else {
    return transformDom(jtpl, tpl)
  }
}

/**
 * 顺序翻译
 * @param {*} jtpl 
 * @param {*} tpl
 */
const transformDom = (jtpl, tpl, listItemVs) => {
  let { mId, temp } = jtpl
  let { domHtmls } = temp
  // cacheDomId
  let reg = /\[#(view)?\d+?#\]/g
  let isCacheIdInTpl = false

  tpl = tpl.replace(reg, cacheId => {
    let dom = domHtmls[cacheId]
    if (dom) {
      isCacheIdInTpl = true
      // listTpl根元素vId需要保存到视图List中，这里之前已经创建
      if (listItemVs) {
        let lastListItemV = listItemVs[listItemVs.length - 1]
        let listItemVid = dom.mId || dom.vId
        if (lastListItemV.vId !== listItemVid) {
          dom.shouldDel = false
          dom = Object.assign({}, dom, {
            vId: createViewId(),
            mId: dom.mId ? createModuleId() : undefined
          })
          let cacheDomId = createCacheDomId(dom.vId)
          domHtmls[cacheDomId] = dom
        }
        dom.listItemVs = listItemVs
      }
      dom.shouldDel = true
      let domHtml = dom.mId ? parseComponent(jtpl, dom) : parseNode(jtpl, dom)
      if (!temp.isTraning) {
        temp.isTraning = true
        // 模版只能存在一个跟元素，在跟元素添加模块id属性
        let reg = /(<[A-Z|a-z|\-|\d]+)/
        domHtml = domHtml.replace(reg, `$1 ${mId}`)
      }
      return domHtml
    }
    return cacheId
  })

  if (isCacheIdInTpl) {
    return transformDom(jtpl, tpl, listItemVs)
  }
  else {
    return tpl
  }
}

const transformListItem = (jtpl, listItem, dom) => {
  const { temp, mvvm } = jtpl
  dom.shouldDel = false
  let vId = createViewId()
  dom = Object.assign({}, dom, {
    vId,
    mId: dom.mId ? createModuleId() : undefined,
    domViewId: vId
  })
  let cacheDomId = createCacheDomId(vId)
  temp.domHtmls[cacheDomId] = dom

  if (dom.listItemVs) {
    dom.listItemVs.forEach((item, index) => {
      if (!temp.listItems[index]
        || temp.listItems[index].field != item.field) {
        temp.listItems[index] = mvvm._getListItems([dom.listItemVs[index]])[0]
      }
    })
  }

  temp.listItems.push(listItem)
  let listItemV = {
    field: listItem.field,
    vId: dom.mId || vId,
    itemName: listItem.itemName,
    indexName: listItem.indexName
  }
  let listItemVs = [listItemV]
  if (dom.listItemVs) {
    listItemVs = [...dom.listItemVs, ...listItemVs]
  }
  let parsedHtml = transformDom(jtpl, cacheDomId, listItemVs)
  temp.listItems.pop()
  return {
    vId: listItemV.vId,
    parsedHtml
  }
}

const transformSlotTpl = (jtpl, scoped, dom) => {
  let { temp } = jtpl
  let { domHtmls } = temp
  let slotHtmls = {}
  // cacheDomId
  let reg = /\[#(view)?\d+?#\]/g
  dom.content.replace(reg, cacheId => {
    let dom = domHtmls[cacheId]
    if (dom && dom.tagName === 'template') {
      let m = dom.attr.match(/slot=(['"])([\s\S]+?)\1/)
      let slotName = m ? m[2] : 'default'
      slotHtmls[slotName] = transformDom(jtpl, dom.content, dom.listItemVs)
    }
  })
  return slotHtmls
}

/**
 * 解析普通标签
 * @param {*} jtpl 
 * @param {*} dom
 */
const parseNode = (jtpl, dom) => {
  const { data, mvvm, temp } = jtpl
  const { events } = jtpl.transformResult
  let domViewId = dom.domViewId || ''
  // 匹配已经被缓存的表达式id
  let regExpression = /\[!\d+?!\]/g

  // slot标签
  if (dom.tagName === 'slot') {
    let m = dom.attr.match(/name=(['"])([\s\S]+?)\1/)
    let slotName = m ? m[2] : 'default'
    return createSlotId(slotName)
  }

  // j-for指令处理
  let regFor = /(([a-z]|[A-Z]|_|\-|\$|\d)+)=(['"])([\s\S]+?)\3/g
  let forExpression
  dom.attr = dom.attr.replace(regFor, ($0, $1, $2, $3, $4) => {
    let key = $1, value = $4
    if ('j-for' === key) {
      forExpression = value
      return ''
    }
    return $0
  })
  if (forExpression) {
    let parseResult = parseDirective(jtpl, {
      key: 'j-for',
      value: forExpression,
      dom
    })
    if (parseResult.success) {
      return parseResult.result
    }
  }

  // 事件，‘@’开头加原生事件名 eg @click=""
  let regEvent = /@(([a-z]|[A-Z]|_|\$|\d)*)=(['"])(.*?)\3/g
  dom.attr = dom.attr.replace(regEvent, ($0, $1, $2, $3, $4) => {
    domViewId = dom.vId
    // 匹配执行函数
    let regFn = /\s*([^\(]*)(?:\(([^\)]*)\))?/
    let eventFn = $4 || ''
    let m = eventFn.match(regFn)
    if (m) {
      events.push({
        targetId: dom.vId,
        tagName: dom.tagName,
        eventName: $1,
        eventFn: {
          name: m[1],
          params: m[2] ? m[2].split(',').map(item => {
            return execExpression(item.trim(), temp)
          }) : null
        }
      })
    }
    return ''
  })

  // 属性，‘:’开头，eg :classs="{{cls}}", :style="width:{{width}}"
  let regAttr = /(\:)?(([a-z]|[A-Z]|_|\-|\$|\d)+)=((['"])([\s\S]+?)\5)/g,
    fields = new Set(),
    attributes = []

  dom.attr = dom.attr.replace(regAttr, ($0, $1, $2, $3, $4, $5, $6) => {
    // 非‘:’开头的属性直接跳过
    let isExpr = !!$1
    if (!isExpr) {
      let key = $2
      let value = $6
      // 业务开发中可能要用到原生节点对象，通过ref属性指向当前原生节点对象，
      // 代码中调用原生节点对象： this.refs[name], 如果定义在组件上，ref指向的是组件实例
      if (key === 'ref') {
        let refId = createRefId()
        jtpl.transformResult.refs[value] = refId
        return refId
      }
      // 处理指令
      else if (/^j\-/.test(key)) {
        let parseResult = parseDirective(jtpl, {
          key,
          value,
          dom
        })
        if (parseResult.success) {
          domViewId = dom.vId
        }
        return parseResult.result
      }
      return $0
    }

    let attrName = $2,
      attrContent = $6,
      attrContentParsed = $4,
      fieldsInAttr = new Set()
    
    // 所有属性值用过{{}}表达式的都需要解析出来
    attrContentParsed = attrContentParsed.replace(regExpression, exprId => {
      let expression = temp.expression[exprId]
      if (expression) {
        let result = execExpression(expression, temp)
        fieldsInAttr = new Set([...fieldsInAttr, ...temp.execFields])
        return result
      }
      return exprId
    })

    if (fieldsInAttr.size > 0) {
      attributes.push({
        fields: fieldsInAttr,
        attrName,
        attrContent: attrContent.replace(regExpression, exprId => {
          let expression = temp.expression[exprId]
          return expression ? `{{${expression}}}` : exprId
        })
      })
      fields = new Set([...fields, ...fieldsInAttr])
    }
    return `${attrName}=${attrContentParsed} `
  })

  if (fields.size > 0) {
    domViewId = dom.vId
    // 动态属性值绑定对应视图
    mvvm.addView({
      vId: dom.vId,
      type: 'attr',
      tagName: dom.tagName,
      fields,
      attributes,
      listItemVs: dom.listItemVs
    })
  }

  // 填充内容中的{{data}}表达式
  dom.content = dom.content.replace(regExpression, exprId => {
    let expression = temp.expression[exprId]
    if (expression) {
      let result = execExpression(expression, temp)
      let vId = createViewId()
      if (temp.execFields.size > 0) {
        mvvm.addView({
          vId,
          type: 'content',
          tagName: modelTagName,
          fields: temp.execFields,
          content: expression,
          listItemVs: dom.listItemVs
        })
      }
      return `<${modelTagName} ${vId}>${result}</${modelTagName}>`
    }
    return exprId
  })
  
  // 重新拼接模版
  return `<${dom.tagName} ${domViewId} ${jtpl.scope} ${dom.attr}>
    ${dom.content}
  </${dom.tagName}>`
}

/**
 * 解析子组件
 * @param {*} jtpl 
 * @param {*} dom
 */
const parseComponent = (jtpl, dom) => {
  let { mvvm, temp } = jtpl
  let { childJtpls, needInitViews } = jtpl.transformResult
  let { component, mId } = dom

  // j-for指令处理
  let regAttr = /(([a-z]|[A-Z]|_|\-|\$|\d)+)=(['"])([\s\S]+?)\3/g
  let forExpression
  dom.attr = dom.attr.replace(regAttr, ($0, $1, $2, $3, $4) => {
    let key = $1, value = $4
    if ('j-for' === key) {
      forExpression = value
      return ''
    }
    return $0
  })
  if (forExpression) {
    let parseResult = parseDirective(jtpl, {
      key: 'j-for',
      value: forExpression,
      dom
    })
    if (parseResult.success) {
      return parseResult.result
    }
  }

  // 组件标签上自定义事件，‘@’开头+事件名，在组件内通过$emit调用，解决子->父组件通信
  let regEvent = /@(([a-z]|[A-Z]|_|\$|\d)*)=(['"])(.*?)\3/g
  let definedEvents = {}
  dom.attr = dom.attr.replace(regEvent, ($0, $1, $2, $3, $4) => {
    let eventName = $1
    let eventFn = $4
    definedEvents[eventName] = eventFn
    return ''
  })

  // 接收父组件传递的数据
  let regProps = /(\:)?(([a-z]|[A-Z]|_|\-|\$|\d)+)=(['"])([\s\S]+?)\4/g
  let props = {}
  let ref
  dom.attr.replace(regProps,  ($0, $1, $2, $3, $4, $5) => {
    let key = $2
    let expression = $5
    let isExpr = !!$1
    if (isExpr) {
      let result = execExpression(expression, temp)
      // 只接收，不监听（后续完善）
      props[key] = result
    }
    else {
      if (key === 'ref') {
        ref = expression
      }
      else if (/^j\-show$/.test(key)) {
        let result = execExpression(expression, temp)
        let execFields = temp.execFields
        let view = mvvm.addView({
          vId: mId,
          type: 'j-show',
          tagName: '*',
          fields: execFields,
          content: expression,
          listItemVs: dom.listItemVs
        })
        needInitViews.push({
          prefix: '',
          view
        })
      }
      else {
        props[key] = expression
      }
    }
  })
  // 创建子组件
  let cJtpl = component.create({ props }, {
    mId, 
    superJtpl: jtpl,
    definedEvents
  })
  childJtpls[mId] = cJtpl
  // 匹配ref
  if (ref) {
    jtpl.transformResult.refs[ref] = cJtpl
  }
  // parse slot
  let slots = transformSlotTpl(jtpl, cJtpl.data, dom)
  let reg = /\[@(.*)@\]/g
  cJtpl.parsedHtml = cJtpl.parsedHtml.replace(reg, ($0, $1) => {
    let slotName = $1
    if (slotName in slots) {
      return slots[slotName]
    }
    return ''
  })
  return cJtpl.parsedHtml
}

/**
 * 解析指令
 * @param {*} jtpl 
 * @param {*} model
 */
const parseDirective = (jtpl, model) => {
  const { mvvm, temp } = jtpl
  const { needInitViews, events } = jtpl.transformResult
  const { key, value: expression, dom } = model
  const { vId, tagName, listItemVs } = dom
  const m = key.match(/^j\-([^\s]+)/)

  let parseResult = {
    success: false, 
    result: ''
  }

  if (!m) {
    return parseResult
  }

  let directive = m[1]
  // j-model，类似vuejs的 v-model
  if ('model' === directive) {
    const validTagName = ['input', 'select', 'textarea']
    if (!validTagName.includes(tagName)) {
      return parseResult
    }
    let result = execExpression(expression, temp)
    let execFields = temp.execFields
    if ('input' === tagName) {
      parseResult = {
        success: true,
        result: `value="${result}"` 
      }
      events.push({
        targetId: vId,
        tagName: tagName,
        eventName: 'input',
        eventFn (event) {
          fieldData(jtpl.data, [...execFields][0], this.value)
        }
      })
    }
    mvvm.addView({
      vId,
      type: 'j-model',
      tagName,
      fields: execFields,
      content: expression,
      listItemVs
    })
  }
  // j-show，类似vuejs的 v-show
  else if ('show' === directive) {
    let result = execExpression(expression, temp)
    let execFields = temp.execFields
    parseResult = {
      success: true,
      result: ''
    }
    let view = mvvm.addView({
      vId,
      type: 'j-show',
      tagName,
      fields: execFields,
      content: expression,
      listItemVs
    })
    needInitViews.push({
      prefix: '',
      view
    })
  }
  // j-for 数组渲染
  else if ('for' === directive) {
    let forE = expression.split(' in ')
    if (forE.length !== 2) {
      console.error(`j-for directive syntax error, eg: j-for="(item index) in data"`)
    }
    let itemName = forE[0], listField = forE[1], indexName = 'index'
    // 匹配 (item, index) 语法
    let reg = /^\s*\((.*),(.*)\)/
    let m = itemName.match(reg)
    if (m) {
      itemName = m[1].trim()
      indexName = m[2].trim()
    }
    let listData = execExpression(listField, temp)
    let field = [...temp.execFields][0]
    if (!Array.isArray(listData)) {
      console.error(`j-for directive only usefull for array data`)
    }
    let emptyVid = createViewId()
    let listViewIds = []
    // j-for初始，渲染一个空标签，数组为空的时候一个占位，后面有数据了继续在这个标签位置渲染
    let parsedHtmls = [`<${modelTagName} ${emptyVid}></${modelTagName}>`]
    if (listData.length > 0) {
      listData.forEach((item, index) => {
        let listItem = { field, itemName, item, indexName, index }
        let { vId, parsedHtml } = transformListItem(jtpl, listItem, dom)
        listViewIds.push(vId)
        parsedHtmls.push(parsedHtml)
      })
    }
    parseResult = {
      success: true,
      result: parsedHtmls.join('')
    }
    dom.shouldDel = false
    mvvm.addList({
      emptyVid,
      listViewIds,
      dom,
      listItem: {
        field,
        itemName,
        indexName
      }
    })
  }
  return parseResult
}

/**
 * 重写数据的toString方法，如果是基本类型返回新的包装对象
 * @param {*} data 
 * @param {*} prefix 
 * @param {*} isWrappListItem j-for数据需要把当前key路径改成在数组中的索引 
 */
const wrapperData = function (data, prefix = [], isWrappListItem) {
  let self = this
  for (let key in data) {
    if (!data.hasOwnProperty(key)) {
      return
    }
    let value = data[key]
    let prefixKeys = [...prefix]
    if (!isWrappListItem) {
      prefixKeys.push(key)
    }
    if (value && typeof value === 'object') {
      wrapperData.call(self, value, prefixKeys)
    }

    if (Array.isArray(value)) {
      data[key].__jkey__ = key
      data[key].toString = function () {
        self.execFields.add(prefixKeys.join())
        return '[object Array]'
      }
    }
    else if (value && typeof value === 'object') {
      data[key].__jkey__ = key
      data[key].toString = function () {
        self.execFields.add(prefixKeys.join())
        return '[object Object]'
      }
    }
    else {
      data[key] = {
        __jkey__: key,
        toString() {
          if (!isWrappListItem) {
            self.execFields.add(prefixKeys.join())
          }
          if (typeof value === 'function') {
            value = '[object Function]'
          }
          return value
        }
      }
    }
  }
  return data
}

/**
 * 运行表达式
 * @param {*} expression 
 * @param {*} temp
 */
const execExpression = (expression, temp) => {
  temp.execFields = new Set()
  let { dataVars, data, wrappData, listItems } = temp
  if (!dataVars) {
    dataVars = temp.dataVars = Object.keys(wrappData).map(field => {
      return `var ${field} = data["${field}"] \n`
    })
  }
  let listItemVars = []
  let wrappListData = listItems.map((listItem, i) => {
    let { field, itemName, item, indexName, index } = listItem
    // j-for数据需要把当前key路径改成在数组中的索引
    let prefixKeys = [field + `,${index}`]
    let listItemData = wrapperData.call(temp, {
      [itemName]: clone(item),
      [indexName]: index
    }, prefixKeys, true)
    listItemVars = listItemVars.concat(Object.keys(listItemData).map(field => {
      return `var ${field} = listItem[${i}]["${field}"] \n`
    }))
    return listItemData
  })

  let result
  let varText = dataVars.join('') + listItemVars.join('')
  expression = '' === expression ? `''` : expression
  let fnText = ` 
    var result = ${expression}
    if (result && result.__jkey__){
      return result.toString()
    }
    return result
  `
  try {
    let fn = new Function('data, listItem', varText + fnText)
    result = fn(wrappData, wrappListData)
    // 如果表达式是一个对象，重新获取对象值
    if (/^\[object/.test(result)) {
      let field = [...temp.execFields][0]
      result = fieldData(data, field) 
    }
  } catch(e) {
    result = expression
    console.error(`expression '${expression}' parse error,${e}`)
  }
  return result
}

const createModuleId = () => ('module' + random())
const createViewId = () => ('view' + random())
const createRefId = () => ('ref' + random())
const createExpressionId = () => ('[!' + random() + '!]')
const createCacheDomId = vId => ('[#' + (vId || random()) + '#]')
const createCacheScopeId = mId => ('[%' + mId + '%]')
const createSlotId = name => ('[@' + name + '@]')
const random = () =>  Math.floor(Math.random() * 100000000)

Jtpl.load = (config = {}) => {
  const { el, tpl, global = {} } = config
  if (!el) {
    console.error(`'el' property must be setted, it's a css selector`)
    return
  }
  if (!tpl) {
    console.error(`'tpl' property must be setted, it's a Jtpl instance`)
    return
  }
  let app = tpl.create().render(el)
}

export default Jtpl
export {
  transformListItem,
  $dom
}