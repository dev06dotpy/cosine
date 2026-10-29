(() => {
    "use strict";

    const STORAGE_KEY = "forecast-theme";

    const root = document.documentElement;

    const toggle =
        document.getElementById("themeToggle");

    const icon =
        document.getElementById("themeToggleIcon");


    function getPreferredTheme() {
        const savedTheme =
            localStorage.getItem(STORAGE_KEY);

        if (
            savedTheme === "dark" ||
            savedTheme === "light"
        ) {
            return savedTheme;
        }

        return window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches
            ? "dark"
            : "light";
    }


    function applyTheme(theme) {
        root.dataset.theme = theme;

        const darkMode =
            theme === "dark";

        if (icon) {
            icon.textContent =
                darkMode
                    ? "☀"
                    : "☾";
        }

        if (toggle) {
            toggle.setAttribute(
                "aria-label",
                darkMode
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            );

            toggle.title =
                darkMode
                    ? "Light mode"
                    : "Dark mode";
        }
    }


    function toggleTheme() {
        const currentTheme =
            root.dataset.theme;

        const newTheme =
            currentTheme === "dark"
                ? "light"
                : "dark";

        localStorage.setItem(
            STORAGE_KEY,
            newTheme
        );

        applyTheme(newTheme);
    }


    applyTheme(
        getPreferredTheme()
    );


    toggle?.addEventListener(
        "click",
        toggleTheme
    );
})();