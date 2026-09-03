/* MCP Docs Mirror — site behavior: nav toggle, search filter, copy, highlight, mermaid */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // 移动端侧边栏
    var toggle = document.getElementById("navToggle");
    var sidebar = document.getElementById("sidebar");
    if (toggle && sidebar) {
      toggle.addEventListener("click", function () {
        sidebar.classList.toggle("open");
      });
      document.addEventListener("click", function (e) {
        if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
          sidebar.classList.remove("open");
        }
      });
    }

    // 搜索过滤侧边栏
    var search = document.getElementById("searchInput");
    if (search) {
      search.addEventListener("input", function () {
        var q = search.value.trim().toLowerCase();
        var links = document.querySelectorAll("#sidebar a[data-title]");
        links.forEach(function (a) {
          var title = (a.getAttribute("data-title") || "").toLowerCase();
          var match = !q || title.indexOf(q) !== -1 || a.getAttribute("href").indexOf(q) !== -1;
          a.classList.toggle("hidden", !match);
        });
        // 隐藏无可见子项的容器
        document.querySelectorAll("#sidebar .nav-group").forEach(function (g) {
          var any = g.querySelectorAll("a[data-title]:not(.hidden)").length > 0;
          g.classList.toggle("hidden", !any);
        });
        if (document.querySelector(".ao-toc")) {
          document.querySelectorAll(".ao-toc li").forEach(function (li) {
            var a = li.querySelector("a");
            li.style.display = a && !a.classList.contains("hidden") ? "" : "none";
          });
        }
      });
    }
  });

  // 页面完全加载后（等待 CDN 脚本）初始化高亮 / mermaid / 复制按钮
  window.addEventListener("load", function () {
    // 代码高亮
    try {
      if (window.hljs) {
        document.querySelectorAll("pre.code code[class*='language-']").forEach(function (el) {
          try { hljs.highlightElement(el); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }

    // 复制按钮
    document.querySelectorAll("pre.code").forEach(function (pre) {
      if (pre.querySelector(".code-copy")) return;
      var btn = document.createElement("button");
      btn.className = "code-copy";
      btn.textContent = "Copy";
      btn.addEventListener("click", function () {
        var text = pre.innerText.replace(/\nCopy$/, "");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { btn.textContent = "Copied!"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); },
            function () { btn.textContent = "Failed"; }
          );
        }
      });
      pre.appendChild(btn);
    });

    // mermaid 图
    try {
      if (window.mermaid) {
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        mermaid.run({ nodes: document.querySelectorAll(".mermaid") });
      }
    } catch (e) { /* CDN 不可用时保留源码文本 */ }
  });
})();