'use strict';

(function(root, factory) {
  if (typeof exports === 'object' && typeof module === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.markdownitHeadingNumber = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  var defaultOptions = {
    level: [1, 2, 3, 4, 5, 6],
    numberingClass: 'heading-number',
    tocClass: 'previm-toc',
    tocListClass: 'previm-toc-list',
    tocItemClass: 'previm-toc-item',
    tocLinkClass: 'previm-toc-link',
    showNumberInToc: true,
    tocMarker: '[[toc]]'
  };

  function numberToChinese(num) {
    if (!num || num <= 0) {
      return '';
    }

    var cnNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    var cnUnits = ['', '十', '百', '千', '万', '十', '百', '千', '亿', '十', '百', '千', '兆'];
    var digits = String(num).split('');
    var len = digits.length;
    var result = '';

    for (var i = 0; i < len; i++) {
      var digit = parseInt(digits[i], 10);
      var unitIndex = len - i - 1;

      if (digit === 0) {
        if (result && result.charAt(result.length - 1) !== cnNums[0]) {
          result += cnNums[0];
        }
      } else {
        result += cnNums[digit] + (cnUnits[unitIndex] || '');
      }
    }

    result = result.replace(/零+/g, '零');
    result = result.replace(/零$/g, '');
    result = result.replace(/^一十/, '十');

    return result || cnNums[0];
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^0-9a-z\u4e00-\u9fa5\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function createMarkerPattern(marker) {
    return new RegExp('^\\s*' + escapeRegExp(marker) + '\\s*$', 'i');
  }

  function buildTree(headings) {
    var root = { level: 0, children: [] };
    var stack = [root];

    headings.forEach(function(heading) {
      var node = { heading: heading, children: [] };

      while (stack.length > 1 && heading.level <= stack[stack.length - 1].heading.level) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

    return root;
  }

  function renderNodes(md, nodes, opts) {
    if (!nodes.length) {
      return '';
    }

    var level = nodes[0].heading.level;
    var html = '<ol class="' + opts.tocListClass + ' level-' + level + '">';

    nodes.forEach(function(node) {
      var heading = node.heading;
      html += '<li class="' + opts.tocItemClass + ' level-' + heading.level + '">';
      html += '<a class="' + opts.tocLinkClass + '" href="#' + heading.id + '">';
      if (opts.showNumberInToc) {
        html += '<span class="' + opts.numberingClass + '">' + md.utils.escapeHtml(heading.numbering) + '</span> ';
      }
      html += md.utils.escapeHtml(heading.title) + '</a>';
      html += renderNodes(md, node.children, opts);
      html += '</li>';
    });

    html += '</ol>';
    return html;
  }

  function renderToc(md, headings, opts) {
    if (!headings.length) {
      return '';
    }

    var tree = buildTree(headings);
    var html = '<nav class="' + opts.tocClass + '">';
    html += renderNodes(md, tree.children, opts);
    html += '</nav>';
    return html;
  }

  function plugin(md, options) {
    var opts = {};
    for (var key in defaultOptions) {
      if (Object.prototype.hasOwnProperty.call(defaultOptions, key)) {
        opts[key] = defaultOptions[key];
      }
    }
    options = options || {};
    for (var optKey in options) {
      if (Object.prototype.hasOwnProperty.call(options, optKey)) {
        opts[optKey] = options[optKey];
      }
    }

    var markerPattern = options.markerPattern || createMarkerPattern(opts.tocMarker);

    md.core.ruler.push('heading_number_toc', function(state) {
      var tokens = state.tokens;
      if (!tokens || !tokens.length) {
        return;
      }

      var counters = [0, 0, 0, 0, 0, 0];
      var headings = [];
      var slugState = Object.create(null);

      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];

        if (token.type !== 'heading_open') {
          continue;
        }

        var level = parseInt(token.tag.slice(1), 10);
        if (opts.level.indexOf(level) === -1) {
          continue;
        }

        counters[level - 1] += 1;
        for (var reset = level; reset < counters.length; reset++) {
          counters[reset] = 0;
        }

        var numberingParts = [];
        for (var partIdx = 0; partIdx < level; partIdx++) {
          if (counters[partIdx] > 0) {
            numberingParts.push(counters[partIdx]);
          }
        }
        var numbering = numberingParts.join('.');
        if (!numbering && numberingParts.length === 1) {
          numbering = String(numberingParts[0]);
        }

        var displayNumber = level === 1
          ? numberToChinese(counters[0]) + '、'
          : numbering;

        token.attrSet('data-heading-number', numbering);

        var inlineToken = tokens[i + 1];
        if (!inlineToken || inlineToken.type !== 'inline') {
          continue;
        }

        var title = inlineToken.content.trim();
        var slugBase = slugify((numbering || String(counters[0])) + '-' + title);
        if (!slugBase) {
          slugBase = 'heading-' + numbering.replace(/\.+/g, '-') || 'heading';
        }
        var slug = slugBase;
        if (slugState[slug]) {
          var seq = 2;
          while (slugState[slugBase + '-' + seq]) {
            seq += 1;
          }
          slug = slugBase + '-' + seq;
        }
        slugState[slug] = true;

        if (!token.attrGet('id')) {
          token.attrSet('id', slug);
        }

        var numberOpen = new state.Token('span_open', 'span', 1);
        numberOpen.attrSet('class', opts.numberingClass);
        var numberText = new state.Token('text', '', 0);
        numberText.content = displayNumber;
        var numberClose = new state.Token('span_close', 'span', -1);
        var trailingSpace = new state.Token('text', '', 0);
        trailingSpace.content = ' ';

        inlineToken.children = inlineToken.children || [];
        inlineToken.children.unshift(trailingSpace);
        inlineToken.children.unshift(numberClose);
        inlineToken.children.unshift(numberText);
        inlineToken.children.unshift(numberOpen);
        inlineToken.content = displayNumber + ' ' + inlineToken.content;

        headings.push({
          level: level,
          numbering: displayNumber,
          title: title,
          id: token.attrGet('id')
        });
      }

      for (var j = 0; j < tokens.length; j++) {
        var inline = tokens[j];
        if (inline.type !== 'inline' || !inline.children) {
          continue;
        }

        for (var k = 0; k < inline.children.length; k++) {
          var child = inline.children[k];
          if (child.type !== 'text') {
            continue;
          }

          if (!markerPattern.test(child.content)) {
            continue;
          }

          var prevToken = tokens[j - 1];
          var nextToken = tokens[j + 1];
          var tocHtml = renderToc(md, headings, opts);
          var tocBlock = new state.Token('html_block', '', 0);
          tocBlock.content = tocHtml;

          if (prevToken && prevToken.type === 'paragraph_open' && nextToken && nextToken.type === 'paragraph_close') {
            tokens.splice(j - 1, 3, tocBlock);
            j -= 1;
          } else {
            tokens.splice(j, 1, tocBlock);
          }
          break;
        }
      }
    });
  }

  return plugin;
});
