(function () {
  const toast = document.getElementById("toast");
  let toastTimer;

  function fullUrl(path) {
    return window.location.origin + path;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
      toastTimer = setTimeout(function () {
        toast.hidden = true;
      }, 280);
    }, 1600);
  }

  function setCopiedState(el) {
    el.classList.add("is-copied");
    const label = el.querySelector(".copy-label");
    const prev = label ? label.textContent : el.textContent;
    if (label) {
      label.textContent = "Copied";
    } else if (el.matches(".btn")) {
      el.dataset.prevLabel = prev.trim();
      el.textContent = "Copied!";
    }
    setTimeout(function () {
      el.classList.remove("is-copied");
      if (label) {
        label.textContent = "Copy";
      } else if (el.dataset.prevLabel) {
        el.textContent = el.dataset.prevLabel;
        delete el.dataset.prevLabel;
      }
    }, 1600);
  }

  async function copyPath(path, trigger) {
    const text = fullUrl(path);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      if (trigger) setCopiedState(trigger);
      showToast("Copied to clipboard");
    } catch (err) {
      showToast("Copy failed");
    }
  }

  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-copy-path]");
    if (!btn) return;
    e.preventDefault();
    copyPath(btn.getAttribute("data-copy-path"), btn);
  });
})();
