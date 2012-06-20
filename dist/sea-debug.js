/* SeaJS v1.2.0 | seajs.org | MIT Licensed */
/**
 * A Module Loader for the Web
 * @author lifesinger@gmail.com (Frank Wang)
 */


/**
 * Base namespace for the framework.
 */
var seajs = { _seajs: seajs }


/**
 * The version of the framework. It will be replaced with "major.minor.patch"
 * when building.
 */
seajs.version = '1.2.0'


/**
 * The private utilities. Internal use only.
 */
seajs._util = {}


/**
 * The private configuration data. Internal use only.
 */
seajs._config = {

  /**
   * Debug mode. It will be turned off automatically when compressing.
   */
  debug: '%DEBUG%',

  /**
   * Modules that are needed to load before all other modules.
   */
  preload: []
}
/**
 * The minimal language enhancement
 */
;(function(util) {

  var toString = Object.prototype.toString
  var AP = Array.prototype


  util.isString = function(val) {
    return toString.call(val) === '[object String]'
  }


  util.isFunction = function(val) {
    return toString.call(val) === '[object Function]'
  }


  util.isRegExp = function(val) {
    return toString.call(val) === '[object RegExp]'
  }


  util.isObject = function(val) {
    return val === Object(val)
  }


  util.isArray = Array.isArray || function(val) {
    return toString.call(val) === '[object Array]'
  }


  util.indexOf = AP.indexOf ?
      function(arr, item) {
        return arr.indexOf(item)
      } :
      function(arr, item) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] === item) {
            return i
          }
        }
        return -1
      }


  var forEach = util.forEach = AP.forEach ?
      function(arr, fn) {
        arr.forEach(fn)
      } :
      function(arr, fn) {
        for (var i = 0; i < arr.length; i++) {
          fn(arr[i], i, arr)
        }
      }


  util.map = AP.map ?
      function(arr, fn) {
        return arr.map(fn)
      } :
      function(arr, fn) {
        var ret = []
        forEach(arr, function(item, i, arr) {
          ret.push(fn(item, i, arr))
        })
        return ret
      }


  util.filter = AP.filter ?
      function(arr, fn) {
        return arr.filter(fn)
      } :
      function(arr, fn) {
        var ret = []
        forEach(arr, function(item, i, arr) {
          if (fn(item, i, arr)) {
            ret.push(item)
          }
        })
        return ret
      }


  util.unique = function(arr) {
    var ret = []
    var o = {}

    forEach(arr, function(item) {
      o[item] = 1
    })

    if (Object.keys) {
      ret = Object.keys(o)
    }
    else {
      for (var p in o) {
        if (o.hasOwnProperty(p)) {
          ret.push(p)
        }
      }
    }

    return ret
  }


  util.now = Date.now || function() {
    return new Date().getTime()
  }

})(seajs._util)
/**
 * The tiny console support
 */
;(function(util, config) {

  util.log = function() {
    if (config.debug && typeof console !== 'undefined') {
      console.log(Array.prototype.join.call(arguments, ' '))
    }
  }

})(seajs._util, seajs._config)
/**
 * Path utilities for the framework
 */
