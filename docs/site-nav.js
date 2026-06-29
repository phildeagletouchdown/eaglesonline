(() => {
  const pages = {
    index: "index.html",
    contact: "contact.html",
    shows: "shows.html",
    music: "music.html",
    merchandise: "merchandise.html",
    gallery: "gallery.html",
    ribbon: "HowToTieARibbon.html",
    archive: "archive.html"
  };
  const scriptUrl = document.currentScript
    ? new URL(document.currentScript.getAttribute("src"), document.baseURI)
    : new URL("site-nav.js", document.baseURI);
  const docsBase = new URL(".", scriptUrl);

  function docsPage(key) {
    const path = pages[key] || pages.index;
    return new URL(path, docsBase).href;
  }

  function syncLink(link, key) {
    link.href = docsPage(key);
  }

  document.querySelectorAll("[data-doc-page]").forEach((link) => {
    syncLink(link, link.dataset.docPage);
  });

  document.querySelectorAll("[data-home-link], .back-link").forEach((link) => {
    syncLink(link, "index");
  });

  window.siteNav = {
    docsPage
  };
})();
