/* Locale detection: browser language + optional geo + saved preference */
(function (global) {
  "use strict";

  const STORAGE_KEY = "tapRoarLocale";
  let catalog = null;
  let activeLocale = "en";
  let pack = null;

  async function loadCatalog() {
    if (catalog) return catalog;
    const res = await fetch("stories/catalog.json");
    if (!res.ok) throw new Error("Could not load story catalog");
    catalog = await res.json();
    return catalog;
  }

  function languageFromNavigator() {
    const lang = (navigator.language || "en").toLowerCase();
    const base = lang.split("-")[0];
    return { full: lang, base };
  }

  async function guessCountryCode() {
    try {
      const res = await fetch("https://ipapi.co/country_code/", { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const code = (await res.text()).trim().toUpperCase();
      return code.length === 2 ? code : null;
    } catch {
      return null;
    }
  }

  async function resolveLocale(preferred) {
    await loadCatalog();
    if (preferred && catalog.locales[preferred]) return preferred;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && catalog.locales[saved]) return saved;

    const { base } = languageFromNavigator();
    if (catalog.languageToLocale[base]) return catalog.languageToLocale[base];

    const country = await guessCountryCode();
    if (country && catalog.regionToLocale[country]) return catalog.regionToLocale[country];

    return catalog.defaultLocale || "en";
  }

  async function loadPack(localeCode) {
    await loadCatalog();
    const code = catalog.locales[localeCode] ? localeCode : catalog.defaultLocale;
    const meta = catalog.locales[code];
    let res = await fetch(meta.file);
    if (!res.ok && code !== catalog.defaultLocale) {
      activeLocale = catalog.defaultLocale;
      res = await fetch(catalog.locales[activeLocale].file);
    } else {
      activeLocale = code;
    }
    if (!res.ok) throw new Error("Could not load stories for " + code);
    pack = await res.json();
    return pack;
  }

  async function init(preferred) {
    const locale = await resolveLocale(preferred);
    await loadPack(locale);
    return { locale: activeLocale, pack };
  }

  async function setLocale(localeCode) {
    localStorage.setItem(STORAGE_KEY, localeCode);
    await loadPack(localeCode);
    return { locale: activeLocale, pack };
  }

  function getSpeechLang() {
    if (!catalog) return "en-US";
    const meta = catalog.locales[activeLocale] || catalog.locales[catalog.defaultLocale];
    return meta.speechLang || "en-US";
  }

  function listLocales() {
    if (!catalog) return [];
    return Object.entries(catalog.locales).map(([code, meta]) => ({
      code,
      label: meta.label
    }));
  }

  function t(key) {
    if (!pack || !pack.ui) return key;
    return pack.ui[key] || key;
  }

  function fill(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
  }

  global.TapRoarLocale = {
    init,
    setLocale,
    getSpeechLang,
    listLocales,
    t,
    fill,
    get activeLocale() {
      return activeLocale;
    },
    get pack() {
      return pack;
    },
    get catalog() {
      return catalog;
    }
  };
})(window);