;(function(util, config, global) {

  var DIRNAME_RE = /.*(?=\/.*$)/
  var MULTIPLE_SLASH_RE = /([^:\/])\/\/+/g
  var FILE_EXT_RE = /\.(?:css|js)$/
  var ROOT_RE = /^(.*?\w)(?:\/|$)/


  /**
   * Extracts the directory portion of a path.
   * dirname('a/b/c.js') ==> 'a/b/'
   * dirname('d.js') ==> './'
   * @see http://jsperf.com/regex-vs-split/2
   */
  function dirname(path) {
    var s = path.match(DIRNAME_RE)
    return (s ? s[0] : '.') + '/'
  }


  /**
   * Canonicalizes a path.
   * realpath('./a//b/../c') ==> 'a/c'
   */
  function realpath(path) {
    // 'file:///a//b/c' ==> 'file:///a/b/c'
    // 'http://a//b/c' ==> 'http://a/b/c'
    if (MULTIPLE_SLASH_RE.test(path)) {
      MULTIPLE_SLASH_RE.lastIndex = 0
      path = path.replace(MULTIPLE_SLASH_RE, '$1\/')
    }

    // 'a/b/c', just return.
    if (path.indexOf('.') === -1) {
      return path
    }

    var original = path.split('/')
    var ret = [], part

    for (var i = 0; i < original.length; i++) {
      part = original[i]

      if (part === '..') {
        if (ret.length === 0) {
          throw new Error('The path is invalid: ' + path)
        }
        ret.pop()
      }
      else if (part !== '.') {
        ret.push(part)
      }
    }

    return ret.join('/')
  }


  /**
   * Normalizes an url.
   */
  function normalize(url) {
    url = realpath(url)
    var lastChar = url.charAt(url.length - 1)

    if (lastChar === '/') {
      return url
    }

    // Adds the default '.js' extension except that the url ends with #.
    // ref: http://jsperf.com/get-the-last-character
    if (lastChar === '#') {
      url = url.slice(0, -1)
    }
    else if (url.indexOf('?') === -1 && !FILE_EXT_RE.test(url)) {
      url += '.js'
    }

    return url
  }


  /**
   * Parses alias in the module id. Only parse the first part.
   */
  function parseAlias(id) {
    // #xxx means xxx is already alias-parsed.
    if (id.charAt(0) === '#') {
      return id.substring(1)
    }

    var alias = config.alias

    // Only top-level id needs to parse alias.
    if (alias && isTopLevel(id)) {
      var parts = id.split('/')
      var first = parts[0]

      if (alias.hasOwnProperty(first)) {
        parts[0] = alias[first]
        id = parts.join('/')
      }
    }

    return id
  }


  var mapCache = {}

  /**
   * Converts the url according to the map rules.
   */
  function parseMap(url, map) {
    // map: [[match, replace], ...]
    map || (map = config.map || [])
    if (!map.length) return url

    var ret = url

    // Apply all matched rules in sequence.
    for (var i = 0; i < map.length; i++) {
      var rule = map[i]

      if (rule && rule.length > 1) {
        var m = rule[0]

        if (util.isString(m) && ret.indexOf(m) > -1 ||
            util.isRegExp(m) && m.test(ret)) {
          ret = ret.replace(m, rule[1])
        }
      }
    }

    if (ret !== url) {
      mapCache[ret] = url
    }

    return ret
  }


  /**
   * Gets the original url.
   */
  function unParseMap(url) {
    return mapCache[url] || url
  }


  /**
   * Converts id to uri.
   */
  function id2Uri(id, refUri) {
    id = parseAlias(id)
    refUri || (refUri = pageUrl)

    var ret

    // absolute id
    if (isAbsolute(id)) {
      ret = id
    }
    // relative id
    else if (isRelative(id)) {
      // Converts './a' to 'a', to avoid unnecessary loop in realpath.
      if (id.indexOf('./') === 0) {
        id = id.substring(2)
      }
      ret = dirname(refUri) + id
    }
    // root id
    else if (isRoot(id)) {
      ret = refUri.match(ROOT_RE)[1] + id
    }
    // top-level id
    else {
      ret = config.base + id
    }

    return normalize(ret)
  }


  function isAbsolute(id) {
    return id.indexOf('://') > 0 || id.indexOf('//') === 0
  }


  function isRelative(id) {
    return id.indexOf('./') === 0 || id.indexOf('../') === 0
  }


  function isRoot(id) {
    return id.charAt(0) === '/' && id.charAt(1) !== '/'
  }


  function isTopLevel(id) {
    var c = id.charAt(0)
    return id.indexOf('://') === -1 && c !== '.' && c !== '/'
  }


  /**
   * Normalizes pathname to start with '/'
   * Ref: https://groups.google.com/forum/#!topic/seajs/9R29Inqk1UU
   */
  function normalizePathname(pathname) {
    if (pathname.charAt(0) !== '/') {
      pathname = '/' + pathname
    }
    return pathname
  }


  var loc = global['location']
  var pageUrl = loc.protocol + '//' + loc.host +
      normalizePathname(loc.pathname)

  // local file in IE: C:\path\to\xx.js
  if (pageUrl.indexOf('\\') > 0) {
    pageUrl = pageUrl.replace(/\\/g, '/')
  }


  util.dirname = dirname
  util.realpath = realpath
  util.normalize = normalize

  util.parseAlias = parseAlias
  util.parseMap = parseMap
  util.unParseMap = unParseMap

  util.id2Uri = id2Uri
  util.isAbsolute = isAbsolute
  util.isTopLevel = isTopLevel

  util.pageUrl = pageUrl

})(seajs._util, seajs._config, this)
/**
 * Utilities for fetching js and css files.
 */
