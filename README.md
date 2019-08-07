## 类似vuejs 2.x单文件前端框架

框架慢慢完善中，欢迎交流。
支持浏览器版本：ie11，chrome，safari，firefox

### 安装使用

```
    npm i -S jtpl
    npm i -S jtpl-loader
    npm i -S jtpl-css-loader
```

### 使用说明

1. 必须通过webpack构建
2. 需要配置两个loader
    - jtpl-loader,
    - jtpl-css-loader
3. 跟vuejs 2.x单文件使用类似
4. 只能存在一个跟元素
5. 标签必须要闭合
6. 在文件任何地方需要用到动态数据都使用 {{expression}} 表达式，指令除外
7. 具体使用可以参考[Jtpl-example-project](https://github.com/jrs320/Jtpl-example-project)

### 已经实现的功能

1. 表达式求值
2. 嵌套子组件，父子组件传值
3. 组件css样式隔离，互不污染
4. 双向数据绑定
5. 数组操作的监听
6. 指令，目前实现了j-model，j-show，j-for
7. computed，watch feature

### 后续计划实现的功能

1. 表达式可以使用函数
2. 数据逐级监听（目前传给子组件的数据当发生变化时候，子组件相应的视图不会更新，只能手动触发子组件的方法更新）
3. 同级组件数据通信，类似vuex
4. 路由
5. mixin，plugin功能，更多指令
6. 异步加载
7. 虚拟dom
8. 单元测试
9. 改成ts实现
10. 官网文档

### 难点心得

1. 模版解析匹配标签的问题，嵌套解析
2. 表达式求值的问题
3. 组件间的css样式污染问题
4. 双向数据绑定，当里面有嵌套对象和数组的时候，怎么匹配到对应的视图更新
5. 数据视图的理解划分
6. 渲染数组，j-for指令，要考虑嵌套for指令监听，求值，难度五颗星^_^

### 问题

1. 文件模版里面的js怎么调试，如何把sourceMap映射到这个文件，现在要调试只能把js单独抽出一个文件引入到文件模版中

### 示例项目
1. [Jtpl-example-project](https://github.com/jrs320/Jtpl-example-project)
2. [线上演示](http://writejs.com/jtpl-example/index.html)



