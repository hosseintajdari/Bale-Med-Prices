const SURFACE_QUERY =
  new URLSearchParams(window.location.search).get("surface") === "telegram";

function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramMiniApp() {
  const telegram = getTelegramWebApp();
  return Boolean(telegram?.initData) || SURFACE_QUERY;
}

function applyThemeParams(telegram) {
  const theme = telegram?.themeParams ?? {};
  const root = document.documentElement;

  if (theme.bg_color) {
    root.style.setProperty("--tg-bg", theme.bg_color);
    root.style.setProperty("--page-bg", theme.bg_color);
  }

  if (theme.text_color) {
    root.style.setProperty("--tg-text", theme.text_color);
    root.style.setProperty("--ink", theme.text_color);
  }

  if (theme.hint_color) {
    root.style.setProperty("--tg-hint", theme.hint_color);
    root.style.setProperty("--muted", theme.hint_color);
  }

  if (theme.button_color) {
    root.style.setProperty("--tg-button", theme.button_color);
    root.style.setProperty("--accent", theme.button_color);
  }

  if (theme.button_text_color) {
    root.style.setProperty("--tg-button-text", theme.button_text_color);
  }

  if (theme.secondary_bg_color) {
    root.style.setProperty("--tg-secondary-bg", theme.secondary_bg_color);
    root.style.setProperty("--search-bg", theme.secondary_bg_color);
    root.style.setProperty("--pricing-bg", theme.secondary_bg_color);
  }

  if (telegram?.colorScheme === "dark") {
    root.classList.add("telegram-dark");
  }
}

export function setMainButtonVisible(visible) {
  const telegram = getTelegramWebApp();

  if (!telegram?.MainButton) {
    return;
  }

  if (visible) {
    telegram.MainButton.show();
  } else {
    telegram.MainButton.hide();
  }
}

export function setMainButtonLoading(isLoading) {
  const telegram = getTelegramWebApp();

  if (!telegram?.MainButton) {
    return;
  }

  if (isLoading) {
    telegram.MainButton.showProgress();
  } else {
    telegram.MainButton.hideProgress();
  }
}

export function initTelegramSurface(handlers = {}) {
  if (!isTelegramMiniApp()) {
    return false;
  }

  const telegram = getTelegramWebApp();
  document.documentElement.classList.add("telegram-mini-app");

  if (telegram) {
    telegram.ready();
    telegram.expand();
    applyThemeParams(telegram);

    if (telegram.setHeaderColor && telegram.themeParams?.bg_color) {
      telegram.setHeaderColor(telegram.themeParams.bg_color);
    }

    if (telegram.setBackgroundColor && telegram.themeParams?.bg_color) {
      telegram.setBackgroundColor(telegram.themeParams.bg_color);
    }

    if (telegram.MainButton && typeof handlers.onRecalculate === "function") {
      telegram.MainButton.setText("بروزرسانی قیمت");
      telegram.MainButton.onClick(handlers.onRecalculate);
      telegram.MainButton.hide();
    }
  }

  return true;
}