;(function(util, config, global) {

  var head = document.head ||
      document.getElementsByTagName('head')[0] ||
      document.documentElement

  var baseElement = head.getElementsByTagName('base')[0]
  var isWebKit = navigator.userAgent.indexOf('AppleWebKit') > 0

  var IS_CSS_RE = /\.css(?:\?|$)/i
  var READY_STATE_RE = /loaded|complete|undefined/

  var currentlyAddingScript
  var interactiveScript


  util.fetch = function(url, callback, charset) {
    var isCSS = IS_CSS_RE.test(url)
    var node = document.createElement(isCSS ? 'link' : 'script')

    if (charset) {
      var cs = util.isFunction(charset) ? charset(url) : charset
      if (cs) {
        node.charset = cs
      }
    }

    assetOnload(node, callback)

    if (isCSS) {
      node.rel = 'stylesheet'
      node.href = url
    }
    else {
      node.async = 'async'
      node.src = url
    }

    // For some cache cases in IE 6-9, the script executes IMMEDIATELY after
    // the end of the insertBefore execution, so use `currentlyAddingScript`
    // to hold current node, for deriving url in `define`.
    currentlyAddingScript = node

    // ref: #185 & http://dev.jquery.com/ticket/2709
    baseElement ?
        head.insertBefore(node, baseElement) :
        head.appendChild(node)

    currentlyAddingScript = null
  }

  function assetOnload(node, callback) {
    if (node.nodeName === 'SCRIPT') {
      scriptOnload(node, cb)
    } else {
      styleOnload(node, cb)
    }

    var timer = setTimeout(function() {
      util.log('Time is out:', node.src)
      cb()
    }, config.timeout)

    function cb() {
      if (!cb.isCalled) {
        cb.isCalled = true
        clearTimeout(timer)
        callback()
      }
    }
  }

  function scriptOnload(node, callback) {

    node.onload = node.onerror = node.onreadystatechange = function() {
      if (READY_STATE_RE.test(node.readyState)) {

        // Ensure only run once
        node.onload = node.onerror = node.onreadystatechange = null

        // Reduce memory leak
        if (node.parentNode) {
          try {
            if (node.clearAttributes) {
              node.clearAttributes()
            }
            else {
              for (var p in node) delete node[p]
            }
          } catch (x) {
          }

          // Remove the script
          if (!config.debug) {
            head.removeChild(node)
          }
        }

        // Dereference the node
        node = undefined

        callback()
      }
    }

    // NOTICE:
    // Nothing will happen in Opera when the file status is 404. In this case,
    // the callback will be called when time is out.
  }

  function styleOnload(node, callback) {

    // for IE6-9 and Opera
    if (global.hasOwnProperty('attachEvent')) { // see #208
      node.attachEvent('onload', callback)
      // NOTICE:
      // 1. "onload" will be fired in IE6-9 when the file is 404, but in
      //    this situation, Opera does nothing, so fallback to timeout.
      // 2. "onerror" doesn't fire in any browsers!
    }

    // Polling for Firefox, Chrome, Safari
    else {
      setTimeout(function() {
        poll(node, callback)
      }, 0) // Begin after node insertion
    }

  }

  function poll(node, callback) {
    if (callback.isCalled) {
      return
    }

    var isLoaded

    if (isWebKit) {
      if (node['sheet']) {
        isLoaded = true
      }
    }
    // for Firefox
    else if (node['sheet']) {
      try {
        if (node['sheet'].cssRules) {
          isLoaded = true
        }
      } catch (ex) {
        if (ex.name === 'SecurityError' || // firefox >= 13.0
            ex.name === 'NS_ERROR_DOM_SECURITY_ERR') { // old firefox
          isLoaded = true
        }
      }
    }

    setTimeout(function() {
      if (isLoaded) {
        // Place callback in here due to giving time for style rendering.
        callback()
      } else {
        poll(node, callback)
      }
    }, 1)
  }


  util.getCurrentScript = function() {
    if (currentlyAddingScript) {
      return currentlyAddingScript
    }

    // For IE6-9 browsers, the script onload event may not fire right
    // after the the script is evaluated. Kris Zyp found that it
    // could query the script nodes and the one that is in "interactive"
    // mode indicates the current script.
    // Ref: http://goo.gl/JHfFW
    if (interactiveScript &&
        interactiveScript.readyState === 'interactive') {
      return interactiveScript
    }

    var scripts = head.getElementsByTagName('script')

    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i]
      if (script.readyState === 'interactive') {
        interactiveScript = script
        return script
      }
    }
  }

  util.getScriptAbsoluteSrc = function(node) {
    return node.hasAttribute ? // non-IE6/7
        node.src :
        // see http://msdn.microsoft.com/en-us/library/ms536429(VS.85).aspx
        node.getAttribute('src', 4)
  }

})(seajs._util, seajs._config, this)

