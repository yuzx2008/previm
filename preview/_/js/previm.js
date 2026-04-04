'use strict';

/**
 * Previm - Vim Markdown 预览插件的核心脚本
 * 
 * 工作流程:
 * 1. 初始化 mermaid 和 markdown-it 解析器
 * 2. 每隔 1 秒轮询 previm-function.js 获取 Vim 中的文件内容
 * 3. 检测内容变化后，调用 transform() 转换为 HTML
 * 4. 渲染 mermaid 图表、PlantUML、代码高亮
 * 5. 自动滚动到之前的位置
 */
(function(_doc, _win) {

  // ========== 初始化配置 ==========

  // mermaid 流程图配置
  mermaid.mermaidAPI.initialize({
    startOnLoad: false,
    theme: 'default' // 可选: neutral, forest, default, dark
  });

  // 轮询间隔（毫秒）
  var REFRESH_INTERVAL = 1000;

  // KaTeX 数学公式配置
  var katexOptions = {macros:{"\\RR": "\\mathbb{R}"}};

  // ========== 主题切换配置 ==========

  // 主题切换: 读取 localStorage 或系统偏好
  // 默认 dark 模式，data-theme="light" 表示 light 模式
  function getPreferredTheme() {
    var stored = _win.localStorage.getItem('previm-theme');
    if (stored) {
      return stored;
    }
    return _win.matchMedia && _win.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  // 应用主题
  function applyTheme(theme) {
    if (theme === 'light') {
      _doc.documentElement.setAttribute('data-theme', 'light');
    } else {
      _doc.documentElement.removeAttribute('data-theme');
    }
    _win.localStorage.setItem('previm-theme', theme);
    updateThemeButton(theme);
  }

  // 切换主题
  function toggleTheme() {
    var current = _doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
  }

  // 更新主题切换按钮文本
  function updateThemeButton(theme) {
    var btn = _doc.getElementById('theme-toggle-btn');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    }
  }

  // 创建主题切换按钮
  function createThemeToggle() {
    var btn = _doc.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.className = 'theme-toggle';
    btn.title = '切换主题';
    btn.addEventListener('click', toggleTheme);
    _doc.body.appendChild(btn);
    applyTheme(getPreferredTheme());
  }

  // 监听系统主题变化
  if (_win.matchMedia) {
    _win.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function(e) {
      if (!_win.localStorage.getItem('previm-theme')) {
        applyTheme(e.matches ? 'light' : 'dark');
      }
    });
  }

  // markdown-it 解析器配置
  // 支持: 缩写、定义列表、脚注、上下标、复选框、东亚换行、数学公式
  var md = new _win.markdownit({html: true, linkify: true})
                   .use(_win.markdownitAbbr)
                   .use(_win.markdownitDeflist)
                   .use(_win.markdownitFootnote)
                   .use(_win.markdownitSub)
                   .use(_win.markdownitSup)
                   .use(_win.markdownitCheckbox)
                   .use(_win.markdownitCjkBreaks)
                   .use(texmath, {engine: katex, delimiters:['dollars','brackets'], katexOptions: katexOptions})
                   .use(_win.markdownitHeadingNumber, {
                     level: [1, 2, 3, 4, 5, 6],
                     numberingClass: 'heading-number',
                     tocClass: 'previm-toc',
                     tocListClass: 'previm-toc-list',
                     tocItemClass: 'previm-toc-item',
                     tocLinkClass: 'previm-toc-link',
                     showNumberInToc: true,
                     tocMarker: '[[toc]]'
                   });

  // ========== 代码块语言显示配置 ==========

  // 代码块语言显示模式: 0=不显示, 1=显示语言或文件名, 2=仅显示文件名
  var CODE_LANGUAGE_SHOW = 1;
  // 语言和文件名分隔符（正则表达式）
  var CODE_LANGUAGE_SEPARATOR = /[\s:]+/;

  // ========== Mermaid 代码块支持 ==========

  // 重写 fence 规则以支持 mermaid 和代码块语言显示
  var original_fence = md.renderer.rules.fence;
  md.renderer.rules.fence = function fence(tokens, idx, options, env, slf) {
    var token = tokens[idx];
    var info = token.info.trim();
    var langName = info.split(/\s+/g)[0];

    // mermaid 代码块特殊处理
    if (langName === 'mermaid') {
      return '<div class="mermaid">' + token.content + '</div>';
    }

    // 解析语言名和文件名
    var tokenSplit = info.split(CODE_LANGUAGE_SEPARATOR);
    var codeLangName = tokenSplit[0] || '';
    var fileName = tokenSplit.slice(1).join(' ');

    // 根据配置设置 code-lang 属性
    if (CODE_LANGUAGE_SHOW === 1) {
      token.attrPush(['code-lang', fileName || codeLangName]);
    } else if (CODE_LANGUAGE_SHOW === 2 && fileName) {
      token.attrPush(['code-lang', fileName]);
    }

    return original_fence(tokens, idx, options, env, slf);
  };

  // ========== 内容转换 ==========

  /**
   * 根据文件类型转换内容为 HTML
   * @param {string} filetype - 文件类型 (markdown, rst, textile, asciidoc)
   * @param {string} content - 原始内容
   * @returns {string} HTML 字符串
   */
  function transform(filetype, content) {
    if(hasTargetFileType(filetype, ['markdown', 'mkd'])) {
      return md.render(content);
    } else if(hasTargetFileType(filetype, ['rst'])) {
      // It has already been converted by rst2html.py
      return content;
    } else if(hasTargetFileType(filetype, ['textile'])) {
      return textile(content);
    } else if(hasTargetFileType(filetype, ['asciidoc'])) {
      return new Asciidoctor().convert(content, { attributes: { showtitle: true } });
    }
    return 'Sorry. It is a filetype(' + filetype + ') that is not support<br /><br />' + content;
  }

  function hasTargetFileType(filetype, targetList) {
    var ftlist = filetype.split('.');
    for(var i=0;i<ftlist.length; i++) {
      if(targetList.indexOf(ftlist[i]) > -1){
        return true;
      }
    }
    return false;
  }

  // ========== 滚动控制 ==========

  // NOTE: 实验性功能
  //   如果在此处动态获取 pageYOffset，会得到图片显示前的高度
  //   因此需要显式接收 pageYOffset 参数
  function autoScroll(id, pageYOffset) {
    var relaxed = 0.95;
    var obj = document.getElementById(id);
    if((_doc.documentElement.clientHeight + pageYOffset) / _doc.body.clientHeight > relaxed) {
      obj.scrollTop = obj.scrollHeight;
    } else {
      obj.scrollTop = pageYOffset;
    }
  }

  /**
   * 控制页眉显示/隐藏
   */
  function style_header() {
    if (typeof isShowHeader === 'function') {
      var style = isShowHeader() ? '' : 'none';
      _doc.getElementById('header').style.display = style;
    }
  }

  function formatLastModified(value) {
    if (typeof value !== 'string') {
      return value;
    }
    var match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})\s*\((.)\)\s*(\d{2}:\d{2}:\d{2})$/);
    if (!match) {
      return value;
    }
    var weekdayMap = {
      '日': '星期日',
      '一': '星期一',
      '二': '星期二',
      '三': '星期三',
      '四': '星期四',
      '五': '星期五',
      '六': '星期六'
    };
    var weekday = weekdayMap[match[4]] || match[4];
    return match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[5] + ' ' + weekday;
  }

  // ========== 预览加载 ==========

  /**
   * 加载并渲染预览内容
   * 检测文件名或修改时间变化后重新渲染
   * 
   * 依赖的外部函数（由 previm-function.js 动态生成）:
   * - getFileName(): 获取当前文件名
   * - getLastModified(): 获取最后修改时间
   * - getContent(): 获取文件内容
   * - getFileType(): 获取文件类型
   * - isShowHeader(): 是否显示页眉
   */
  function loadPreview() {
    var needReload = false;
    if (typeof getFileName === 'function') {
      if (_doc.getElementById('markdown-file-name').innerHTML !== getFileName()) {
        _doc.getElementById('markdown-file-name').innerHTML = getFileName();
        needReload = true;
      }
    } else {
      needReload = true;
    }
    if (typeof getLastModified === 'function') {
      if (_doc.getElementById('last-modified').innerHTML !== getLastModified()) {
        _doc.getElementById('last-modified').innerHTML = formatLastModified(getLastModified());
        needReload = true;
      }
    } else {
      needReload = true;
    }
    if (needReload && (typeof getContent === 'function') && (typeof getFileType === 'function')) {
      var beforePageYOffset = _win.pageYOffset;
      var previewContainer = _doc.getElementById('preview');
      if (shouldSkipRefresh(previewContainer)) {
        _win.setTimeout(loadPreview, REFRESH_INTERVAL);
        return;
      }

      previewContainer.innerHTML = transform(getFileType(), getContent());

      // 2. 渲染 mermaid 流程图
      mermaid.run();

      // 3. 渲染 PlantUML 图表
      loadPlantUML();

      // 4. 代码块语言标签
      if (CODE_LANGUAGE_SHOW > 0) {
        _doc.querySelectorAll('pre code').forEach(function(el) {
          var codeLang = el.getAttribute('code-lang');
          if (codeLang) {
            var langDiv = _doc.createElement('div');
            langDiv.className = 'code-lang';
            langDiv.innerHTML = '<span>' + codeLang + '</span>';
            el.parentNode.insertBefore(langDiv, el.parentNode.firstElementChild);
          }
        });
      }

      // 5. 代码高亮
      _doc.querySelectorAll('pre code').forEach(function(el) { hljs.highlightElement(el); });

      // 6. 若存在目录占位符则滚动顶部对齐
      var tocElement = _doc.querySelector('.previm-toc');
      if (tocElement && tocElement.previousElementSibling === null) {
        tocElement.scrollTop = 0;
      }

      // 7. 恢复滚动位置
      autoScroll('body', beforePageYOffset);
      style_header();
    }
  }

  // 检查预览区域是否存在非折叠选区
  function shouldSkipRefresh(container) {
    if (!container) {
      return false;
    }
    var selection = _win.getSelection ? _win.getSelection() : null;
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    var range = selection.getRangeAt(0);
    if (range.collapsed) {
      return false;
    }
    return container.contains(range.commonAncestorContainer);
  }

  // ========== 轮询机制 ==========

  // 每隔 REFRESH_INTERVAL 毫秒加载 previm-function.js 并刷新预览
  _win.setInterval(function() {
    var script = _doc.createElement('script');

    script.type = 'text/javascript';
    script.src = 'js/previm-function.js?t=' + new Date().getTime();

    _addEventListener(script, 'load', (function() {
      loadPreview();
      _win.setTimeout(function() {
        script.parentNode.removeChild(script);
      }, 160);
    })());

    _doc.getElementsByTagName('head')[0].appendChild(script);

  }, REFRESH_INTERVAL);

  // ========== 工具函数 ==========

  function _addEventListener(target, type, listener) {
    if (target.addEventListener) {
      target.addEventListener(type, listener, false);
    } else {
      // do nothing
    }
  }

  // ========== 启动 ==========

  // 页面加载时创建主题切换按钮并执行一次预览
  createThemeToggle();
  loadPreview();

})(document, window);
