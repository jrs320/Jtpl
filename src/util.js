/**
 * 对层级字段求值 eg: data, "a,b,c" => data.a.b.c
 * @param {*} data 
 * @param {*} field 
 */
const fieldData = function (data, field) {
  let value = data
  let keys = typeof field === 'string' 
    ? field.split(',')
    : clone(field)
  while(keys.length > 1) {
    value = value[keys.shift()]
  }
  if (arguments.length > 2) {
    value[keys[0]] = arguments[2]
  }
  return value[keys[0]]
}

/**
 * 深拷贝
 * @param {*} data 
 */
const clone = (data) => {
  let fnFlag = '#fn#'
  let str = JSON.stringify(data, (key, value) => {
    if (typeof value === 'function') {
      return fnFlag + value.toString()
    }
    return value
  })

  let newData = JSON.parse(str, (key, value) => {
    let val = value, fn
    let reg = new RegExp(`^${fnFlag}`)
    if (reg.test(val)) {
      val = val.replace(reg, '')
      if (!/^\s*function/.test(val) 
        && !/^[^\{]*=>/.test(val)) {
        val = 'function ' + val
      }
      try {
        fn = new Function('', `return ${val}`)()
      } catch (e) {
        fn = value
      }
      return fn
    }
    return val
  })
  return newData
}

/**
 * 销毁对象
 * @param {*} data 
 */
const destroy = (data) => {
  if (typeof data !== 'object') {
    return
  }
  for (let key in data) {
    if (typeof data[key] === 'object') {
      destroy(data[key])
    }
    delete data[key]
  }
}

export {
  fieldData,
  clone,
  destroy
}