/**
 * References:
 *  - http://unixpapa.com/js/dyna.html
 *  - ../test/research/load-js-css/test.html
 *  - ../test/issues/load-css/test.html
 *  - http://www.blaze.io/technical/ies-premature-execution-problem/
 */
/**
 * The parser for dependencies
 */
;(function(util) {

  var DEPS_RE = /(?:^|[^.$])\brequire\s*\(\s*(["'])([^"'\s\)]+)\1\s*\)/g
  var BLOCK_COMMENT_RE = /(?:^|\n|\r)\s*\/\*[\s\S]*?\*\/\s*(?:\r|\n|$)/g
  var LINE_COMMENT_RE = /(?:^|\n|\r)\s*\/\/.*(?:\r|\n|$)/g


  util.parseDependencies = function(code) {
    // Parse these `requires`:
    //   var a = require('a');
    //   someMethod(require('b'));
    //   require('c');
    //   ...
    // Doesn't parse:
    //   someInstance.require(...);
    var ret = [], match

    code = removeComments(code)
    DEPS_RE.lastIndex = 0

    while ((match = DEPS_RE.exec(code))) {
      if (match[2]) {
        ret.push(match[2])
      }
    }

    return util.unique(ret)
  }

  // http://lifesinger.github.com/lab/2011/remove-comments-safely/
  function removeComments(code) {
    BLOCK_COMMENT_RE.lastIndex = 0
    LINE_COMMENT_RE.lastIndex = 0

    return code
        .replace(BLOCK_COMMENT_RE, '\n')
        .replace(LINE_COMMENT_RE, '\n')
  }

})(seajs._util)
/**
 * The Module constructor and its methods
 */
;(function(seajs, util, config) {

  var cachedModules = {}

  var STATUS = {
    'FETCHED': 0,  // The module file has been downloaded to the browser.
    'SAVED': 1,    // The module info including uri has been saved.
    'LOADED': 2,   // All dependencies are loaded.
    'COMPILED': 3  // The module.exports is available.
  }


  /**
   * The Module constructor
   * @constructor
   */
  function Module(id, deps, factory) {
    this.id = id
    this.dependencies = deps || []
    this.factory = factory
    this.status = 0
  }


  Module.prototype._use = function(ids, callback) {
    util.isString(ids) && (ids = [ids])
    var uris = resolve(ids, this.uri)

    this._load(uris, function() {
      var args = util.map(uris, function(uri) {
        var module = cachedModules[uri]
        return module ? module._compile() : null
      })

      if (callback) {
        callback.apply(null, args)
      }
    })
  }


  Module.prototype._load = function(uris, callback) {
    var unLoadedUris = util.filter(uris, function(uri) {
      return !cachedModules[uri] ||
          cachedModules[uri].status < STATUS.LOADED
    })

    if (unLoadedUris.length === 0) {
      callback()
      return
    }

    var length = unLoadedUris.length
    var remain = length

    for (var i = 0; i < length; i++) {
      (function(uri) {
        cachedModules[uri] ? onFetch() : fetch(uri, onFetch)

        function onFetch() {
          var module = cachedModules[uri]

          if (module) {
            var deps = getPureDependencies(module)

            if (deps.length) {
              Module.prototype._load(deps, function() {
                cb(module)
              })
            }
            else {
              cb(module)
            }
          }
          // Maybe failed to fetch successfully, such as 404 error.
          else {
            cb()
          }
        }

      })(unLoadedUris[i])
    }

    /**
     * @param {Object=} module
     */
    function cb(module) {
      module && (module.status = STATUS.LOADED)
      --remain === 0 && callback()
    }
  }


  Module.prototype._compile = function() {
    var module = this
    if (module.exports) {
      return module.exports
    }

    module.exports = {}
    var factory = module.factory

    if (util.isFunction(factory)) {
      var ret = factory(require, module.exports, module)
      if (ret !== undefined) {
        module.exports = ret
      }
    }
    else if (factory !== undefined) {
      module.exports = factory
    }

    module.status = STATUS.COMPILED


    function require(id) {
      var uri = resolve(id, module.uri)
      var child = cachedModules[uri]

      // Just return null when:
      //  1. the module file is 404.
      //  2. the module file is not written with valid module format.
      //  3. other error cases.
      if (!child) {
        return null
      }

      child.parent = module

      if (isCircular(child)) {
        return child.exports
      }

      return child._compile()
    }

    require.async = function(ids, callback) {
      module._use(ids, callback)
    }

    require.resolve = function(id) {
      return resolve(id, module.uri)
    }

    require.cache = cachedModules


    return module.exports
  }


  Module._define = function(id, deps, factory) {
    var argsLength = arguments.length

    // define(factory)
    if (argsLength === 1) {
      factory = id
      id = undefined
    }
    // define(id || deps, factory)
    else if (argsLength === 2) {
      factory = deps
      deps = undefined

      // define(deps, factory)
      if (util.isArray(id)) {
        deps = id
        id = undefined
      }
    }

    // Parses dependencies.
    if (!util.isArray(deps) && util.isFunction(factory)) {
      deps = util.parseDependencies(factory.toString())
    }

    // Removes "", null, undefined in dependencies.
    if (deps) {
      deps = util.filter(deps, function(dep) {
        return !dep
      })
    }

    // Gets url directly for specific modules.
    if (id) {
      var uri = resolve(id)
    }
    // Try to derive url in IE6-9 for anonymous modules.
    else if (document.attachEvent) {

      // Try to get the current script.
      var script = util.getCurrentScript()
      if (script) {
        uri = util.unParseMap(util.getScriptAbsoluteSrc(script))
      }

      if (!uri) {
        util.log('Failed to derive URI from interactive script for:',
            factory.toString())

        // NOTE: If the id-deriving methods above is failed, then falls back
        // to use onload event to get the url.
      }
    }

    var module = new Module(id, deps, factory)

    if (uri) {
      save(uri, module)
      currentPackageModules.push(module)
    }
    else {
      // Saves information for "memoizing" work in the onload event.
      anonymousModule = module
    }

  }


  Module._fetch = util.fetch


  // Helpers
  // -------

  /**
   * @param {string=} refUri
   */
  function resolve(ids, refUri) {
    if (util.isString(ids)) {
      return util.id2Uri(ids, refUri)
    }

    return util.map(ids, function(id) {
      return resolve(id, refUri)
    })
  }


  var fetchingList = {}
  var fetchedList = {}
  var callbackList = {}
  var anonymousModule = null
  var currentPackageModules = []

  function fetch(uri, callback) {
    var srcUrl = util.parseMap(uri)

    if (fetchedList[srcUrl]) {
      callback()
      return
    }

    if (fetchingList[srcUrl]) {
      callbackList[srcUrl].push(callback)
      return
    }

    fetchingList[srcUrl] = true
    callbackList[srcUrl] = [callback]

    Module._fetch(
        srcUrl,

        function() {
          fetchedList[srcUrl] = true

          // Saves anonymous module.
          var module = anonymousModule
          if (module) {
            save(uri, module)
            anonymousModule = null
          }

          // Assigns the first module in package to cachedModules[uri]
          // See: test/issues/un-correspondence
          module = currentPackageModules[0]
          if (module && !cachedModules[uri]) {
            cachedModules[uri] = module
          }
          currentPackageModules = []

          // Clears
          if (fetchingList[srcUrl]) {
            delete fetchingList[srcUrl]
          }

          // Calls callbackList
          if (callbackList[srcUrl]) {
            util.forEach(callbackList[srcUrl], function(fn) {
              fn()
            })
            delete callbackList[srcUrl]
          }

        },

        config.charset
    )
  }


  function save(uri, module) {
    // Don't override existed module.
    if (!cachedModules[uri]) {
      module.uri = uri
      module.dependencies = resolve(module.dependencies, uri)
      module.status = STATUS.SAVED
      cachedModules[uri] = module
    }
  }


  function getPureDependencies(module) {
    var ret = []

    util.forEach(module.dependencies, function(uri) {
      var child = cachedModules[uri]
      var parent = module

      if (child) {
        // Removes parent from dependencies to avoid cyclic waiting.
        while (parent = parent.parent) {
          if (parent === child) {
            return
          }
        }
      }

      ret.push(uri)
    })

    return ret
  }


  function isCircular(module) {
    var ret = false
    var stack = [module.id]
    var parent = module

    while (parent = parent.parent) {
      stack.unshift(parent.id)

      if (parent === module) {
        ret = true
        break
      }
    }

    if (ret) {
      util.log('Found circular dependencies:', stack.join(' --> '))
    }

    return ret
  }


  seajs.Module = Module
  seajs.globalModule = new Module(util.pageUrl, [], {})
  seajs.define = Module._define

})(seajs, seajs._util, seajs._config)
/**
 * The configuration
 */
;(function(seajs, util, config) {

  var noCachePrefix = 'seajs-ts='
  var noCacheTimeStamp = noCachePrefix + util.now()


  // Async inserted script
  var loaderScript = document.getElementById('seajs-node')

  // Static script
  if (!loaderScript) {
    var scripts = document.getElementsByTagName('script')
    loaderScript = scripts[scripts.length - 1]
  }

  var loaderSrc = util.getScriptAbsoluteSrc(loaderScript) ||
      util.pageUrl // When sea.js is inline, set base to pageUrl.

  var base = util.dirname(loaderSrc)
  util.loaderDir = base

  // When src is "http://test.com/libs/seajs/1.0.0/sea.js", redirect base
  // to "http://test.com/libs/"
  var match = base.match(/^(.+\/)seajs\/[\d\.]+\/$/)
  if (match) {
    base = match[1]
  }

  config.base = base


  var dataMain = loaderScript.getAttribute('data-main')
  if (dataMain) {
    config.main = dataMain
  }


  // The max time to load a script file.
  config.timeout = 20000


  /**
   * The function to configure the framework
   * config({
   *   'base': 'path/to/base',
   *   'alias': {
   *     'app': 'biz/xx',
   *     'jquery': 'jquery-1.5.2',
   *     'cart': 'cart?t=20110419'
   *   },
   *   'map': [
   *     ['test.cdn.cn', 'localhost']
   *   ],
   *   preload: [],
   *   charset: 'utf-8',
   *   timeout: 20000, // 20s
   *   debug: false
   * })
   *
   */
  seajs.config = function(o) {
    for (var k in o) {
      if (!o.hasOwnProperty(k)) continue

      var previous = config[k]
      var current = o[k]

      if (previous && k === 'alias') {
        for (var p in current) {
          if (current.hasOwnProperty(p)) {
            checkAliasConflict(previous[p], current[p], p)
            previous[p] = current[p]
          }
        }
      }
      else if (previous && (k === 'map' || k === 'preload')) {
        // for config({ preload: 'some-module' })
        if (util.isString(current)) {
          current = [current]
        }

        util.forEach(current, function(item) {
          if (item) {
            previous.push(item)
          }
        })
      }
      else {
        config[k] = current
      }
    }

    // Makes sure config.base is an absolute path.
    var base = config.base
    if (base && !util.isAbsolute(base)) {
      config.base = util.id2Uri('./' + base + '/')
    }

    // Uses map to implement nocache.
    if (config.debug === 2) {
      config.debug = 1
      seajs.config({
        map: [
          [/^.*$/, function(url) {
            if (url.indexOf(noCachePrefix) === -1) {
              url += (url.indexOf('?') === -1 ? '?' : '&') + noCacheTimeStamp
            }
            return url
          }]
        ]
      })
    }

    debugSync()

    return this
  }


  function debugSync() {
    if (config.debug) {
      // For convenient reference
      seajs.debug = !!config.debug
    }
  }

  debugSync()


  function checkAliasConflict(previous, current, key) {
    if (previous && previous !== current) {
      util.log('Alias is conflicted:', key)
    }
  }

})(seajs, seajs._util, seajs._config)
/**
 * Prepare for plugins environment
 */
;(function(seajs, util, global) {

  // Registers plugin names.
  var alias = {}
  var loaderDir = util.loaderDir

  util.forEach(
      ['base', 'map', 'text', 'json', 'coffee', 'less'],
      function(name) {
        name = 'plugin-' + name
        alias[name] = loaderDir + name
      })

  seajs.config({
    alias: alias
  })


  // Handles `seajs-debug` switch.
  if (global.location.search.indexOf('seajs-debug') > -1 ||
      document.cookie.indexOf('seajs=1') > -1) {
    seajs.config({ debug: 2, preload: ['plugin-map'] })
  }


})(seajs, seajs._util, this)
/**
 * The bootstrap and entrances
 */
;(function(seajs, config) {

  var globalModule = seajs.globalModule


  /**
   * Loads modules to the environment and executes in callback.
   * @param {function()=} callback
   */
  seajs.use = function(ids, callback) {
    var preloadMods = config.preload

    if (preloadMods.length) {
      // Loads preload modules before all other modules.
      globalModule._use(preloadMods, function() {
        config.preload = []
        globalModule._use(ids, callback)
      })
    }
    else {
      globalModule._use(ids, callback)
    }
  }


  // Loads the data-main module automatically.
  config.main && seajs.use(config.main)


  // Parses the pre-call of seajs.config/seajs.use/define.
  // Ref: test/bootstrap/async-3.html
  (function(args) {
    if (args) {
      var hash = {
        0: 'config',
        1: 'use',
        2: 'define'
      }
      for (var i = 0; i < args.length; i += 2) {
        seajs[hash[args[i]]].apply(seajs, args[i + 1])
      }
      delete seajs._seajs
    }
  })((seajs._seajs || 0)['args'])

})(seajs, seajs._config)
/**
 * The public api
 */
;(function(seajs, global) {

  // Avoids conflicting when sea.js is loaded multi times.
  if (seajs._seajs) {
    global.seajs = seajs._seajs
    return
  }

  global.define = seajs.define


  // For plugin developers
  seajs.pluginSDK = {
    Module: seajs.Module,
    util: seajs._util,
    config: seajs._config
  }


  // Keeps clean!
  delete seajs.Module
  delete seajs.define
  delete seajs._util
  delete seajs._config
  delete seajs._seajs
  delete seajs.globalModule

})(seajs, this)
